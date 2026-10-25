import { curatePalette } from "../core/scoreAndCluster.js";
import { assignRoles } from "../core/assignRoles.js";
import { curateFonts } from "../core/curateFonts.js";
import { curateImages } from "../core/curateImages.js";
import { curateIcons } from "../core/curateIcons.js";
import { curateGradients } from "../core/curateGradients.js";
import { shadeColor, hexToRgb, rgbToHsl, rgbToHex, isPureBlackOrWhite } from "../core/colorLab.js";
import { openColorPicker, closeColorPicker } from "./colorPicker.js";
import { copyPaletteImage, readPageMetaFromTab } from "./exportPaletteImage.js";
import { buildRoleSections, isLightSwatch, isDarkSwatch } from "./paletteLayout.js";
import {
  COLOR_VIEW_MODES,
  normalizeColorViewMode,
  buildStackLayout
} from "./paletteViews.js";
import {
  makePageKey,
  createGenerationState,
  shouldAutoGenerate,
  canReuseModeResults,
  canReuseRawExtraction,
  canReuseRawAssets,
  beginRequest,
  isStaleRequest,
  setInFlight,
  clearInFlight,
  applyExtractionSuccess,
  applyAssetsSuccess,
  markModeForManualGenerate,
  invalidatePage,
  serializeGenerationCache,
  restoreGenerationCache,
  isAssetMode
} from "./generationController.js";
import { usageRoleLabels } from "../core/usageRoles.js";
import { getTargetTab } from "./tabs.js";
import {
  ERROR_MESSAGES,
  ERROR_BANNER_TITLE,
  GUIDANCE_COPY,
  classifyExtractionError,
  isExtractionResultEmpty,
  isFontExtractionEmpty,
  isAssetExtractionEmpty,
  isRestrictedPopupContext,
  isUnsupportedPageUrl,
  normalizeUserMessage
} from "./errors.js";
import {
  renderAssetGrid,
  flashAssetDownloadFeedback,
  syncAssetCardSelectionState
} from "./assetsView.js";
import {
  downloadAsset,
  downloadAssetsAsZip,
  downloadErrorMessage
} from "./downloadAsset.js";

const appEl = document.querySelector(".app");
const introEl = document.getElementById("intro");
const colorResultsEl = document.getElementById("colorResults");
const fontResultsEl = document.getElementById("fontResults");
const imageResultsEl = document.getElementById("imageResults");
const iconResultsEl = document.getElementById("iconResults");
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
const reloadBtn = document.getElementById("reloadBtn");
const reloadBtnLabel = document.getElementById("reloadBtnLabel");
const clearSelectionBtn = document.getElementById("clearSelectionBtn");
const shuffleBtn = document.getElementById("shuffleBtn");
const closeBtn = document.getElementById("closeBtn");
const statusEl = document.getElementById("status");
const swatchesEl = document.getElementById("swatches");
const fontsEl = document.getElementById("fonts");
const imagesEl = document.getElementById("images");
const iconsEl = document.getElementById("icons");
const tabBarEl = document.getElementById("tabBar");
const tabColorsBtn = document.getElementById("tabColors");
const tabFontsBtn = document.getElementById("tabFonts");
const tabImagesBtn = document.getElementById("tabImages");
const tabIconsBtn = document.getElementById("tabIcons");
const colorViewToggleEl = document.getElementById("colorViewToggle");
const panelHeaderEl = document.querySelector(".panel-header");
const dragHandleEl = document.getElementById("dragHandle");
const colorPickerStageEl = document.getElementById("colorPickerStage");

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
  },
  images: {
    extractLabel: "Extract images",
    extractIcon: "image",
    intro: "Find downloadable images on this webpage",
    loadingStart: "Scanning images on the page…",
    loadingBuild: "Collecting image assets…"
  },
  icons: {
    extractLabel: "Extract icons",
    extractIcon: "imagesmode",
    intro: "Find downloadable icons on this webpage",
    loadingStart: "Scanning icons on the page…",
    loadingBuild: "Collecting icon assets…"
  }
};

const VALID_MODES = new Set(["colors", "fonts", "images", "icons"]);

let activeMode = "colors";
let currentPalette = [];
let currentGradients = [];
let currentFonts = [];
let currentImages = [];
let currentIcons = [];
let highlightedFontFamily = null;
let selectedAssetIds = new Set();
let exportPageMeta = { title: "", siteName: "", hostname: "", url: "", iconDataUrl: "" };
let copyFeedbackTimer = null;
let colorViewMode = COLOR_VIEW_MODES.ROLES;
let generation = createGenerationState();

const COPY_LABEL_COPIED = "Copied! Paste in Figma";
const FONT_COPY_LABEL_COPIED = "Copied!";
const COPY_LABEL_FAILED = "Copy failed";
const COPY_ICON_DEFAULT = "content_copy";
const COPY_ICON_COPIED = "check";
const COPY_ICON_FAILED = "error";

// Shuffle: re-curate the same page extraction with a fresh random seed so the
// user can keep browsing alternate palettes without a full page re-scan.
let lastRawExtraction = null;
let shuffleSeedCounter = 0;
const SHUFFLE_MAX_ATTEMPTS = 60;

function syncGenerationMirrors() {
  currentPalette = generation.palette || [];
  currentGradients = generation.gradients || [];
  currentFonts = generation.fonts || [];
  currentImages = generation.images || [];
  currentIcons = generation.icons || [];
  lastRawExtraction = generation.rawExtraction || null;
}

function sendRuntimeMessage(payload) {
  return new Promise((resolve) => {
    if (!chrome?.runtime?.sendMessage) {
      resolve(null);
      return;
    }
    try {
      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response || null);
      });
    } catch {
      resolve(null);
    }
  });
}

async function persistGenerationCache() {
  if (!generation.pageKey) return;
  await sendRuntimeMessage({
    type: "prism-generation-cache-set",
    pageKey: generation.pageKey,
    cache: serializeGenerationCache(generation)
  });
}

async function loadGenerationCache(pageKey) {
  if (!pageKey) return null;
  const response = await sendRuntimeMessage({
    type: "prism-generation-cache-get",
    pageKey
  });
  return response?.cache || null;
}

async function persistColorViewMode(mode) {
  await sendRuntimeMessage({ type: "prism-color-view-set", mode });
}

async function loadColorViewMode() {
  const response = await sendRuntimeMessage({ type: "prism-color-view-get" });
  return normalizeColorViewMode(response?.mode);
}

function isDisplayed(el) {
  if (!el || el.hidden) return false;
  return getComputedStyle(el).display !== "none";
}

/**
 * Hug content (Figma-style).
 * Collapse html/body to 0 first so a taller iframe viewport cannot inflate
 * the measured height of dynamic tab/view content.
 */
function measureAppHeight(app) {
  if (!app) return 1;

  const html = document.documentElement;
  const body = document.body;

  html.style.setProperty("height", "0px", "important");
  body.style.setProperty("height", "0px", "important");
  app.style.setProperty("height", "auto", "important");
  void app.offsetHeight;

  let height = Math.max(app.scrollHeight, app.offsetHeight);

  const appRect = app.getBoundingClientRect();
  for (const selector of [".color-picker-stage:not([hidden])", ".color-picker"]) {
    const el = app.querySelector(selector);
    if (!isDisplayed(el)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.height > 0) {
      height = Math.max(height, rect.bottom - appRect.top);
    }
  }

  // Bottom of the last in-flow child is the true content edge.
  for (const child of app.children) {
    if (!isDisplayed(child)) continue;
    const position = getComputedStyle(child).position;
    if (position === "absolute" || position === "fixed") continue;
    height = Math.max(height, child.offsetTop + child.offsetHeight);
  }

  return Math.max(1, Math.ceil(height));
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

let lastReportedHeight = 0;

function reportHeight() {
  const app = document.querySelector(".app");
  if (!app) return;

  const height = measureAppHeight(app);
  const html = document.documentElement;
  const body = document.body;

  html.style.setProperty("height", `${height}px`, "important");
  body.style.setProperty("height", `${height}px`, "important");
  app.style.removeProperty("height");

  if (Math.abs(height - lastReportedHeight) < 1) return;
  lastReportedHeight = height;

  if (isEmbedded) {
    window.parent.postMessage({ type: "prism-resize", height }, "*");
    return;
  }
  resizeStandaloneWindow();
}

/** Remeasure after layout settles so tab/view switches hug the new content. */
function reportHeightAfterLayout() {
  lastReportedHeight = 0; // allow shrink after dynamic content changes
  requestAnimationFrame(() => {
    requestAnimationFrame(() => reportHeight());
  });
}

function resizeStandaloneWindow() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const app = document.querySelector(".app");
      if (!app) return;

      const windowWidth = Math.ceil(app.offsetWidth) + STANDALONE_WINDOW_CHROME_X;
      const windowHeight = measureAppHeight(app) + STANDALONE_WINDOW_CHROME_Y;

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
  if (appEl) {
    let resizeFrame = 0;
    new ResizeObserver(() => {
      // Debounce RO so html/body height writes don't thrash with measurements.
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => reportHeight());
    }).observe(appEl);
  }
  window.addEventListener("load", () => {
    lastReportedHeight = 0;
    reportHeight();
  });
  window.addEventListener("message", (event) => {
    if (event.data?.type === "prism-request-resize") {
      lastReportedHeight = 0;
      reportHeight();
    }
  });
  lastReportedHeight = 0;
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
  if (copyBtnLabel) copyBtnLabel.textContent = label || MODE_COPY.colors.copyLabel;
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
    copyFeedbackTimer = null;
    setCopyButtonState(MODE_COPY.colors.copyLabel, COPY_ICON_DEFAULT);
  }, 3500);
}

