import { curatePalette } from "../core/scoreAndCluster.js";
import { assignRoles } from "../core/assignRoles.js";
import { curateFonts } from "../core/curateFonts.js";
import { copyPaletteImage, readPageMetaFromTab } from "./exportPaletteImage.js";
import { buildBentoRows, isLightSwatch } from "./paletteLayout.js";
import { getTargetTab } from "./tabs.js";
import {
  ERROR_MESSAGES,
  ERROR_BANNER_TITLE,
  GUIDANCE_COPY,
  classifyExtractionError,
  isExtractionResultEmpty,
  isFontExtractionEmpty,
  isRestrictedPopupContext,
  isUnsupportedPageUrl,
  normalizeUserMessage
} from "./errors.js";

const appEl = document.querySelector(".app");
const introEl = document.getElementById("intro");
const colorResultsEl = document.getElementById("colorResults");
const fontResultsEl = document.getElementById("fontResults");
const loadingEl = document.getElementById("loading");
const loadingTextEl = document.getElementById("loadingText");
const errorBannerEl = document.getElementById("errorBanner");
const errorMessageEl = document.getElementById("errorMessage");
const errorBannerTitleEl = document.getElementById("errorBannerTitle");
const errorBannerIconEl = document.getElementById("errorBannerIcon");
const extractBtn = document.getElementById("extractBtn");
const extractBtnIcon = document.getElementById("extractBtnIcon");
const extractBtnLabel = document.getElementById("extractBtnLabel");
const panelFooterEl = document.querySelector(".panel-footer");
const introDescEl = document.getElementById("introDesc");
const resultsFooterEl = document.getElementById("resultsFooter");
const copyBtn = document.getElementById("copyBtn");
const copyBtnLabel = document.getElementById("copyBtnLabel");
const copyBtnIcon = document.getElementById("copyBtnIcon");
const resetBtn = document.getElementById("resetBtn");
const closeBtn = document.getElementById("closeBtn");
const statusEl = document.getElementById("status");
const swatchesEl = document.getElementById("swatches");
const fontsEl = document.getElementById("fonts");
const tabBarEl = document.getElementById("tabBar");
const tabColorsBtn = document.getElementById("tabColors");
const tabFontsBtn = document.getElementById("tabFonts");
const panelHeaderEl = document.querySelector(".panel-header");
const dragHandleEl = document.getElementById("dragHandle");

const isEmbedded = window.parent !== window;
const EXTRACTION_TIMEOUT_MS = 22000;
const STANDALONE_WINDOW_CHROME_X = 16;
const STANDALONE_WINDOW_CHROME_Y = 40;

const MODE_COPY = {
  colors: {
    extractLabel: "Extract color palette",
    extractIcon: "palette",
    copyLabel: "Copy to clipboard",
    intro: "Extract the color palette used on this webpage",
    loadingStart: "Scanning colors on the page…",
    loadingBuild: "Creating the color palette…"
  },
  fonts: {
    extractLabel: "Extract font families",
    extractIcon: "text_fields",
    intro: "Extract the font families used on this webpage",
    loadingStart: "Scanning font families on the page…",
    loadingBuild: "Identifying used font families…"
  }
};

let activeMode = "colors";
let currentPalette = [];
let currentFonts = [];
let highlightedFontFamily = null;
let exportPageMeta = { title: "", siteName: "", hostname: "", url: "", iconDataUrl: "" };
let copyFeedbackTimer = null;

const COPY_LABEL_COPIED = "Copied! Paste in Figma";
const COPY_LABEL_FAILED = "Copy failed";
const COPY_ICON_DEFAULT = "content_copy";
const COPY_ICON_COPIED = "check";
const COPY_ICON_FAILED = "error";

function reportHeight() {
  if (isEmbedded) {
    const app = document.querySelector(".app");
    const height = app ? Math.ceil(app.getBoundingClientRect().height) : document.body.offsetHeight;
    window.parent.postMessage({ type: "prism-resize", height }, "*");
    return;
  }
  resizeStandaloneWindow();
}

function resizeStandaloneWindow() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const app = document.querySelector(".app");
      if (!app) return;

      const windowWidth = Math.ceil(app.offsetWidth) + STANDALONE_WINDOW_CHROME_X;
      const windowHeight = Math.ceil(app.offsetHeight) + STANDALONE_WINDOW_CHROME_Y;

      chrome.windows.getCurrent((win) => {
        if (win?.id) {
          chrome.windows.update(win.id, {
            width: Math.min(Math.max(windowWidth, 320), 480),
            height: Math.min(Math.max(windowHeight, 180), 720)
          });
        }
      });
    });
  });
}

