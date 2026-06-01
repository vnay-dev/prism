import { curatePalette } from "../core/scoreAndCluster.js";
import { assignRoles } from "../core/assignRoles.js";
import { copyPaletteImage, readPageMetaFromTab } from "./exportPaletteImage.js";
import { getTargetTab } from "./tabs.js";
import {
  ERROR_MESSAGES,
  ERROR_BANNER_TITLE,
  GUIDANCE_COPY,
  classifyExtractionError,
  isExtractionResultEmpty,
  isRestrictedPopupContext,
  isUnsupportedPageUrl,
  normalizeUserMessage
} from "./errors.js";

const appEl = document.querySelector(".app");
const introEl = document.getElementById("intro");
const resultsEl = document.getElementById("results");
const loadingEl = document.getElementById("loading");
const loadingTextEl = document.getElementById("loadingText");
const errorBannerEl = document.getElementById("errorBanner");
const errorMessageEl = document.getElementById("errorMessage");
const errorBannerTitleEl = document.getElementById("errorBannerTitle");
const errorBannerIconEl = document.getElementById("errorBannerIcon");
const extractBtn = document.getElementById("extractBtn");
const panelFooterEl = document.querySelector(".panel-footer");
const introDescEl = document.querySelector(".intro-desc");
const resultsFooterEl = document.getElementById("resultsFooter");
const copyBtn = document.getElementById("copyBtn");
const copyBtnLabel = document.getElementById("copyBtnLabel");
const copyBtnIcon = document.getElementById("copyBtnIcon");
const resetBtn = document.getElementById("resetBtn");
const closeBtn = document.getElementById("closeBtn");
const statusEl = document.getElementById("status");
const swatchesEl = document.getElementById("swatches");

const isEmbedded = window.parent !== window;
const EXTRACTION_TIMEOUT_MS = 22000;
/** OS window chrome around the HTML viewport (Windows popup). */
const STANDALONE_WINDOW_CHROME_X = 16;
const STANDALONE_WINDOW_CHROME_Y = 40;

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

if (isEmbedded) {
  document.body.classList.add("embedded");
  closeBtn.hidden = false;
  closeBtn.addEventListener("click", () => {
    window.parent.postMessage({ type: "prism-close" }, "*");
  });
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

let currentPalette = [];
let exportPageMeta = { title: "", siteName: "", hostname: "", url: "" };
let copyFeedbackTimer = null;

const COPY_LABEL_DEFAULT = "Copy palette";
const COPY_LABEL_COPIED = "Copied!";
const COPY_LABEL_FAILED = "Copy failed";
const COPY_ICON_DEFAULT = "content_copy";
const COPY_ICON_COPIED = "check";
const COPY_ICON_FAILED = "error";

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
    setCopyButtonState(COPY_LABEL_DEFAULT, COPY_ICON_DEFAULT);
  }, 2200);
}

const ROLE_ORDER = ["foundation", "primary", "secondary", "accent", "neutral"];
const HERO_HEIGHT = 100;
const ROW_HEIGHT = HERO_HEIGHT / 2;

function isLightSwatch(hex) {
  const value = hex.replace("#", "");
  if (value.length !== 6) return false;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return r >= 248 && g >= 248 && b >= 248;
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
  resultsEl.hidden = true;
  resultsFooterEl.classList.remove("is-visible");

  if (panelFooterEl) panelFooterEl.hidden = guidance;
  if (introDescEl) introDescEl.hidden = guidance;

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
  resultsEl.hidden = true;
  resultsFooterEl.classList.remove("is-visible");
  if (panelFooterEl) panelFooterEl.hidden = false;
  if (introDescEl) introDescEl.hidden = false;
  clearError();
}

function setResultsState() {
  appEl.classList.remove("state-intro");
  appEl.classList.add("state-results");
  introEl.hidden = true;
  resultsEl.hidden = false;
  resultsFooterEl.classList.add("is-visible");
  clearError();
}

function setLoading(active, message = "Analyzing colors across the page…") {
  appEl.classList.toggle("is-loading", active);
  loadingEl.hidden = !active;
  loadingTextEl.textContent = message || "Analyzing colors across the page…";
  if (active) {
    clearError();
    introEl.hidden = true;
    resultsEl.hidden = true;
  }
  reportHeight();
}

function resetApp() {
  currentPalette = [];
  swatchesEl.innerHTML = "";
  statusEl.textContent = "";
  clearTimeout(copyFeedbackTimer);
  setCopyButtonState(COPY_LABEL_DEFAULT, COPY_ICON_DEFAULT);
  setIntroState();
  reportHeight();
}

function buildBentoRows(swatches) {
  const byRole = {};
  for (const role of ROLE_ORDER) byRole[role] = swatches.filter((s) => s.role === role);

  const rows = [];

  if (byRole.foundation.length) {
    rows.push({ tiles: byRole.foundation, height: HERO_HEIGHT });
  }

  if (byRole.primary.length) {
    rows.push({ tiles: byRole.primary, height: HERO_HEIGHT });
  }

  const loneTiles = [];
  for (const role of ROLE_ORDER.filter((r) => r !== "foundation" && r !== "primary")) {
    const tiles = byRole[role];
    if (tiles.length >= 2) {
      rows.push({ tiles, height: ROW_HEIGHT });
    } else if (tiles.length === 1) {
      loneTiles.push(tiles[0]);
    }
  }

  for (let i = 0; i < loneTiles.length; i += 4) {
    rows.push({ tiles: loneTiles.slice(i, i + 4), height: ROW_HEIGHT });
  }

  return rows;
}

function renderSwatches(swatches) {
  swatchesEl.innerHTML = "";
  setResultsState();

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

async function extractPalette() {
  clearError();
  setLoading(true, "Analyzing colors across the page…");

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

  setLoading(true, "Building your curated palette…");

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
  renderSwatches(currentPalette);
  statusEl.textContent = "";
  setLoading(false);
  reportHeight();
}

async function runExtraction() {
  extractBtn.disabled = true;
  try {
    await extractPalette();
  } finally {
    extractBtn.disabled = false;
  }
}

extractBtn.addEventListener("click", runExtraction);
resetBtn.addEventListener("click", resetApp);

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

setIntroState();
showGuidanceForCurrentTab();