function applyTabVisuals() {
  if (tabBarEl) tabBarEl.dataset.active = activeMode;

  const tabButtons = [
    [tabColorsBtn, "colors"],
    [tabFontsBtn, "fonts"],
    [tabImagesBtn, "images"],
    [tabIconsBtn, "icons"]
  ];
  for (const [btn, mode] of tabButtons) {
    if (!btn) continue;
    const active = activeMode === mode;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  }
}

function updateModeChrome() {
  const config = modeConfig();
  appEl.classList.toggle("mode-colors", activeMode === "colors");
  appEl.classList.toggle("mode-fonts", activeMode === "fonts");
  appEl.classList.toggle("mode-images", activeMode === "images");
  appEl.classList.toggle("mode-icons", activeMode === "icons");

  if (extractBtnLabel) extractBtnLabel.textContent = config.extractLabel;
  if (extractBtnIcon) extractBtnIcon.textContent = config.extractIcon;
  if (introDescEl) introDescEl.textContent = config.intro;

  applyTabVisuals();

  if (!copyFeedbackTimer && activeMode === "colors") {
    setCopyButtonState(MODE_COPY.colors.copyLabel, COPY_ICON_DEFAULT);
  }

  updateFooterForMode();
}

function setReloadButtonChrome({ action = "reload", count = 0 } = {}) {
  if (!reloadBtn) return;
  const iconEl = reloadBtn.querySelector(".material-symbols-outlined");
  const downloading = action === "download-selected" && count > 0;

  reloadBtn.dataset.action = downloading ? "download-selected" : "reload";
  if (iconEl) iconEl.textContent = downloading ? "download" : "refresh";
  if (reloadBtnLabel) {
    reloadBtnLabel.textContent = downloading ? `Download zip (${count})` : "Reload";
  }
  const label = downloading ? `Download ${count} selected as zip` : "Reload";
  reloadBtn.title = label;
  reloadBtn.setAttribute("aria-label", label);
}

function updateFooterForMode() {
  const assetOrFonts = activeMode === "fonts" || activeMode === "images" || activeMode === "icons";
  const assetModeActive = activeMode === "images" || activeMode === "icons";
  const selectedCount = selectedAssetIds.size;
  // Only show download/unselect chrome while at least one tile is checked.
  const selecting = assetModeActive && selectedCount > 0;

  appEl.classList.toggle("is-asset-selecting", selecting);

  if (activeMode === "colors") {
    // Colors: Shuffle + Copy in the footer.
    shuffleBtn.hidden = false;
    copyBtn.hidden = false;
    if (reloadBtn) reloadBtn.hidden = true;
    if (clearSelectionBtn) {
      clearSelectionBtn.hidden = true;
      clearSelectionBtn.setAttribute("hidden", "");
    }
    if (!copyFeedbackTimer) {
      setCopyButtonState(MODE_COPY.colors.copyLabel, COPY_ICON_DEFAULT);
    }
    return;
  }

  // Fonts: Reload only. Images / Icons: Reload, or Download + Unselect when selecting.
  shuffleBtn.hidden = true;
  copyBtn.hidden = true;
  if (reloadBtn) {
    reloadBtn.hidden = !assetOrFonts;
    setReloadButtonChrome({
      action: selecting ? "download-selected" : "reload",
      count: selecting ? selectedCount : 0
    });
  }
  if (clearSelectionBtn) {
    clearSelectionBtn.hidden = !selecting;
    if (selecting) clearSelectionBtn.removeAttribute("hidden");
    else clearSelectionBtn.setAttribute("hidden", "");
  }
}

function hasResultsForMode(mode) {
  syncGenerationMirrors();
  if (mode === "fonts") return currentFonts.length > 0;
  if (mode === "images") return currentImages.length > 0;
  if (mode === "icons") return currentIcons.length > 0;
  return currentPalette.length > 0;
}

function hideAllResultPanels() {
  colorResultsEl.hidden = true;
  fontResultsEl.hidden = true;
  if (imageResultsEl) imageResultsEl.hidden = true;
  if (iconResultsEl) iconResultsEl.hidden = true;
}
function applyColorViewToggleUi() {
  if (!colorViewToggleEl) return;
  colorViewToggleEl.dataset.active = colorViewMode;
  for (const btn of colorViewToggleEl.querySelectorAll("[data-view]")) {
    const active = btn.dataset.view === colorViewMode;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-checked", active ? "true" : "false");
  }
  if (swatchesEl) swatchesEl.dataset.view = colorViewMode;
}

function setColorViewMode(mode, { persist = true, rerender = true } = {}) {
  const next = normalizeColorViewMode(mode);
  if (next === colorViewMode && rerender === false) {
    applyColorViewToggleUi();
    return;
  }
  colorViewMode = next;
  applyColorViewToggleUi();
  if (persist) persistColorViewMode(colorViewMode);
  if (rerender && activeMode === "colors" && currentPalette.length) {
    renderSwatches(currentPalette);
    reportHeightAfterLayout();
  }
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

function showBanner(message, { guidance = false, title, keepResults = false } = {}) {
  setLoading(false);

  if (!keepResults) {
    appEl.classList.remove("state-results");
    appEl.classList.add("state-intro");
    introEl.hidden = false;
    hideAllResultPanels();
    resultsFooterEl.classList.remove("is-visible");
    if (panelFooterEl) panelFooterEl.hidden = guidance;
    if (introDescEl) introDescEl.hidden = guidance;
    if (tabBarEl) tabBarEl.hidden = guidance;
  }

  appEl.classList.toggle("state-guidance", guidance && !keepResults);

  const bannerTitle = title || (guidance ? GUIDANCE_COPY.title : ERROR_BANNER_TITLE);
  const bannerMessage = guidance && !keepResults ? GUIDANCE_COPY.message : message;

  if (errorBannerTitleEl) errorBannerTitleEl.textContent = bannerTitle;
  if (errorMessageEl) errorMessageEl.textContent = bannerMessage;
  if (errorBannerEl) {
    errorBannerEl.hidden = false;
    errorBannerEl.classList.toggle("is-guidance", guidance && !keepResults);
  }
  if (errorBannerIconEl) {
    errorBannerIconEl.textContent = guidance && !keepResults ? "lightbulb" : "info";
  }

  if (!keepResults) statusEl.textContent = "";
  updateFooterForMode();
  reportHeight();
  if (!isEmbedded && guidance && !keepResults) {
    setTimeout(resizeStandaloneWindow, 0);
    setTimeout(resizeStandaloneWindow, 150);
  }
}

function showError(error, context = {}) {
  const message = classifyExtractionError(error, context);
  showBanner(message, { guidance: false });
}

function setIntroState() {
  closeColorPicker({ immediate: true });
  exitPickingMode();
  appEl.classList.remove("state-results", "state-guidance");
  appEl.classList.add("state-intro");
  introEl.hidden = false;
  hideAllResultPanels();
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
  if (imageResultsEl) imageResultsEl.hidden = activeMode !== "images";
  if (iconResultsEl) iconResultsEl.hidden = activeMode !== "icons";
  resultsFooterEl.classList.add("is-visible");
  if (tabBarEl) tabBarEl.hidden = false;
  clearError();
  updateFooterForMode();
}

function setLoading(active, message) {
  const config = modeConfig();
  if (active) {
    closeColorPicker({ immediate: true });
    exitPickingMode();
  }
  appEl.classList.toggle("is-loading", active);
  loadingEl.hidden = !active;
  loadingTextEl.textContent = message || config.loadingStart;
  if (active) {
    clearError();
    introEl.hidden = true;
    hideAllResultPanels();
    if (tabBarEl) tabBarEl.hidden = false;
  }

  reportHeight();
  if (active) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => reportHeight());
    });
  }
}