function initPanelDrag() {
  if (!panelHeaderEl) return;

  if (dragHandleEl) dragHandleEl.hidden = false;

  let dragging = false;
  let lastScreenX = 0;
  let lastScreenY = 0;

  panelHeaderEl.addEventListener("pointerdown", (event) => {
    // Only start dragging on a primary-button press over the header itself,
    // never over the close button or other interactive controls.
    if (event.button !== 0 || event.target.closest("button")) return;

    dragging = true;
    lastScreenX = event.screenX;
    lastScreenY = event.screenY;
    panelHeaderEl.classList.add("is-dragging");
    // Pointer capture keeps move/up events flowing to the iframe even when the
    // cursor travels over the host page outside the panel bounds.
    panelHeaderEl.setPointerCapture?.(event.pointerId);
    window.parent.postMessage({ type: "prism-drag-start" }, "*");
    event.preventDefault();
  });

  panelHeaderEl.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    // Screen coordinates are frame-independent, so moving the panel does not
    // feed back into the delta.
    const dx = event.screenX - lastScreenX;
    const dy = event.screenY - lastScreenY;
    lastScreenX = event.screenX;
    lastScreenY = event.screenY;
    if (dx !== 0 || dy !== 0) {
      window.parent.postMessage({ type: "prism-drag-move", dx, dy }, "*");
    }
  });

  const stopDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    panelHeaderEl.classList.remove("is-dragging");
    try {
      panelHeaderEl.releasePointerCapture?.(event.pointerId);
    } catch {
      /* pointer already released */
    }
    window.parent.postMessage({ type: "prism-drag-end" }, "*");
  };

  panelHeaderEl.addEventListener("pointerup", stopDrag);
  panelHeaderEl.addEventListener("pointercancel", stopDrag);
}

if (isEmbedded) {
  document.body.classList.add("embedded");
  closeBtn.hidden = false;
  closeBtn.addEventListener("click", () => {
    window.parent.postMessage({ type: "prism-close" }, "*");
  });
  initPanelDrag();
  if (appEl) new ResizeObserver(reportHeight).observe(appEl);
  window.addEventListener("load", reportHeight);
  window.addEventListener("message", (event) => {
    if (event.data?.type === "prism-request-resize") reportHeight();
  });
  reportHeight();
} else {
  document.body.classList.add("standalone-window");
  if (appEl) new ResizeObserver(resizeStandaloneWindow).observe(appEl);
  window.addEventListener("load", () => {
    resizeStandaloneWindow();
    setTimeout(resizeStandaloneWindow, 150);
  });
}

function modeConfig(mode = activeMode) {
  return MODE_COPY[mode] || MODE_COPY.colors;
}

function setCopyButtonState(label, iconName = COPY_ICON_DEFAULT) {
  if (copyBtnLabel) copyBtnLabel.textContent = label;
  if (copyBtnIcon) {
    copyBtnIcon.textContent = iconName;
    copyBtnIcon.hidden = false;
  }
  reportHeight();
}

function flashCopyFeedback(success) {
  clearTimeout(copyFeedbackTimer);
  setCopyButtonState(
    success ? COPY_LABEL_COPIED : COPY_LABEL_FAILED,
    success ? COPY_ICON_COPIED : COPY_ICON_FAILED
  );
  copyFeedbackTimer = setTimeout(() => {
    setCopyButtonState(modeConfig().copyLabel, COPY_ICON_DEFAULT);
  }, 3500);
}

function applyTabVisuals() {
  if (tabBarEl) tabBarEl.dataset.active = activeMode;

  if (tabColorsBtn && tabFontsBtn) {
    tabColorsBtn.classList.toggle("is-active", activeMode === "colors");
    tabFontsBtn.classList.toggle("is-active", activeMode === "fonts");
    tabColorsBtn.setAttribute("aria-selected", activeMode === "colors" ? "true" : "false");
    tabFontsBtn.setAttribute("aria-selected", activeMode === "fonts" ? "true" : "false");
  }
}