/** Re-scan the page for fonts / images / icons (single results CTA). */
async function reloadCurrentMode() {
  if (activeMode === "colors" || !reloadBtn || reloadBtn.disabled) return;

  if (activeMode === "fonts") {
    clearFontHighlightOnPage();
  }
  if (activeMode === "images" || activeMode === "icons") {
    clearAssetMultiSelection();
  }

  // Drop the cached scan so Reload always re-injects into the page.
  if (isAssetMode(activeMode)) {
    generation = { ...generation, rawAssets: null };
  } else {
    generation = { ...generation, rawExtraction: null };
  }
  syncGenerationMirrors();

  reloadBtn.disabled = true;
  try {
    await ensureResultsForActiveMode({ force: true, reason: "reload" });
  } finally {
    reloadBtn.disabled = false;
  }
}

async function downloadSelectedAssets() {
  if (!reloadBtn || reloadBtn.disabled) return;
  if (activeMode !== "images" && activeMode !== "icons") return;

  const pool = activeMode === "images" ? currentImages : currentIcons;
  const selected = pool.filter((asset) => selectedAssetIds.has(asset.id));
  if (!selected.length) return;

  reloadBtn.disabled = true;
  if (clearSelectionBtn) clearSelectionBtn.disabled = true;

  let result = null;
  try {
    const tab = await getTargetTab();
    const zipFilename =
      activeMode === "icons" ? "prism-icons.zip" : "prism-images.zip";
    result = await downloadAssetsAsZip(selected, {
      tabId: tab?.id,
      zipFilename
    });
  } finally {
    reloadBtn.disabled = false;
    if (clearSelectionBtn) clearSelectionBtn.disabled = false;
  }

  if (!result?.ok) {
    showBanner(ERROR_MESSAGES.DOWNLOAD_FAILED || "Download failed.", {
      guidance: false
    });
    return;
  }

  if (result.mode === "individual" && result.failed) {
    const message =
      result.failed === result.total
        ? ERROR_MESSAGES.DOWNLOAD_FAILED || "Download failed."
        : `${result.failed} of ${result.total} downloads failed.`;
    showBanner(message, { guidance: false });
    return;
  }

  if (result.mode === "zip" && result.failed > 0) {
    showBanner(
      `${result.failed} of ${result.total} downloads failed.`,
      { guidance: false }
    );
  }
}

function onReloadOrDownloadClick() {
  if (
    reloadBtn?.dataset?.action === "download-selected" &&
    selectedAssetIds.size > 0 &&
    (activeMode === "images" || activeMode === "icons")
  ) {
    downloadSelectedAssets();
    return;
  }
  reloadCurrentMode();
}
function normalizePickerColor(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const hsl = rgbToHsl(rgb);
  let outHex = rgbToHex(rgb).toLowerCase();
  if (isPureBlackOrWhite(outHex)) {
    const nudged = shadeColor({ hex: outHex, rgb, hsl }, outHex === "#000000" ? 10 : -10);
    if (nudged) return nudged;
  }
  return { hex: outHex, rgb, hsl };
}

function withSlotMeta(swatches) {
  return swatches.map((s, i) => ({
    ...s,
    id: s.id || `slot-${i}`,
    locked: Boolean(s.locked)
  }));
}

function lockedSwatches(palette = currentPalette) {
  return palette.filter((s) => s.locked);
}

/** Inject user-locked colors into the extraction so shuffle builds around them. */
function extractionWithLockedColors(rawExtraction, locked) {
  if (!locked.length) return rawExtraction;
  const extras = locked.map((s, i) => {
    const chromatic = s.hsl?.s > 18 && s.hsl?.l > 12 && s.hsl?.l < 90;
    return {
      hex: s.hex,
      rgb: s.rgb,
      hsl: s.hsl,
      area: 90000,
      importance: 220,
      rawImportance: 110,
      brandWeight: 3,
      sourceCategory: chromatic
        ? s.role === "accent"
          ? "hero_cta"
          : "primary_button"
        : "hero_background",
      sectionId: `user-locked-${i}`,
      context: chromatic ? "button" : "surface",
      contrast: 0.75,
      areaSourceType: "background"
    };
  });
  return {
    ...rawExtraction,
    samples: [...(rawExtraction.samples || []), ...extras]
  };
}

/**
 * Keeps locked colors in the shuffled result (matched by role first, then any
 * remaining open slot) so edits survive shuffle while unlocked tiles refresh.
 * Unlocked tiles that would duplicate a locked hex are nudged to a shade.
 */
function mergeLockedIntoPalette(nextSwatches, previousPalette) {
  const locked = lockedSwatches(previousPalette);
  if (!locked.length) return withSlotMeta(nextSwatches);

  const queues = new Map();
  for (const s of locked) {
    if (!queues.has(s.role)) queues.set(s.role, []);
    queues.get(s.role).push(s);
  }

  const merged = nextSwatches.map((s, i) => {
    const queue = queues.get(s.role);
    if (queue?.length) {
      const lock = queue.shift();
      return {
        ...s,
        hex: lock.hex,
        rgb: lock.rgb,
        hsl: lock.hsl,
        locked: true,
        id: lock.id || `slot-${i}`,
        usageRoles: Array.isArray(lock.usageRoles) ? [...lock.usageRoles] : []
      };
    }
    return { ...s, locked: false, id: s.id || `slot-${i}` };
  });

  const leftovers = [];
  for (const queue of queues.values()) leftovers.push(...queue);
  for (let i = 0; i < merged.length && leftovers.length; i++) {
    if (merged[i].locked) continue;
    const lock = leftovers.shift();
    merged[i] = {
      ...merged[i],
      hex: lock.hex,
      rgb: lock.rgb,
      hsl: lock.hsl,
      locked: true,
      id: lock.id || merged[i].id,
      usageRoles: Array.isArray(lock.usageRoles) ? [...lock.usageRoles] : []
    };
  }

  return resolveLockedDuplicates(merged, lastRawExtraction);
}

/** Replace unlocked tiles that collide with a locked hex using other page colors. */
function resolveLockedDuplicates(swatches, rawExtraction = lastRawExtraction) {
  const lockedHexes = new Set(
    swatches.filter((s) => s.locked).map((s) => String(s.hex || "").toLowerCase())
  );
  if (!lockedHexes.size) return swatches;

  const usedHexes = new Set(swatches.map((s) => String(s.hex || "").toLowerCase()));
  const pool = samplePoolFromExtraction(rawExtraction, lockedHexes).filter(
    (s) => !usedHexes.has(String(s.hex).toLowerCase())
  );

  return swatches.map((swatch) => {
    if (swatch.locked) return swatch;
    if (!lockedHexes.has(String(swatch.hex || "").toLowerCase())) return swatch;
    const replacement = pool.shift();
    if (!replacement) return swatch;
    usedHexes.add(String(replacement.hex).toLowerCase());
    return {
      ...swatch,
      hex: replacement.hex,
      rgb: replacement.rgb,
      hsl: replacement.hsl || rgbToHsl(replacement.rgb),
      usageRoles: []
    };
  });
}

/** Real sampled page colors, excluding pure black/white and any blocked hexes. */
function samplePoolFromExtraction(rawExtraction, blockedHexes = new Set()) {
  const samples = rawExtraction?.samples || [];
  const out = [];
  const seen = new Set();
  for (const sample of samples) {
    const hex = String(sample?.hex || "").toLowerCase();
    if (!hex || seen.has(hex) || blockedHexes.has(hex) || isPureBlackOrWhite(hex)) continue;
    seen.add(hex);
    out.push({
      hex: sample.hex,
      rgb: sample.rgb,
      hsl: sample.hsl || (sample.rgb ? rgbToHsl(sample.rgb) : null)
    });
  }
  return out;
}

function applyColorToSwatchState(swatchId, hex) {
  const parsed = normalizePickerColor(hex);
  if (!parsed) return null;
  const baseline = activePickerBaseline?.id === swatchId ? activePickerBaseline : null;
  const matchesBaseline =
    baseline && parsed.hex === String(baseline.hex || "").toLowerCase();
  currentPalette = currentPalette.map((s) =>
    s.id === swatchId
      ? {
          ...s,
          hex: parsed.hex,
          rgb: parsed.rgb,
          hsl: parsed.hsl,
          locked: true,
          usageRoles: matchesBaseline ? [...(baseline.usageRoles || [])] : []
        }
      : s
  );
  generation = { ...generation, palette: currentPalette };
  return parsed;
}

function swatchAriaLabel(swatch) {
  const labels = usageRoleLabels(swatch?.usageRoles);
  return labels.length ? `${swatch.hex}, ${labels.join(", ")}` : swatch.hex;
}

function paintSwatchTile(tile, swatch) {
  if (!tile || !swatch) return;
  const hexLabel = String(swatch.hex || "").toUpperCase();
  tile.style.backgroundColor = swatch.hex;
  tile.classList.toggle("swatch-light", isLightSwatch(swatch.hex));
  tile.classList.toggle("swatch-dark", isDarkSwatch(swatch.hex));
  tile.setAttribute("aria-label", swatchAriaLabel(swatch));
  tile.dataset.hex = swatch.hex;
  tile.title = "Click to copy hex";
  const tip = tile.querySelector(".swatch-tooltip");
  if (tip) {
    tip.dataset.hexLabel = hexLabel;
    tip.textContent = hexLabel;
  }
  const editBtn = tile.querySelector(".swatch-edit-btn");
  if (editBtn) {
    editBtn.setAttribute("aria-label", `Edit ${swatch.hex}`);
    editBtn.title = "Edit color";
  }
}

function updateSwatchColor(swatchId, hex, { commit = false, tile = null } = {}) {
  const parsed = applyColorToSwatchState(swatchId, hex);
  if (!parsed) return;

  const swatch = currentPalette.find((s) => s.id === swatchId);
  const liveTiles = [...swatchesEl.querySelectorAll(".swatch")].filter((el) => {
    const btn = el.querySelector(".swatch-edit-btn");
    return btn?.dataset.swatchId === swatchId;
  });
  if (tile && !liveTiles.includes(tile)) liveTiles.push(tile);
  for (const liveTile of liveTiles) paintSwatchTile(liveTile, swatch);
  if (commit) {
    persistGenerationCache();
    if (!appEl.classList.contains("is-picking-color")) reportHeight();
  }
}

let activePickerSwatchId = null;
let activePickerTile = null;
let activePickerOriginRect = null;
let activePickerBaseline = null;

const PICKER_MORPH_MS = 340;

function snapshotSwatchForPicker(swatch) {
  if (!swatch) return null;
  return {
    id: swatch.id,
    hex: swatch.hex,
    rgb: swatch.rgb ? { ...swatch.rgb } : null,
    hsl: swatch.hsl ? { ...swatch.hsl } : null,
    locked: Boolean(swatch.locked),
    usageRoles: Array.isArray(swatch.usageRoles) ? [...swatch.usageRoles] : []
  };
}

function revertPickerBaseline() {
  const baseline = activePickerBaseline;
  if (!baseline?.id) return null;
  currentPalette = currentPalette.map((s) =>
    s.id === baseline.id
      ? {
          ...s,
          hex: baseline.hex,
          rgb: baseline.rgb,
          hsl: baseline.hsl,
          locked: baseline.locked,
          usageRoles: Array.isArray(baseline.usageRoles) ? [...baseline.usageRoles] : []
        }
      : s
  );
  generation = { ...generation, palette: currentPalette };
  return currentPalette.find((s) => s.id === baseline.id) || null;
}

function clearPickerStageOverlay() {
  if (!colorPickerStageEl) return;
  colorPickerStageEl.style.position = "";
  colorPickerStageEl.style.left = "";
  colorPickerStageEl.style.top = "";
  colorPickerStageEl.style.width = "";
  colorPickerStageEl.style.zIndex = "";
}

function lockPickerStageOverlay() {
  if (!colorPickerStageEl || !appEl) return;
  const appRect = appEl.getBoundingClientRect();
  const stageRect = colorPickerStageEl.getBoundingClientRect();
  if (!stageRect.width) return;
  colorPickerStageEl.style.position = "absolute";
  colorPickerStageEl.style.left = `${Math.round(stageRect.left - appRect.left)}px`;
  colorPickerStageEl.style.top = `${Math.round(stageRect.top - appRect.top)}px`;
  colorPickerStageEl.style.width = `${Math.round(stageRect.width)}px`;
  colorPickerStageEl.style.zIndex = "6";
}

function exitPickingMode() {
  appEl.classList.remove(
    "is-picking-color",
    "is-picking-enter",
    "is-picking-enter-active",
    "is-picking-exit",
    "is-picking-exit-active"
  );
  clearPickerStageOverlay();
  if (colorPickerStageEl) {
    colorPickerStageEl.hidden = true;
    colorPickerStageEl.style.height = "";
    colorPickerStageEl.replaceChildren();
  }
  activePickerOriginRect = null;
}

function waitForTransition(el, property, ms) {
  return new Promise((resolve) => {
    if (!el || prefersReducedMotion()) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener("transitionend", onEnd);
      resolve();
    };
    const onEnd = (event) => {
      if (event.target !== el) return;
      if (property && event.propertyName !== property) return;
      finish();
    };
    el.addEventListener("transitionend", onEnd);
    window.setTimeout(finish, ms + 40);
  });
}

function morphPickerFromTile(root, tile) {
  const surface = root?.querySelector(".cp-sv-wrap") || root;
  if (!root || !tile || prefersReducedMotion()) {
    root?.classList.remove("is-morphing", "is-morphing-in", "is-morphing-out", "is-morphing-active");
    return Promise.resolve();
  }

  const from = activePickerOriginRect || tile.getBoundingClientRect();
  const to = surface.getBoundingClientRect();
  if (!from.width || !to.width) {
    root.classList.remove("is-morphing", "is-morphing-in", "is-morphing-out", "is-morphing-active");
    return Promise.resolve();
  }

  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const sx = from.width / to.width;
  const sy = from.height / to.height;

  root.classList.add("is-morphing", "is-morphing-in");
  root.classList.remove("is-morphing-out", "is-morphing-active");
  surface.style.transformOrigin = "center center";
  surface.style.borderRadius = "6px";
  surface.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.add("is-morphing-active");
        surface.style.transform = "";
        surface.style.borderRadius = "";
        waitForTransition(surface, "transform", PICKER_MORPH_MS).then(() => {
          root.classList.remove("is-morphing", "is-morphing-in", "is-morphing-active");
          surface.style.removeProperty("transform");
          surface.style.removeProperty("transform-origin");
          surface.style.removeProperty("border-radius");
          resolve();
        });
      });
    });
  });
}

function morphPickerToTile(root) {
  const surface = root?.querySelector(".cp-sv-wrap") || root;
  if (!root || prefersReducedMotion()) {
    appEl.classList.remove("is-picking-color");
    appEl.classList.add("is-picking-exit", "is-picking-exit-active");
    return Promise.resolve();
  }

  if (!surface.getBoundingClientRect().width) return Promise.resolve();

  // Keep the picker overlaid while the palette fades back in underneath.
  lockPickerStageOverlay();
  appEl.classList.remove("is-picking-color");
  appEl.classList.add("is-picking-exit");

  // Origin was captured before layout changed; remeasure the live tile.
  if (activePickerTile) {
    const liveTile = activePickerTile.getBoundingClientRect();
    if (liveTile.width && liveTile.height) {
      activePickerOriginRect = {
        left: liveTile.left,
        top: liveTile.top,
        width: liveTile.width,
        height: liveTile.height
      };
    }
  }
  const to = activePickerOriginRect;
  reportHeight();

  // Fade chrome + contract surface together (no staged wait).
  root.classList.add("is-morphing", "is-morphing-out", "is-morphing-active");
  root.classList.remove("is-morphing-in");
  surface.style.transformOrigin = "center center";

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      appEl.classList.add("is-picking-exit-active");

      const finish = () => {
        root.classList.remove("is-morphing", "is-morphing-out", "is-morphing-active");
        surface.style.removeProperty("transform");
        surface.style.removeProperty("transform-origin");
        surface.style.removeProperty("border-radius");
        surface.style.removeProperty("opacity");
        resolve();
      };

      if (!to?.width || !to?.height) {
        surface.style.transform = "scale(0.98)";
        surface.style.opacity = "0";
        waitForTransition(surface, "opacity", PICKER_MORPH_MS).then(finish);
        return;
      }

      const live = surface.getBoundingClientRect();
      const dx = to.left + to.width / 2 - (live.left + live.width / 2);
      const dy = to.top + to.height / 2 - (live.top + live.height / 2);
      const sx = to.width / live.width;
      const sy = to.height / live.height;

      surface.style.borderRadius = "6px";
      surface.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
      waitForTransition(surface, "transform", PICKER_MORPH_MS).then(finish);
    });
  });
}