function updateModeChrome() {
  const config = modeConfig();
  appEl.classList.toggle("mode-colors", activeMode === "colors");
  appEl.classList.toggle("mode-fonts", activeMode === "fonts");

  if (extractBtnLabel) extractBtnLabel.textContent = config.extractLabel;
  if (extractBtnIcon) extractBtnIcon.textContent = config.extractIcon;
  if (introDescEl) introDescEl.textContent = config.intro;

  applyTabVisuals();

  if (!copyFeedbackTimer && activeMode === "colors" && config.copyLabel) {
    setCopyButtonState(config.copyLabel, COPY_ICON_DEFAULT);
  }

  updateFooterForMode();
}

function updateFooterForMode() {
  const inResults = appEl.classList.contains("state-results");

  if (activeMode === "fonts" && inResults) {
    copyBtn.hidden = true;
    resetBtn.classList.add("btn-primary");
    resetBtn.classList.remove("btn-secondary");
  } else {
    copyBtn.hidden = false;
    resetBtn.classList.remove("btn-primary");
    resetBtn.classList.add("btn-secondary");
  }
}

function hasResultsForMode(mode) {
  return mode === "colors" ? currentPalette.length > 0 : currentFonts.length > 0;
}

function clearError() {
  if (errorBannerEl) {
    errorBannerEl.hidden = true;
    errorBannerEl.classList.remove("is-guidance");
  }
  if (errorMessageEl) errorMessageEl.textContent = "";
  if (errorBannerTitleEl) errorBannerTitleEl.textContent = "";
  if (errorBannerIconEl) errorBannerIconEl.textContent = "info";
  appEl.classList.remove("state-guidance");
}

function showBanner(message, { guidance = false, title } = {}) {
  setLoading(false);
  appEl.classList.remove("state-results");
  appEl.classList.add("state-intro");
  appEl.classList.toggle("state-guidance", guidance);
  introEl.hidden = false;
  colorResultsEl.hidden = true;
  fontResultsEl.hidden = true;
  resultsFooterEl.classList.remove("is-visible");

  if (panelFooterEl) panelFooterEl.hidden = guidance;
  if (introDescEl) introDescEl.hidden = guidance;
  if (tabBarEl) tabBarEl.hidden = guidance;

  const bannerTitle = title || (guidance ? GUIDANCE_COPY.title : ERROR_BANNER_TITLE);
  const bannerMessage = guidance ? GUIDANCE_COPY.message : message;

  if (errorBannerTitleEl) errorBannerTitleEl.textContent = bannerTitle;
  if (errorMessageEl) errorMessageEl.textContent = bannerMessage;
  if (errorBannerEl) {
    errorBannerEl.hidden = false;
    errorBannerEl.classList.toggle("is-guidance", guidance);
  }
  if (errorBannerIconEl) {
    errorBannerIconEl.textContent = guidance ? "lightbulb" : "info";
  }

  statusEl.textContent = "";
  updateFooterForMode();
  reportHeight();
  if (!isEmbedded && guidance) {
    setTimeout(resizeStandaloneWindow, 0);
    setTimeout(resizeStandaloneWindow, 150);
  }
}

function showError(error, context = {}) {
  const message = classifyExtractionError(error, context);
  showBanner(message, { guidance: false });
}

function setIntroState() {
  appEl.classList.remove("state-results", "state-guidance");
  appEl.classList.add("state-intro");
  introEl.hidden = false;
  colorResultsEl.hidden = true;
  fontResultsEl.hidden = true;
  resultsFooterEl.classList.remove("is-visible");
  if (panelFooterEl) panelFooterEl.hidden = false;
  if (introDescEl) introDescEl.hidden = false;
  if (tabBarEl) tabBarEl.hidden = false;
  clearError();
  updateFooterForMode();
}

function setResultsState() {
  appEl.classList.remove("state-intro");
  appEl.classList.add("state-results");
  introEl.hidden = true;
  colorResultsEl.hidden = activeMode !== "colors";
  fontResultsEl.hidden = activeMode !== "fonts";
  resultsFooterEl.classList.add("is-visible");
  if (tabBarEl) tabBarEl.hidden = false;
  clearError();
  updateFooterForMode();
}

function setLoading(active, message) {
  const config = modeConfig();
  appEl.classList.toggle("is-loading", active);
  loadingEl.hidden = !active;
  loadingTextEl.textContent = message || config.loadingStart;
  if (active) {
    clearError();
    introEl.hidden = true;
    colorResultsEl.hidden = true;
    fontResultsEl.hidden = true;
    if (tabBarEl) tabBarEl.hidden = false;
  }

  reportHeight();
  if (active) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => reportHeight());
    });
  }
}