function openSwatchColorPicker(swatch, tile) {
  if (activePickerSwatchId === swatch.id) {
    closeColorPicker();
    return;
  }

  closeColorPicker({ immediate: true });
  exitPickingMode();

  activePickerSwatchId = swatch.id;
  activePickerTile = tile;
  tile.classList.add("is-editing");

  if (!colorPickerStageEl) return;

  const origin = tile.getBoundingClientRect();
  activePickerOriginRect = {
    left: origin.left,
    top: origin.top,
    width: origin.width,
    height: origin.height
  };

  colorPickerStageEl.hidden = false;
  appEl.classList.add("is-picking-enter");

  const startHex = currentPalette.find((s) => s.id === swatch.id)?.hex || swatch.hex;
  const startSwatch = currentPalette.find((s) => s.id === swatch.id) || swatch;
  activePickerBaseline = snapshotSwatchForPicker(startSwatch);

  const picker = openColorPicker({
    hex: startHex,
    mountEl: colorPickerStageEl,
    onInput: (color) => {
      updateSwatchColor(swatch.id, color.hex, { tile });
    },
    onCommit: (color) => {
      updateSwatchColor(swatch.id, color.hex, { commit: true, tile });
    },
    animateClose: (root, { applied = false } = {}) => {
      const sv = root.querySelector(".cp-sv");
      const hex = applied
        ? currentPalette.find((s) => s.id === swatch.id)?.hex || startHex
        : activePickerBaseline?.hex || startHex;
      if (sv) {
        sv.style.backgroundImage = "none";
        sv.style.backgroundColor = hex;
      }
      return morphPickerToTile(root);
    },
    onClose: ({ applied = false } = {}) => {
      const editingTile = activePickerTile;
      const swatchId = activePickerSwatchId;
      if (!applied) revertPickerBaseline();
      activePickerSwatchId = null;
      activePickerTile = null;
      activePickerBaseline = null;
      editingTile?.classList.remove("is-editing");
      exitPickingMode();
      const latest = currentPalette.find((s) => s.id === swatchId);
      if (editingTile && latest) paintSwatchTile(editingTile, latest);
      reportHeight();
    }
  });

  const sv = picker?.root?.querySelector(".cp-sv");
  if (sv) {
    sv.style.backgroundImage = "none";
    sv.style.backgroundColor = startHex;
  }

  // Overlay the picker on the palette so both can crossfade without a blank gap.
  lockPickerStageOverlay();
  reportHeight();

  requestAnimationFrame(() => {
    appEl.classList.add("is-picking-enter-active");
    morphPickerFromTile(picker?.root, tile).then(() => {
      appEl.classList.add("is-picking-color");
      appEl.classList.remove("is-picking-enter", "is-picking-enter-active");
      clearPickerStageOverlay();
      if (sv) {
        sv.style.removeProperty("background-image");
        picker?.setHex?.(startHex);
      }
      reportHeight();
    });
  });
}

function truncateGradientLabel(css, max = 56) {
  const value = String(css || "").replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

const TOOLTIP_EDGE_PAD = 6;

function resetSwatchTooltipShift(tip) {
  if (!tip) return;
  tip.style.setProperty("--swatch-tooltip-shift", "0px");
}

/** Nudge centered tooltips so long CSS labels stay inside the swatches scrollport. */
function clampSwatchTooltip(tile) {
  const tip = tile?.querySelector(".swatch-tooltip");
  if (!tip || !swatchesEl || tile.classList.contains("swatch-stack")) return false;
  resetSwatchTooltipShift(tip);
  // Measure the centered position, then shift just enough to clear the edges.
  const port = swatchesEl.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  if (!tipRect.width) return false;
  let shift = 0;
  if (tipRect.left < port.left + TOOLTIP_EDGE_PAD) {
    shift = port.left + TOOLTIP_EDGE_PAD - tipRect.left;
  } else if (tipRect.right > port.right - TOOLTIP_EDGE_PAD) {
    shift = port.right - TOOLTIP_EDGE_PAD - tipRect.right;
  }
  tip.style.setProperty("--swatch-tooltip-shift", `${shift}px`);
  return true;
}

function restoreTileTooltipLabel(tip) {
  if (!tip) return;
  if (tip.dataset.fullCss) {
    tip.textContent = truncateGradientLabel(tip.dataset.fullCss);
    return;
  }
  if (tip.dataset.hexLabel) {
    tip.textContent = tip.dataset.hexLabel;
    return;
  }
}

function flashTileCopyFeedback(tile, success) {
  const tip = tile?.querySelector(".swatch-tooltip");
  if (!tip) return;
  tip.textContent = success ? "Copied!" : "Copy failed";
  tip.classList.add("is-pinned");
  clearTimeout(tile._copyFeedbackTimer);
  tile._copyFeedbackTimer = window.setTimeout(() => {
    restoreTileTooltipLabel(tip);
    tip.classList.remove("is-pinned");
    // Recenter after the shorter "Copied!" label is restored to the long CSS.
    requestAnimationFrame(() => clampSwatchTooltip(tile));
    tile._copyFeedbackTimer = null;
  }, 1200);
  requestAnimationFrame(() => clampSwatchTooltip(tile));
}

async function copySwatchHex(swatch, tile) {
  const hex = String(swatch?.hex || tile?.dataset?.hex || "").toUpperCase();
  if (!hex) return;
  try {
    await navigator.clipboard.writeText(hex);
    flashTileCopyFeedback(tile, true);
  } catch {
    flashTileCopyFeedback(tile, false);
  }
}

async function copyGradientCss(gradient, tile) {
  const css = gradient?.css;
  if (!css) return;
  try {
    await navigator.clipboard.writeText(css);
    flashTileCopyFeedback(tile, true);
  } catch {
    flashTileCopyFeedback(tile, false);
  }
}

function createSwatchTile(swatch, { variant = "roles" } = {}) {
  const tile = document.createElement("article");
  tile.className = `swatch role-${swatch.role || "neutral"}`;
  if (variant === "stack") tile.classList.add("swatch-stack");
  if (isLightSwatch(swatch.hex)) tile.classList.add("swatch-light");
  if (isDarkSwatch(swatch.hex)) tile.classList.add("swatch-dark");
  tile.setAttribute("aria-label", swatchAriaLabel(swatch));
  tile.dataset.hex = swatch.hex;
  tile.title = "Click to copy hex";
  tile.style.backgroundColor = swatch.hex;

  const tooltip = document.createElement("div");
  tooltip.className = "swatch-tooltip";
  tooltip.dataset.hexLabel = swatch.hex.toUpperCase();
  tooltip.textContent = swatch.hex.toUpperCase();
  tooltip.setAttribute("role", "tooltip");

  const meta = document.createElement("div");
  meta.className = "swatch-meta";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "swatch-edit-btn";
  editBtn.dataset.swatchId = swatch.id;
  editBtn.title = "Edit color";
  editBtn.setAttribute("aria-label", `Edit ${swatch.hex}`);
  editBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">edit</span>';
  editBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openSwatchColorPicker(swatch, tile);
  });

  meta.appendChild(editBtn);
  tile.append(tooltip, meta);
  tile.addEventListener("click", () => {
    const latest = currentPalette.find((s) => s.id === swatch.id) || swatch;
    copySwatchHex(latest, tile);
  });
  return tile;
}

function createGradientTile(gradient, { variant = "grid" } = {}) {
  const tile = document.createElement("article");
  tile.className = "swatch gradient-swatch";
  if (variant === "bar") tile.classList.add("gradient-swatch-bar");
  tile.setAttribute("aria-label", `Gradient: ${gradient.css}`);
  tile.title = "Click to copy CSS";
  tile.dataset.gradientId = gradient.id || "";
  tile.style.backgroundImage = gradient.css;
  tile.style.backgroundColor = "transparent";

  const tooltip = document.createElement("div");
  tooltip.className = "swatch-tooltip";
  tooltip.dataset.fullCss = gradient.css;
  tooltip.textContent = truncateGradientLabel(gradient.css);
  tooltip.setAttribute("role", "tooltip");

  const meta = document.createElement("div");
  meta.className = "swatch-meta";

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "swatch-edit-btn gradient-copy-btn";
  copyBtn.title = "Copy CSS";
  copyBtn.setAttribute("aria-label", "Copy gradient CSS");
  copyBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">content_copy</span>';
  copyBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    copyGradientCss(gradient, tile);
  });

  meta.appendChild(copyBtn);
  tile.append(tooltip, meta);
  tile.addEventListener("click", () => copyGradientCss(gradient, tile));
  return tile;
}

function renderOrganizedSwatches(swatches) {
  for (const section of buildRoleSections(swatches, { gradients: currentGradients })) {
    const block = document.createElement("section");
    block.className = "role-section";
    if (section.kind === "gradients") block.classList.add("role-section-gradients");

    if (section.label) {
      const title = document.createElement("h2");
      title.className = "role-title";
      title.textContent = section.label;
      block.appendChild(title);
    }

    const rows = document.createElement("div");
    rows.className = "role-rows";
    for (const row of section.rows) {
      const rowEl = document.createElement("div");
      rowEl.className = "bento-row";
      for (const tile of row.tiles) {
        if (section.kind === "gradients") {
          rowEl.appendChild(createGradientTile(tile, { variant: "grid" }));
        } else {
          rowEl.appendChild(createSwatchTile(tile, { variant: "roles" }));
        }
      }
      rows.appendChild(rowEl);
    }
    block.appendChild(rows);
    swatchesEl.appendChild(block);
  }
}

function renderStackSwatches(swatches) {
  const strip = document.createElement("div");
  strip.className = "stack-strip";
  for (const { swatch } of buildStackLayout(swatches)) {
    strip.appendChild(createSwatchTile(swatch, { variant: "stack" }));
  }
  swatchesEl.appendChild(strip);
}

function renderGradientSection() {
  if (!currentGradients.length) return;
  const block = document.createElement("section");
  block.className = "role-section role-section-gradients";

  const title = document.createElement("h2");
  title.className = "role-title";
  title.textContent = "Gradients";
  block.appendChild(title);

  const rows = document.createElement("div");
  rows.className = "role-rows";
  for (const gradient of currentGradients) {
    const row = document.createElement("div");
    row.className = "bento-row bento-row-gradient";
    row.appendChild(createGradientTile(gradient, { variant: "bar" }));
    rows.appendChild(row);
  }
  block.appendChild(rows);
  swatchesEl.appendChild(block);
}

function renderSwatches(swatches) {
  closeColorPicker({ immediate: true });
  activePickerSwatchId = null;
  activePickerTile = null;
  activePickerBaseline = null;
  exitPickingMode();
  swatchesEl.innerHTML = "";
  applyColorViewToggleUi();

  if (colorViewMode === COLOR_VIEW_MODES.STACK) {
    renderStackSwatches(swatches);
    renderGradientSection();
    return;
  }
  renderOrganizedSwatches(swatches);
}

function paletteSignature(swatches) {
  return swatches
    .map((s) => `${s.locked ? "L" : "U"}:${s.hex.toLowerCase()}`)
    .sort()
    .join("|");
}

function nextShuffleSeed() {
  shuffleSeedCounter += 1;
  // Mix counter with a large odd constant so consecutive clicks explore
  // distant regions of the PRNG space (Date.now alone is too sticky).
  return Math.imul(shuffleSeedCounter, 2654435761) >>> 0;
}

function createLocalRng(seed) {
  let state = seed >>> 0 || 1;
  return function rng() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Last-resort shuffle: swap unlocked tiles to other real page colors. */
function forceAlternatePalette(swatches, rawExtraction, seed) {
  const rng = createLocalRng(seed);
  const lockedHexes = new Set(
    swatches.filter((s) => s.locked).map((s) => String(s.hex || "").toLowerCase())
  );
  const used = new Set(
    swatches.filter((s) => s.locked).map((s) => String(s.hex || "").toLowerCase())
  );
  const pool = samplePoolFromExtraction(rawExtraction, lockedHexes);

  // Fisher–Yates with seeded rng
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  let cursor = 0;
  return swatches.map((swatch) => {
    if (swatch.locked) return swatch;
    const current = String(swatch.hex || "").toLowerCase();
    while (cursor < pool.length) {
      const candidate = pool[cursor++];
      const hex = String(candidate.hex).toLowerCase();
      if (hex === current || used.has(hex)) continue;
      used.add(hex);
      return {
        ...swatch,
        hex: candidate.hex,
        rgb: candidate.rgb,
        hsl: candidate.hsl || rgbToHsl(candidate.rgb),
        usageRoles: []
      };
    }
    return swatch;
  });
}

function buildPaletteAttempt(rawExtraction, seed, avoidHexes) {
  let curated;
  try {
    curated = curatePalette(rawExtraction, {
      seed,
      avoidHexes: avoidHexes || []
    });
  } catch {
    return null;
  }
  const assigned = assignRoles(curated);
  const swatches = assigned?.swatches?.slice(0, 8) || [];
  if (!swatches.length) return null;
  return { swatches, signature: paletteSignature(swatches) };
}

/**
 * Always returns a palette that looks different from what's on screen.
 * Locked colors are injected into the extraction so new picks build around them,
 * then re-applied so they stay put while unlocked tiles refresh.
 */
function buildShuffledPalette(rawExtraction) {
  const locked = lockedSwatches();
  const seededExtraction = extractionWithLockedColors(rawExtraction, locked);
  const currentSignature = paletteSignature(currentPalette);
  const lockedHexes = locked.map((s) => s.hex);
  // Unlocked tiles should change; locked hexes must never reappear on another tile.
  const unlockedHexes = currentPalette.filter((s) => !s.locked).map((s) => s.hex);

  for (let i = 0; i < SHUFFLE_MAX_ATTEMPTS; i++) {
    const avoid =
      i < SHUFFLE_MAX_ATTEMPTS / 2
        ? [...unlockedHexes, ...lockedHexes]
        : [...lockedHexes];
    const attempt = buildPaletteAttempt(seededExtraction, nextShuffleSeed(), avoid);
    if (!attempt) continue;
    const merged = mergeLockedIntoPalette(attempt.swatches, currentPalette);
    if (paletteSignature(merged) !== currentSignature) {
      return { swatches: merged, signature: paletteSignature(merged) };
    }
  }

  const alternates = mergeLockedIntoPalette(
    forceAlternatePalette(currentPalette, rawExtraction, nextShuffleSeed()),
    currentPalette
  );
  return { swatches: alternates, signature: paletteSignature(alternates) };
}

async function shufflePalette() {
  if (activeMode !== "colors" || !lastRawExtraction || shuffleBtn.disabled) return;

  shuffleBtn.disabled = true;
  shuffleBtn.classList.add("is-shuffling");
  try {
    const attempt = buildShuffledPalette(lastRawExtraction);
    if (!attempt?.swatches?.length) return;

    currentPalette = withSlotMeta(attempt.swatches);
    generation = { ...generation, palette: currentPalette };
    syncGenerationMirrors();
    persistGenerationCache();
    renderSwatches(currentPalette);
    reportHeight();
  } finally {
    shuffleBtn.disabled = false;
    shuffleBtn.classList.remove("is-shuffling");
  }
}

function flashFontCopyFeedback(button, success) {
  if (!button) return;

  clearTimeout(button._copyFeedbackTimer);

  const previousHtml = button.innerHTML;
  const previousTitle = button.title;
  const label = success ? FONT_COPY_LABEL_COPIED : COPY_LABEL_FAILED;

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

async function openImageLightboxOnPage(url) {
  const tab = await getTargetTab();
  if (!tab?.id || isUnsupportedPageUrl(tab.url || "") || !url) return false;

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["src/content/imageLightbox.js"]
  });

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (imageUrl) => window.__prismOpenImageLightbox(imageUrl),
    args: [url]
  });

  return Boolean(injection?.result?.ok);
}

async function clearFontHighlightOnPage() {
  try {
    await runHighlightScript(() => window.__prismClearFontHighlight());
  } catch {
    /* tab may be unavailable */
  }
  setHighlightedFontCard(null);
}

function syncAssetCardSelection() {
  syncAssetCardSelectionState([imagesEl, iconsEl], {
    selectedAssetIds
  });
}

function clearAssetMultiSelection() {
  if (!selectedAssetIds.size) {
    updateFooterForMode();
    return;
  }
  selectedAssetIds = new Set();
  syncAssetCardSelection();
  updateFooterForMode();
}