function resetCurrentMode() {
  clearTimeout(copyFeedbackTimer);
  setCopyButtonState(modeConfig().copyLabel, COPY_ICON_DEFAULT);

  if (activeMode === "fonts") {
    clearFontHighlightOnPage();
  }

  if (activeMode === "colors") {
    currentPalette = [];
    swatchesEl.innerHTML = "";
    statusEl.textContent = "";
  } else {
    currentFonts = [];
    fontsEl.innerHTML = "";
  }

  if (hasResultsForMode(activeMode)) {
    setResultsState();
  } else {
    setIntroState();
  }
  reportHeight();
}

function renderSwatches(swatches) {
  swatchesEl.innerHTML = "";

  for (const { tiles, height } of buildBentoRows(swatches)) {
    const row = document.createElement("div");
    row.className = "bento-row";
    row.style.height = `${height}px`;

    for (const swatch of tiles) {
      const tile = document.createElement("article");
      tile.className = `swatch role-${swatch.role}`;
      if (isLightSwatch(swatch.hex)) tile.classList.add("swatch-light");
      tile.dataset.tooltip = swatch.hex;
      tile.setAttribute("aria-label", swatch.hex);
      tile.style.backgroundColor = swatch.hex;
      row.appendChild(tile);
    }

    swatchesEl.appendChild(row);
  }
}

function flashFontCopyFeedback(button, success) {
  if (!button) return;

  clearTimeout(button._copyFeedbackTimer);

  const previousHtml = button.innerHTML;
  const previousTitle = button.title;
  const label = success ? COPY_LABEL_COPIED : COPY_LABEL_FAILED;

  button.innerHTML = `<span class="font-copy-label">${label}</span>`;
  button.classList.add("is-feedback");
  button.title = label;

  button._copyFeedbackTimer = window.setTimeout(() => {
    button.innerHTML = previousHtml;
    button.title = previousTitle;
    button.classList.remove("is-feedback");
    button._copyFeedbackTimer = null;
  }, 2000);
}

async function runHighlightScript(callback, args = []) {
  const tab = await getTargetTab();
  if (!tab?.id || isUnsupportedPageUrl(tab.url || "")) return null;

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["src/content/highlightFont.js"]
  });

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: callback,
    args
  });

  return injection?.result ?? null;
}

async function clearFontHighlightOnPage() {
  try {
    await runHighlightScript(() => window.__prismClearFontHighlight());
  } catch {
    /* tab may be unavailable */
  }
  setHighlightedFontCard(null);
}

function setHighlightedFontCard(family) {
  highlightedFontFamily = family || null;
  fontsEl?.querySelectorAll(".font-card").forEach((card) => {
    const active = Boolean(family && card.dataset.fontFamily === family);
    const checkbox = card.querySelector(".font-select-checkbox");
    if (checkbox) checkbox.checked = active;
  });
}

async function selectFontHighlight(family, selected) {
  if (!selected) {
    if (highlightedFontFamily === family) {
      await clearFontHighlightOnPage();
    }
    return;
  }

  if (highlightedFontFamily === family) return;

  const previousFamily = highlightedFontFamily;

  try {
    const result = await runHighlightScript((fontFamily) => window.__prismHighlightFont(fontFamily), [family]);
    if (!result || result.count === 0) {
      const card = fontsEl?.querySelector(`[data-font-family="${CSS.escape(family)}"]`);
      const checkbox = card?.querySelector(".font-select-checkbox");
      if (checkbox) checkbox.checked = false;

      if (previousFamily) {
        await runHighlightScript((fontFamily) => window.__prismHighlightFont(fontFamily), [previousFamily]);
        setHighlightedFontCard(previousFamily);
      } else {
        await clearFontHighlightOnPage();
      }

      showBanner(`No visible text found for “${family}” on this page.`, { guidance: false });
      return;
    }
    setHighlightedFontCard(family);
  } catch (error) {
    const card = fontsEl?.querySelector(`[data-font-family="${CSS.escape(family)}"]`);
    const checkbox = card?.querySelector(".font-select-checkbox");
    if (checkbox) checkbox.checked = false;

    if (previousFamily) {
      try {
        await runHighlightScript((fontFamily) => window.__prismHighlightFont(fontFamily), [previousFamily]);
        setHighlightedFontCard(previousFamily);
      } catch {
        await clearFontHighlightOnPage();
      }
    } else {
      await clearFontHighlightOnPage();
    }

    const message = normalizeUserMessage(error?.message) || ERROR_MESSAGES.INJECTION_FAILED;
    showBanner(message, { guidance: false });
  }
}