function toggleAssetMultiSelect(asset) {
  if (!asset?.id) return;
  if (selectedAssetIds.has(asset.id)) {
    selectedAssetIds.delete(asset.id);
  } else {
    selectedAssetIds.add(asset.id);
  }
  // Reassign so callers holding the old Set reference aren't needed.
  selectedAssetIds = new Set(selectedAssetIds);
  syncAssetCardSelection();
  updateFooterForMode();
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

async function handleAssetDownload(asset, button) {
  const result = await downloadAsset(asset);
  flashAssetDownloadFeedback(button, Boolean(result.ok));
  if (!result.ok) {
    const message = downloadErrorMessage(result.error) || ERROR_MESSAGES.DOWNLOAD_FAILED;
    showBanner(message, { guidance: false });
  }
  return result;
}

async function handleImagePreview(asset) {
  if (!asset?.url) return;
  try {
    const ok = await openImageLightboxOnPage(asset.url);
    if (!ok) {
      showBanner("Couldn’t open the image preview on this page.", { guidance: false });
    }
  } catch (error) {
    const message = normalizeUserMessage(error?.message) || ERROR_MESSAGES.INJECTION_FAILED;
    showBanner(message, { guidance: false });
  }
}

function pruneSelectedAssetIds(assets) {
  const valid = new Set((assets || []).map((asset) => asset.id));
  let changed = false;
  for (const id of [...selectedAssetIds]) {
    if (!valid.has(id)) {
      selectedAssetIds.delete(id);
      changed = true;
    }
  }
  if (changed) {
    selectedAssetIds = new Set(selectedAssetIds);
    updateFooterForMode();
  }
}

function renderImages(images) {
  pruneSelectedAssetIds(images);
  renderAssetGrid(imagesEl, images, {
    onDownload: handleAssetDownload,
    onPreview: handleImagePreview,
    onToggleSelect: toggleAssetMultiSelect,
    selectedAssetIds
  });
}

function renderIcons(icons) {
  pruneSelectedAssetIds(icons);
  renderAssetGrid(iconsEl, icons, {
    onDownload: handleAssetDownload,
    onToggleSelect: toggleAssetMultiSelect,
    selectedAssetIds
  });
}

function renderActiveModeResults() {
  syncGenerationMirrors();
  if (activeMode === "colors") {
    renderSwatches(currentPalette);
    statusEl.textContent = "";
    return;
  }
  if (activeMode === "fonts") {
    renderFonts(currentFonts);
    return;
  }
  if (activeMode === "images") {
    renderImages(currentImages);
    return;
  }
  if (activeMode === "icons") {
    renderIcons(currentIcons);
  }
}

function switchMode(mode) {
  if (!VALID_MODES.has(mode) || mode === activeMode) return;

  closeColorPicker({ immediate: true });
  exitPickingMode();

  appEl.classList.add("is-switching");

  if (activeMode === "fonts" && mode !== "fonts") {
    clearFontHighlightOnPage();
  }
  if (
    (activeMode === "images" || activeMode === "icons") &&
    mode !== activeMode
  ) {
    clearAssetMultiSelection();
  }

  activeMode = mode;
  applyTabVisuals();

  const config = modeConfig();
  appEl.classList.toggle("mode-colors", activeMode === "colors");
  appEl.classList.toggle("mode-fonts", activeMode === "fonts");
  appEl.classList.toggle("mode-images", activeMode === "images");
  appEl.classList.toggle("mode-icons", activeMode === "icons");
  if (extractBtnLabel) extractBtnLabel.textContent = config.extractLabel;
  if (extractBtnIcon) extractBtnIcon.textContent = config.extractIcon;
  if (introDescEl) introDescEl.textContent = config.intro;

  if (hasResultsForMode(mode)) {
    setResultsState();
    renderActiveModeResults();
  } else if (generation.dismissed?.[mode]) {
    setIntroState();
  } else if (generation.inFlight) {
    setLoading(true, config.loadingStart);
  } else {
    setIntroState();
  }

  updateFooterForMode();

  // Commit the new footer styles with transitions disabled so the shared
  // reset/copy buttons swap instantly instead of animating (flicker).
  void appEl.offsetWidth;
  appEl.classList.remove("is-switching");

  reportHeightAfterLayout();

  // Auto-generate for tabs that still need results (never after Reset).
  ensureResultsForActiveMode({ reason: "tab-switch" });
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

async function runAssetExtractionOnTab(tab) {
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["src/content/extractAssets.js"]
  });

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.__prismExtractAssets({ maxCandidates: 400 })
  });

  if (!injection) {
    const err = new Error("Script injection returned no result.");
    err.injectionFailed = true;
    throw err;
  }

  return injection.result;
}

function curateColorsFromRaw(result) {
  if (isExtractionResultEmpty(result)) return null;
  let curated;
  try {
    curated = curatePalette(result);
  } catch {
    return null;
  }
  const assigned = assignRoles(curated);
  if (!assigned?.swatches?.length) return null;
  return withSlotMeta(assigned.swatches.slice(0, 8));
}

function curateGradientsFromRaw(result) {
  try {
    return curateGradients(result?.gradients || []);
  } catch {
    return [];
  }
}

function curateFontsFromRaw(result) {
  if (isFontExtractionEmpty(result)) return null;
  const curatedFonts = curateFonts(result);
  if (!curatedFonts.hasFonts || !curatedFonts.fonts.length) return null;
  return curatedFonts.fonts;
}

function showActiveModeResults() {
  syncGenerationMirrors();
  if (!hasResultsForMode(activeMode)) return false;
  setResultsState();
  renderActiveModeResults();
  setLoading(false);
  reportHeightAfterLayout();
  return true;
}

function applyRawToGeneration(result, pageKey, requestId) {
  const palette = generation.dismissed.colors ? generation.palette : curateColorsFromRaw(result);
  const gradients = generation.dismissed.colors
    ? generation.gradients
    : curateGradientsFromRaw(result);
  const fonts = generation.dismissed.fonts ? generation.fonts : curateFontsFromRaw(result);

  generation = applyExtractionSuccess(generation, {
    pageKey,
    rawExtraction: result,
    palette: palette || [],
    gradients: gradients || [],
    fonts: fonts || [],
    requestId
  });
  syncGenerationMirrors();
  persistGenerationCache();

  if (activeMode === "colors") {
    if (!palette?.length && !generation.dismissed.colors) {
      showError(null, { noPalette: true });
      return false;
    }
  } else if (activeMode === "fonts" && !fonts?.length && !generation.dismissed.fonts) {
    showError(null, { noFonts: true });
    return false;
  }

  if (!isAssetMode(activeMode)) {
    return showActiveModeResults();
  }
  return false;
}

function curateImagesFromRaw(result) {
  if (isAssetExtractionEmpty(result)) return null;
  const images = curateImages(result.candidates || [], { baseHref: result.baseHref });
  return images.length ? images : null;
}

function curateIconsFromRaw(result) {
  if (isAssetExtractionEmpty(result)) return null;
  const icons = curateIcons(result.candidates || [], { baseHref: result.baseHref });
  return icons.length ? icons : null;
}

function applyRawAssetsToGeneration(result, pageKey, requestId) {
  const images = generation.dismissed.images ? generation.images : curateImagesFromRaw(result);
  const icons = generation.dismissed.icons ? generation.icons : curateIconsFromRaw(result);

  generation = applyAssetsSuccess(generation, {
    pageKey,
    rawAssets: result,
    images: images || [],
    icons: icons || [],
    requestId
  });
  syncGenerationMirrors();
  persistGenerationCache();

  if (activeMode === "images") {
    if (!images?.length && !generation.dismissed.images) {
      showError(null, { noImages: true });
      return false;
    }
  } else if (activeMode === "icons") {
    if (!icons?.length && !generation.dismissed.icons) {
      showError(null, { noIcons: true });
      return false;
    }
  }

  return showActiveModeResults();
}
async function scanPage(tab, requestId) {
  const config = modeConfig();
  const tabUrl = tab.url || "";
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

  try {
    const result = await Promise.race([scriptPromise, timeoutPromise]);
    if (isStaleRequest(generation, requestId)) return null;
    return result;
  } catch (error) {
    if (isStaleRequest(generation, requestId)) return null;
    generation = clearInFlight(generation);
    showError(error, {
      timedOut,
      injectionFailed: Boolean(error?.injectionFailed),
      unsupportedPage: isUnsupportedPageUrl(tabUrl)
    });
    return null;
  }
}

async function scanAssets(tab, requestId) {
  const config = modeConfig();
  const tabUrl = tab.url || "";

  let timedOut = false;
  const scriptPromise = runAssetExtractionOnTab(tab).catch((error) => {
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

  try {
    const result = await Promise.race([scriptPromise, timeoutPromise]);
    if (isStaleRequest(generation, requestId)) return null;
    return result;
  } catch (error) {
    if (isStaleRequest(generation, requestId)) return null;
    generation = clearInFlight(generation);
    showError(error, {
      timedOut,
      injectionFailed: Boolean(error?.injectionFailed),
      unsupportedPage: isUnsupportedPageUrl(tabUrl)
    });
    return null;
  }
}

/**
 * Shared entry for auto-open, tab switches, and explicit Generate.
 * Dedupes in-flight scans; reuses page cache; never auto-runs after Reset.
 */
async function ensureResultsForActiveMode({ force = false, reason = "auto" } = {}) {
  const config = modeConfig();
  const assetMode = isAssetMode(activeMode);

  if (isRestrictedPopupContext()) {
    if (reason === "auto" || reason === "tab-switch") return;
    showBanner(GUIDANCE_COPY.message, { guidance: true, title: GUIDANCE_COPY.title });
    return;
  }

  let tab;
  try {
    tab = await getTargetTab();
  } catch {
    tab = null;
  }

  if (!tab?.id) {
    if (force) showError(null, { noTab: true });
    return;
  }

  const tabUrl = tab.url || "";
  if (isUnsupportedPageUrl(tabUrl)) {
    if (force || reason === "auto") {
      showBanner(GUIDANCE_COPY.message, { guidance: true, title: GUIDANCE_COPY.title });
    }
    return;
  }

  const pageKey = makePageKey(tab);
  const previousKey = generation.pageKey;
  generation = invalidatePage(generation, pageKey);
  if (previousKey && pageKey && previousKey !== pageKey) {
    syncGenerationMirrors();
  }

  if (force) {
    generation = markModeForManualGenerate(generation, activeMode);
  } else {
    if (canReuseModeResults(generation, { mode: activeMode, pageKey })) {
      showActiveModeResults();
      return;
    }
    if (!shouldAutoGenerate(generation, { mode: activeMode, pageKey })) {
      return;
    }
  }

  // Rebuild curated results from a still-valid page scan (covers the other tab
  // and Generate-after-Reset without a duplicate injection).
  if (assetMode) {
    if (canReuseRawAssets(generation, { pageKey })) {
      applyRawAssetsToGeneration(generation.rawAssets, pageKey, generation.requestId);
      if (hasResultsForMode(activeMode)) return;
      if (!force && generation.dismissed[activeMode]) return;
    }
  } else if (canReuseRawExtraction(generation, { pageKey })) {
    applyRawToGeneration(generation.rawExtraction, pageKey, generation.requestId);
    if (hasResultsForMode(activeMode)) return;
    if (!force && generation.dismissed[activeMode]) return;
  }

  if (generation.inFlight) {
    setLoading(true, config.loadingStart);
    try {
      await generation.inFlight;
    } catch {
      /* error surfaced by owner */
    }
    if (canReuseModeResults(generation, { mode: activeMode, pageKey })) {
      showActiveModeResults();
      return;
    }
    // A shared in-flight scan may have been for the other pipeline
    // (palette vs assets). Fall through and start the correct scan.
    if (!force && generation.dismissed?.[activeMode]) return;
    if (assetMode && canReuseRawAssets(generation, { pageKey })) {
      applyRawAssetsToGeneration(generation.rawAssets, pageKey, generation.requestId);
      if (hasResultsForMode(activeMode)) return;
    }
    if (!assetMode && canReuseRawExtraction(generation, { pageKey })) {
      applyRawToGeneration(generation.rawExtraction, pageKey, generation.requestId);
      if (hasResultsForMode(activeMode)) return;
    }
    if (generation.inFlight) {
      // Another request started while we awaited — join it once more.
      try {
        await generation.inFlight;
      } catch {
        /* owner surfaces errors */
      }
      if (canReuseModeResults(generation, { mode: activeMode, pageKey })) {
        showActiveModeResults();
      }
      return;
    }
  }

  clearError();
  setLoading(true, config.loadingStart);
  generation = beginRequest(generation);
  const requestId = generation.requestId;
  const scanIsAssets = assetMode;

  const scanPromise = (scanIsAssets ? scanAssets(tab, requestId) : scanPage(tab, requestId))
    .then((result) => {
      generation = clearInFlight(generation);
      if (!result || isStaleRequest(generation, requestId)) return null;
      if (scanIsAssets) applyRawAssetsToGeneration(result, pageKey, requestId);
      else applyRawToGeneration(result, pageKey, requestId);
      return result;
    })
    .catch((error) => {
      generation = clearInFlight(generation);
      throw error;
    });

  generation = setInFlight(generation, scanPromise);

  try {
    await scanPromise;
  } catch {
    /* showError already called from scan helpers */
  }
}async function runExtraction() {
  extractBtn.disabled = true;
  try {
    await ensureResultsForActiveMode({ force: true, reason: "manual" });
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
bindTabSwitch(tabImagesBtn, "images");
bindTabSwitch(tabIconsBtn, "icons");
extractBtn.addEventListener("click", runExtraction);
if (reloadBtn) reloadBtn.addEventListener("click", onReloadOrDownloadClick);
if (clearSelectionBtn) {
  clearSelectionBtn.addEventListener("click", clearAssetMultiSelection);
}
shuffleBtn.addEventListener("click", shufflePalette);

if (colorViewToggleEl) {
  colorViewToggleEl.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-view]");
    if (!btn || !colorViewToggleEl.contains(btn)) return;
    setColorViewMode(btn.dataset.view);
  });
}

if (swatchesEl) {
  swatchesEl.addEventListener("pointerover", (event) => {
    const tile = event.target.closest?.(".swatch");
    if (!tile || !swatchesEl.contains(tile) || tile.classList.contains("swatch-stack")) return;
    if (tile._tooltipClampBound) return;
    tile._tooltipClampBound = true;
    requestAnimationFrame(() => {
      if (!clampSwatchTooltip(tile)) tile._tooltipClampBound = false;
    });
  });
  swatchesEl.addEventListener("pointerout", (event) => {
    const tile = event.target.closest?.(".swatch");
    if (!tile || !swatchesEl.contains(tile)) return;
    const next = event.relatedTarget?.closest?.(".swatch");
    if (next === tile) return;
    tile._tooltipClampBound = false;
    resetSwatchTooltipShift(tile.querySelector(".swatch-tooltip"));
  });
  swatchesEl.addEventListener("focusin", (event) => {
    const tile = event.target.closest?.(".swatch");
    if (!tile || !swatchesEl.contains(tile) || tile.classList.contains("swatch-stack")) return;
    requestAnimationFrame(() => clampSwatchTooltip(tile));
  });
}

copyBtn.addEventListener("click", async () => {
  syncGenerationMirrors();
  if (!currentPalette.length) {
    showError(null, { noPalette: true });
    return;
  }

  try {
    await copyPaletteImage(currentPalette, exportPageMeta, {
      viewMode: colorViewMode,
      gradients: currentGradients.length
        ? currentGradients
        : generation.gradients || []
    });
    statusEl.textContent = "";
    flashCopyFeedback(true);
  } catch (error) {
    const message = normalizeUserMessage(error?.message) || ERROR_MESSAGES.COPY_FAILED;
    showBanner(message, { guidance: false });
    flashCopyFeedback(false);
  }
});

// Lightbox close is handled in-page; keep the pink highlight so the selection
// remains visible afterward (toggle off by clicking the same tile again).

async function bootstrapPopup() {
  colorViewMode = await loadColorViewMode();
  applyColorViewToggleUi();
  updateModeChrome();

  if (isRestrictedPopupContext()) {
    setIntroState();
    showBanner(GUIDANCE_COPY.message, { guidance: true, title: GUIDANCE_COPY.title });
    return;
  }

  let tab = null;
  try {
    tab = await getTargetTab();
  } catch {
    tab = null;
  }

  if (!tab?.id) {
    setIntroState();
    showBanner(ERROR_MESSAGES.NO_TAB, { guidance: true, title: "No active tab" });
    return;
  }

  if (isUnsupportedPageUrl(tab.url)) {
    setIntroState();
    showBanner(GUIDANCE_COPY.message, { guidance: true, title: GUIDANCE_COPY.title });
    return;
  }

  const pageKey = makePageKey(tab);
  const cached = await loadGenerationCache(pageKey);
  if (cached?.pageKey === pageKey) {
    generation = restoreGenerationCache(cached);
    syncGenerationMirrors();
    if (canReuseModeResults(generation, { mode: activeMode, pageKey })) {
      showActiveModeResults();
      return;
    }
  }

  setIntroState();
  await ensureResultsForActiveMode({ reason: "auto" });
}

bootstrapPopup();