async function copyFontFamily(family, button) {
  try {
    await navigator.clipboard.writeText(family);
    flashFontCopyFeedback(button, true);
  } catch (error) {
    const message = normalizeUserMessage(error?.message) || ERROR_MESSAGES.COPY_FAILED;
    showBanner(message, { guidance: false });
    flashFontCopyFeedback(button, false);
  }
}

function renderFonts(fonts) {
  fontsEl.innerHTML = "";
  const activeHighlight = highlightedFontFamily;

  for (const font of fonts) {
    const card = document.createElement("article");
    card.className = "font-card";
    card.dataset.fontFamily = font.family;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "font-select-checkbox";
    checkbox.checked = activeHighlight === font.family;
    checkbox.setAttribute("aria-label", `Highlight text using ${font.family}`);
    checkbox.addEventListener("change", () => {
      selectFontHighlight(font.family, checkbox.checked);
    });

    const titleRow = document.createElement("div");
    titleRow.className = "font-title-row";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "font-copy-btn";
    copyButton.setAttribute("aria-label", `Copy ${font.family}`);
    copyButton.title = "Copy font family";
    copyButton.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">content_copy</span>';
    copyButton.addEventListener("click", () => {
      copyFontFamily(font.family, copyButton);
    });

    const sample = document.createElement("p");
    sample.className = "font-sample";
    sample.textContent = font.family;

    const weights = document.createElement("p");
    weights.className = "font-weights";
    weights.textContent = `Weights: ${font.weightsLabel || font.weight || 400}`;

    titleRow.append(checkbox, sample);
    card.append(copyButton, titleRow, weights);
    fontsEl.appendChild(card);
  }
}

function switchMode(mode) {
  if ((mode !== "colors" && mode !== "fonts") || mode === activeMode) return;

  appEl.classList.add("is-switching");

  if (activeMode === "fonts" && mode === "colors") {
    clearFontHighlightOnPage();
  }

  activeMode = mode;
  applyTabVisuals();

  const config = modeConfig();
  appEl.classList.toggle("mode-colors", activeMode === "colors");
  appEl.classList.toggle("mode-fonts", activeMode === "fonts");
  if (extractBtnLabel) extractBtnLabel.textContent = config.extractLabel;
  if (extractBtnIcon) extractBtnIcon.textContent = config.extractIcon;
  if (introDescEl) introDescEl.textContent = config.intro;

  if (hasResultsForMode(mode)) {
    setResultsState();
  } else {
    setIntroState();
  }

  updateFooterForMode();

  // Commit the new footer styles with transitions disabled so the shared
  // reset/copy buttons swap instantly instead of animating (flicker).
  void appEl.offsetWidth;
  appEl.classList.remove("is-switching");

  reportHeight();
}

async function runExtractionOnTab(tab) {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["src/content/extractInPage.js"]
  });

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async () =>
      window.__prismExtractPalette({
        maxMillis: 18000,
        maxElementsPerSection: 1800
      })
  });

  if (!injection) {
    const err = new Error("Script injection returned no result.");
    err.injectionFailed = true;
    throw err;
  }

  return injection.result;
}

async function extractColors() {
  const config = modeConfig("colors");
  clearError();
  setLoading(true, config.loadingStart);

  const tab = await getTargetTab();
  if (!tab?.id) {
    showError(null, { noTab: true });
    return;
  }

  const tabUrl = tab.url || "";
  if (isUnsupportedPageUrl(tabUrl)) {
    showError(null, { unsupportedPage: true });
    return;
  }

  exportPageMeta = await readPageMetaFromTab(tab);

  let timedOut = false;
  const scriptPromise = runExtractionOnTab(tab).catch((error) => {
    error.injectionFailed = true;
    throw error;
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      timedOut = true;
      reject(new Error(ERROR_MESSAGES.TIMEOUT));
    }, EXTRACTION_TIMEOUT_MS);
  });

  setLoading(true, config.loadingBuild);

  let result;
  try {
    result = await Promise.race([scriptPromise, timeoutPromise]);
  } catch (error) {
    showError(error, {
      timedOut,
      injectionFailed: Boolean(error?.injectionFailed),
      unsupportedPage: isUnsupportedPageUrl(tabUrl)
    });
    return;
  }

  if (isExtractionResultEmpty(result)) {
    showError(null, { noPalette: true });
    return;
  }

  let curated;
  try {
    curated = curatePalette(result);
  } catch (error) {
    showError(error, { noPalette: true });
    return;
  }

  const assigned = assignRoles(curated);
  if (!assigned?.swatches?.length) {
    showError(null, { noPalette: true });
    return;
  }

  currentPalette = assigned.swatches.slice(0, 8);
  setResultsState();
  renderSwatches(currentPalette);
  statusEl.textContent = "";
  setLoading(false);
  reportHeight();
}

async function extractFonts() {
  const config = modeConfig("fonts");
  clearError();
  setLoading(true, config.loadingStart);

  const tab = await getTargetTab();
  if (!tab?.id) {
    showError(null, { noTab: true });
    return;
  }

  const tabUrl = tab.url || "";
  if (isUnsupportedPageUrl(tabUrl)) {
    showError(null, { unsupportedPage: true });
    return;
  }

  let timedOut = false;
  const scriptPromise = runExtractionOnTab(tab).catch((error) => {
    error.injectionFailed = true;
    throw error;
  });

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      timedOut = true;
      reject(new Error(ERROR_MESSAGES.TIMEOUT));
    }, EXTRACTION_TIMEOUT_MS);
  });

  setLoading(true, config.loadingBuild);

  let result;
  try {
    result = await Promise.race([scriptPromise, timeoutPromise]);
  } catch (error) {
    showError(error, {
      timedOut,
      injectionFailed: Boolean(error?.injectionFailed),
      unsupportedPage: isUnsupportedPageUrl(tabUrl)
    });
    return;
  }

  if (isFontExtractionEmpty(result)) {
    showError(null, { noFonts: true });
    return;
  }

  const curatedFonts = curateFonts(result);
  if (!curatedFonts.hasFonts || !curatedFonts.fonts.length) {
    showError(null, { noFonts: true });
    return;
  }

  currentFonts = curatedFonts.fonts;
  setResultsState();
  renderFonts(currentFonts);
  setLoading(false);
  reportHeight();
}

async function runExtraction() {
  extractBtn.disabled = true;
  try {
    if (activeMode === "fonts") {
      await extractFonts();
    } else {
      await extractColors();
    }
  } finally {
    extractBtn.disabled = false;
  }
}

function bindTabSwitch(button, mode) {
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || mode === activeMode) return;
    switchMode(mode);
  });

  button.addEventListener("click", () => {
    if (mode === activeMode) return;
    switchMode(mode);
  });
}

bindTabSwitch(tabColorsBtn, "colors");
bindTabSwitch(tabFontsBtn, "fonts");
extractBtn.addEventListener("click", runExtraction);
resetBtn.addEventListener("click", resetCurrentMode);

copyBtn.addEventListener("click", async () => {
  if (!currentPalette.length) {
    showError(null, { noPalette: true });
    return;
  }

  try {
    await copyPaletteImage(currentPalette, exportPageMeta);
    statusEl.textContent = "";
    flashCopyFeedback(true);
  } catch (error) {
    const message = normalizeUserMessage(error?.message) || ERROR_MESSAGES.COPY_FAILED;
    showBanner(message, { guidance: false });
    flashCopyFeedback(false);
  }
});

async function showGuidanceForCurrentTab() {
  if (isRestrictedPopupContext()) {
    showBanner(GUIDANCE_COPY.message, { guidance: true, title: GUIDANCE_COPY.title });
    return;
  }

  try {
    const tab = await getTargetTab();
    if (!tab?.id) {
      showBanner(ERROR_MESSAGES.NO_TAB, { guidance: true, title: "No active tab" });
      return;
    }
    if (isUnsupportedPageUrl(tab.url)) {
      showBanner(GUIDANCE_COPY.message, { guidance: true, title: GUIDANCE_COPY.title });
    }
  } catch {
    /* tab query unavailable — keep default intro */
  }
}

updateModeChrome();
setIntroState();
showGuidanceForCurrentTab();
