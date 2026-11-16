import { curatePalette } from "../core/scoreAndCluster.js";
import { assignRoles } from "../core/assignRoles.js";
import { curateFonts } from "../core/curateFonts.js";
import { curateImages } from "../core/curateImages.js";
import { curateIcons } from "../core/curateIcons.js";
import { curateGradients, extractGradientStops, gradientKind } from "../core/curateGradients.js";
import { shadeColor, hexToRgb, rgbToHsl, rgbToHex, isPureBlackOrWhite } from "../core/colorLab.js";
import { openColorPicker, closeColorPicker } from "./colorPicker.js";
import { openGradientPicker, closeGradientPicker } from "./gradientPicker.js";
import { formatExportTitle, readPageMetaFromTab } from "./exportPaletteImage.js";
import { copyPaletteSvg } from "./exportPaletteSvg.js";
import { buildPaletteCss, copyPaletteCss } from "./exportPaletteCss.js";
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
import { shouldAcceptChildPanelMessage } from "../core/panelMessages.js";
import { previewFontWeight } from "../core/fontUtils.js";
import { ensureFontPreviewLoaded, MAX_FONT_PREVIEW_BYTES } from "./fontPreview.js";
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
  flashAssetCopyFeedback,
  flashAssetDownloadFeedback,
  syncAssetCardSelectionState
} from "./assetsView.js";
import {
  downloadAsset,
  downloadAssetsAsZip,
  downloadErrorMessage,
  resolveSvgMarkup
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
const tabIndicatorEl = document.getElementById("tabIndicator");
const colorViewToggleEl = document.getElementById("colorViewToggle");
const pagePreviewToggleEl = document.getElementById("pagePreviewToggle");
const pagePreviewToggleWrapEl = document.getElementById("pagePreviewToggleWrap");
const pagePreviewToggleLabelEl = document.getElementById("pagePreviewToggleLabel");
const colorContentMenuEl = document.getElementById("colorContentMenu");
const colorContentMenuBtn = document.getElementById("colorContentMenuBtn");
const colorContentMenuList = document.getElementById("colorContentMenuList");
const colorContentMenuIcon = document.getElementById("colorContentMenuIcon");
const colorContentMenuLabel = document.getElementById("colorContentMenuLabel");
const paletteStageEl = document.querySelector(".palette-stage");
const cssExportPanelEl = document.getElementById("cssExportPanel");
const cssExportCodeEl = document.getElementById("cssExportCode");
const siteBrandEl = document.getElementById("siteBrand");
const siteBrandLogoWrapEl = document.getElementById("siteBrandLogoWrap");
const siteBrandLogoEl = document.getElementById("siteBrandLogo");
const siteBrandTitleEl = document.getElementById("siteBrandTitle");
const panelHeaderEl = document.querySelector(".panel-header");
const dragHandleEl = document.getElementById("dragHandle");
const isEmbedded = window.parent !== window;
const localColorPickerMountEl = document.createElement("div");
localColorPickerMountEl.className = "color-picker-floating-mount";
localColorPickerMountEl.hidden = true;
document.body.appendChild(localColorPickerMountEl);

const localStopColorPickerMountEl = document.createElement("div");
localStopColorPickerMountEl.className = "color-picker-floating-mount color-picker-stop-floating-mount";
localStopColorPickerMountEl.hidden = true;
document.body.appendChild(localStopColorPickerMountEl);

let localGradientPickerApi = null;
let localStopEditId = null;
let localStopPickerGen = 0;
let ignoreLocalStopClose = false;
const EXTRACTION_TIMEOUT_MS = 8000;
const FULL_SCAN_PAGE_MS = 8000;
const FULL_SCAN_ASSETS_MS = 6000;
const STANDALONE_WINDOW_CHROME_X = 16;
const STANDALONE_WINDOW_CHROME_Y = 40;

const MODE_COPY = {
  colors: {
    extractLabel: "Extract color palette",
    extractIcon: "palette",
    copyLabel: "Copy color palette to Figma",
    intro: "Extract the color palette used on this webpage",
    loadingStart: "Looking at colors on this page…",
    loadingBuild: "Putting your palette together…",
    loadingLines: [
      "Looking at colors on this page…",
      "Sorting backgrounds and text…",
      "Picking up accents…",
      "Checking for gradients…",
      "Putting your palette together…"
    ]
  },
  fonts: {
    extractLabel: "Extract font families",
    extractIcon: "text_fields",
    intro: "Extract the font families used on this webpage",
    loadingStart: "Looking at the type on this page…",
    loadingBuild: "Keeping the fonts that matter…",
    loadingLines: [
      "Looking at the type on this page…",
      "Finding the font families in use…",
      "Keeping the ones that matter…"
    ]
  },
  images: {
    extractLabel: "Extract images",
    extractIcon: "image",
    intro: "Find downloadable images on this webpage",
    loadingStart: "Looking for images on this page…",
    loadingBuild: "Picking the ones worth saving…",
    loadingLines: [
      "Looking for images on this page…",
      "Picking the ones worth saving…",
      "Almost there…"
    ]
  },
  icons: {
    extractLabel: "Extract icons",
    extractIcon: "imagesmode",
    intro: "Find downloadable icons on this webpage",
    loadingStart: "Looking for icons and logos…",
    loadingBuild: "Sorting out the useful ones…",
    loadingLines: [
      "Looking for icons and logos…",
      "Sorting out the useful ones…",
      "Almost there…"
    ]
  }
};

const LOADING_LINE_MS = 1200;
const FULL_SCAN_LOADING_LINES = [
  "Looking at colors on this page…",
  "Sorting backgrounds and text…",
  "Finding the fonts in use…",
  "Checking for gradients…",
  "Looking for images…",
  "Picking up icons and logos…",
  "Putting it all together…"
];
let loadingLineTimer = null;
let loadingLineIndex = 0;
let loadingSwapTimer = null;
let loadingScope = "mode";

function stopLoadingLines() {
  if (loadingLineTimer) {
    clearInterval(loadingLineTimer);
    loadingLineTimer = null;
  }
  if (loadingSwapTimer) {
    clearTimeout(loadingSwapTimer);
    loadingSwapTimer = null;
  }
  loadingLineIndex = 0;
  loadingTextEl?.classList.remove("is-swapping");
}

function loadingLinesForScope(scope = loadingScope, mode = activeMode) {
  if (scope === "all") return FULL_SCAN_LOADING_LINES;
  const config = MODE_COPY[mode] || MODE_COPY.colors;
  return config.loadingLines?.length ? config.loadingLines : [config.loadingStart];
}

function startLoadingLines(mode = activeMode, firstLine = null, scope = loadingScope) {
  stopLoadingLines();
  loadingScope = scope;
  const lines = loadingLinesForScope(scope, mode);
  const match = firstLine ? lines.indexOf(firstLine) : -1;
  loadingLineIndex = match >= 0 ? match : 0;
  if (loadingTextEl) {
    loadingTextEl.textContent = firstLine || lines[loadingLineIndex];
  }
  if (lines.length < 2) return;

  loadingLineTimer = window.setInterval(() => {
    if (!loadingTextEl) return;
    loadingTextEl.classList.add("is-swapping");
    loadingSwapTimer = window.setTimeout(() => {
      loadingLineIndex = (loadingLineIndex + 1) % lines.length;
      loadingTextEl.textContent = lines[loadingLineIndex];
      loadingTextEl.classList.remove("is-swapping");
      loadingSwapTimer = null;
    }, 180);
  }, LOADING_LINE_MS);
}

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
let cssPreviewOpen = false;
let pagePreviewEnabled = false;
let pagePreviewTimer = null;
let pagePreviewPending = null;
const PAGE_PREVIEW_LABEL_ON = "Changes show on the page";
const PAGE_PREVIEW_LABEL_OFF = "Changes stay in the palette";
let generation = createGenerationState();

const COPY_LABEL_COPIED = "Copied! Paste in Figma";
const COPY_LABEL_CSS = "Copy CSS";
const COPY_LABEL_CSS_COPIED = "Copied!";
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
  const cache = serializeGenerationCache(generation);
  // Never persist in-session color edits or shuffles. On reopen the palette
  // should match the webpage scan again, not the user's temporary tweaks.
  if (generation.rawExtraction && !generation.dismissed?.colors) {
    cache.palette = curateColorsFromRaw(generation.rawExtraction) || [];
    cache.gradients = curateGradientsFromRaw(generation.rawExtraction) || [];
  }
  await sendRuntimeMessage({
    type: "prism-generation-cache-set",
    pageKey: generation.pageKey,
    cache
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

  // Bottom of the last in-flow child is the true content edge.
  for (const child of app.children) {
    if (!isDisplayed(child)) continue;
    const position = getComputedStyle(child).position;
    if (position === "absolute" || position === "fixed") continue;
    height = Math.max(height, child.offsetTop + child.offsetHeight);
  }

  return Math.max(1, Math.ceil(height));
}

let lastReportedHeight = 0;
const PANEL_MAX_HEIGHT = 720;

function reportHeight() {
  const app = document.querySelector(".app");
  if (!app) return;

  // Measure natural content height without a prior viewport cap applied.
  app.classList.remove("is-height-capped");
  app.style.removeProperty("height");
  app.style.removeProperty("max-height");

  const contentHeight = measureAppHeight(app);
  const html = document.documentElement;
  const body = document.body;

  if (isEmbedded) {
    // Ask the host to size the iframe (host also clamps to the page viewport).
    if (Math.abs(contentHeight - lastReportedHeight) >= 1) {
      lastReportedHeight = contentHeight;
      window.parent.postMessage({ type: "prism-resize", height: contentHeight }, "*");
    }

    // Fit into the iframe. When the host capped us shorter than content,
    // scroll the body so footer CTAs stay visible on small laptops.
    const frameH = Math.max(1, Math.floor(window.innerHeight));
    const capped = contentHeight > frameH + 1;
    const height = capped ? frameH : contentHeight;
    html.style.setProperty("height", `${height}px`, "important");
    body.style.setProperty("height", `${height}px`, "important");
    if (capped) {
      app.style.setProperty("height", `${height}px`, "important");
      app.classList.add("is-height-capped");
      html.style.setProperty("overflow", "hidden", "important");
      body.style.setProperty("overflow", "hidden", "important");
    } else {
      app.style.removeProperty("height");
      app.classList.remove("is-height-capped");
      html.style.removeProperty("overflow");
      body.style.removeProperty("overflow");
    }
    syncPaletteScrollGutters();
    return;
  }

  html.style.setProperty("height", `${contentHeight}px`, "important");
  body.style.setProperty("height", `${contentHeight}px`, "important");
  app.style.removeProperty("height");
  app.classList.remove("is-height-capped");

  syncPaletteScrollGutters();
  if (Math.abs(contentHeight - lastReportedHeight) < 1) return;
  lastReportedHeight = contentHeight;
  resizeStandaloneWindow();
}

function syncPaletteScrollGutters() {
  if (!swatchesEl || !paletteStageEl) return;
  // 1px slack avoids flicker when fractional layout heights are near equal.
  const hasScroll = swatchesEl.scrollHeight > swatchesEl.clientHeight + 1;
  paletteStageEl.classList.toggle("has-v-scroll", hasScroll);
}

/** Remeasure after layout settles so tab/view switches hug the new content. */
function reportHeightAfterLayout() {
  lastReportedHeight = 0; // allow shrink after dynamic content changes
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      layoutTabIndicator();
      reportHeight();
      syncPaletteScrollGutters();
    });
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
          const screenCap = Math.max(
            180,
            (window.screen?.availHeight || PANEL_MAX_HEIGHT) - 100
          );
          chrome.windows.update(win.id, {
            width: Math.min(Math.max(windowWidth, 320), 480),
            height: Math.min(
              Math.max(windowHeight, 180),
              Math.min(PANEL_MAX_HEIGHT, screenCap)
            )
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
      resizeFrame = requestAnimationFrame(() => {
        reportHeight();
        syncPaletteScrollGutters();
      });
    }).observe(appEl);
  }
  if (swatchesEl) {
    new ResizeObserver(() => {
      requestAnimationFrame(() => syncPaletteScrollGutters());
    }).observe(swatchesEl);
  }
  window.addEventListener("load", () => {
    lastReportedHeight = 0;
    reportHeight();
  });
  window.addEventListener("message", (event) => {
    // Host page is cross-origin; trust the embedding parent window only.
    if (!shouldAcceptChildPanelMessage(event, window.parent)) return;
    if (event.data?.type === "prism-request-resize") {
      lastReportedHeight = 0;
      reportHeight();
      return;
    }
    onHostColorPickerMessage(event);
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

function defaultCopyLabel() {
  return cssPreviewOpen ? COPY_LABEL_CSS : MODE_COPY.colors.copyLabel;
}

function defaultCopySuccessLabel() {
  return cssPreviewOpen ? COPY_LABEL_CSS_COPIED : COPY_LABEL_COPIED;
}

function currentCssExportOptions() {
  return {
    gradients: currentGradients.length ? currentGradients : generation.gradients || [],
    pageMeta: exportPageMeta
  };
}

function refreshCssExportPreview() {
  if (!cssExportCodeEl) return;
  cssExportCodeEl.textContent = buildPaletteCss(currentPalette, currentCssExportOptions());
}

const COLOR_CONTENT_OPTIONS = {
  palette: { label: "Palette", icon: "palette" },
  css: { label: "CSS", icon: "data_object" }
};

function setColorContentMenuOpen(open) {
  if (!colorContentMenuEl || !colorContentMenuBtn || !colorContentMenuList) return;
  colorContentMenuEl.classList.toggle("is-open", open);
  colorContentMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
  colorContentMenuList.hidden = !open;
}

function closeColorContentMenu() {
  setColorContentMenuOpen(false);
}

function applyColorContentMenuUi() {
  if (!colorContentMenuEl) return;
  const active = cssPreviewOpen ? "css" : "palette";
  const option = COLOR_CONTENT_OPTIONS[active] || COLOR_CONTENT_OPTIONS.palette;
  colorContentMenuEl.dataset.active = active;
  if (colorContentMenuIcon) colorContentMenuIcon.textContent = option.icon;
  if (colorContentMenuLabel) colorContentMenuLabel.textContent = option.label;
  for (const btn of colorContentMenuEl.querySelectorAll("[data-content]")) {
    const on = btn.dataset.content === active;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  }
  closeColorContentMenu();
}

function applyPagePreviewToggleUi() {
  if (pagePreviewToggleEl) pagePreviewToggleEl.checked = pagePreviewEnabled;
  if (pagePreviewToggleLabelEl) {
    pagePreviewToggleLabelEl.textContent = pagePreviewEnabled
      ? PAGE_PREVIEW_LABEL_ON
      : PAGE_PREVIEW_LABEL_OFF;
  }
  if (pagePreviewToggleWrapEl) {
    pagePreviewToggleWrapEl.hidden = cssPreviewOpen;
    pagePreviewToggleWrapEl.classList.toggle("is-on", pagePreviewEnabled);
  }
}

function applyCssPreviewUi() {
  appEl.classList.toggle("is-css-preview", cssPreviewOpen);
  if (cssExportPanelEl) cssExportPanelEl.hidden = !cssPreviewOpen;
  applyColorContentMenuUi();
  if (colorViewToggleEl) {
    colorViewToggleEl.setAttribute("aria-hidden", cssPreviewOpen ? "true" : "false");
  }
  applyPagePreviewToggleUi();
  if (shuffleBtn) shuffleBtn.hidden = activeMode !== "colors" || cssPreviewOpen;
  if (!copyFeedbackTimer) {
    setCopyButtonState(defaultCopyLabel(), COPY_ICON_DEFAULT);
  }
}

function openCssPreview() {
  if (!currentPalette.length) {
    showError(null, { noPalette: true });
    return;
  }
  dismissSwatchColorPicker({ immediate: true });
  cssPreviewOpen = true;
  refreshCssExportPreview();
  applyCssPreviewUi();
  updateFooterForMode();
  reportHeightAfterLayout();
}

function closeCssPreview({ report = true } = {}) {
  if (!cssPreviewOpen) {
    applyCssPreviewUi();
    return;
  }
  cssPreviewOpen = false;
  applyCssPreviewUi();
  updateFooterForMode();
  if (report) reportHeightAfterLayout();
}

function setColorContentView(view) {
  const next = view === "css" ? "css" : "palette";
  if (next === "css") {
    openCssPreview();
    return;
  }
  closeCssPreview();
  updateFooterForMode();
}

function flashCopyFeedback(success) {
  clearTimeout(copyFeedbackTimer);
  setCopyButtonState(
    success ? defaultCopySuccessLabel() : COPY_LABEL_FAILED,
    success ? COPY_ICON_COPIED : COPY_ICON_FAILED
  );
  copyFeedbackTimer = setTimeout(() => {
    copyFeedbackTimer = null;
    setCopyButtonState(defaultCopyLabel(), COPY_ICON_DEFAULT);
  }, 3500);
}

function layoutTabIndicator() {
  if (!tabBarEl || !tabIndicatorEl) return;
  const activeBtn = [tabColorsBtn, tabFontsBtn, tabImagesBtn, tabIconsBtn].find(
    (btn) => btn && btn.dataset.mode === activeMode && !btn.hidden
  );
  if (!activeBtn) {
    tabIndicatorEl.style.opacity = "0";
    return;
  }
  tabIndicatorEl.style.opacity = "1";
  tabIndicatorEl.style.width = `${activeBtn.offsetWidth}px`;
  tabIndicatorEl.style.left = `${activeBtn.offsetLeft}px`;
}

/** Hide any tab whose pipeline finished with nothing to show. */
function syncAssetTabVisibility() {
  const pageKnown = Boolean(generation.rawExtraction);
  const assetsKnown = Boolean(generation.rawAssets);
  const showColors = !pageKnown || currentPalette.length > 0;
  const showFonts = !pageKnown || currentFonts.length > 0;
  const showImages = !assetsKnown || currentImages.length > 0;
  const showIcons = !assetsKnown || currentIcons.length > 0;

  if (tabColorsBtn) tabColorsBtn.hidden = !showColors;
  if (tabFontsBtn) tabFontsBtn.hidden = !showFonts;
  if (tabImagesBtn) tabImagesBtn.hidden = !showImages;
  if (tabIconsBtn) tabIconsBtn.hidden = !showIcons;

  if (tabBarEl) {
    const visibleCount =
      (showColors ? 1 : 0) +
      (showFonts ? 1 : 0) +
      (showImages ? 1 : 0) +
      (showIcons ? 1 : 0);
    tabBarEl.dataset.tabCount = String(visibleCount);
  }

  layoutTabIndicator();
}

function leaveEmptyAssetMode() {
  setLoading(false);
  const fallback =
    currentPalette.length > 0 ? "colors" : currentFonts.length > 0 ? "fonts" : "colors";
  if (activeMode === fallback) {
    syncAssetTabVisibility();
    if (hasResultsForMode(fallback)) showActiveModeResults();
    else setIntroState();
    reportHeightAfterLayout();
    return;
  }
  activeMode = fallback;
  updateModeChrome();
  syncAssetTabVisibility();
  if (hasResultsForMode(fallback)) showActiveModeResults();
  else {
    setIntroState();
    setLoading(false);
  }
  reportHeightAfterLayout();
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
  syncAssetTabVisibility();
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
    setCopyButtonState(defaultCopyLabel(), COPY_ICON_DEFAULT);
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
    // Icons are usually packable (inline/same-origin SVG). Images often can't be
    // read for a ZIP (CDN CORS), so don't promise "zip" there.
    const downloadLabel =
      activeMode === "icons" ? `Download zip (${count})` : `Download (${count})`;
    reloadBtnLabel.textContent = downloading ? downloadLabel : "Reload";
  }
  const label = downloading
    ? activeMode === "icons"
      ? `Download ${count} selected as zip`
      : `Download ${count} selected`
    : "Reload";
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
    // Colors: Shuffle (palette only) + Copy Figma / CSS in the footer.
    if (shuffleBtn) shuffleBtn.hidden = cssPreviewOpen;
    copyBtn.hidden = false;
    if (reloadBtn) reloadBtn.hidden = true;
    if (clearSelectionBtn) {
      clearSelectionBtn.hidden = true;
      clearSelectionBtn.setAttribute("hidden", "");
    }
    if (!copyFeedbackTimer) {
      setCopyButtonState(defaultCopyLabel(), COPY_ICON_DEFAULT);
    }
    return;
  }

  closeCssPreview({ report: false });
  closeColorContentMenu();

  // Fonts: Reload only. Images / Icons: Reload, or Download + Unselect when selecting.
  if (shuffleBtn) shuffleBtn.hidden = true;
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
  syncAssetTabVisibility();
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
  dismissSwatchColorPicker({ immediate: true });
  closeCssPreview({ report: false });
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
  syncAssetTabVisibility();
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

function setLoading(active, message, { scope = "mode" } = {}) {
  if (active) {
    dismissSwatchColorPicker({ immediate: true });
    closeCssPreview({ report: false });
  }
  appEl.classList.toggle("is-loading", active);
  loadingEl.hidden = !active;
  if (active) {
    clearError();
    introEl.hidden = true;
    hideAllResultPanels();
    // Full-scan loader: chrome stays out of the way until everything is ready.
    if (tabBarEl) tabBarEl.hidden = true;
    if (panelFooterEl) panelFooterEl.hidden = true;
    startLoadingLines(activeMode, message || null, scope);
  } else {
    stopLoadingLines();
    if (panelFooterEl) panelFooterEl.hidden = false;
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
    generation = { ...generation, rawAssets: null, images: [], icons: [] };
  } else {
    generation = { ...generation, rawExtraction: null };
  }
  syncGenerationMirrors();
  syncAssetTabVisibility();

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
    const labelEl = tip.querySelector(".swatch-tooltip-label");
    if (labelEl) labelEl.textContent = hexLabel;
    else tip.textContent = hexLabel;
    const copyBtn = tip.querySelector(".swatch-tooltip-copy");
    if (copyBtn) copyBtn.dataset.copyValue = swatch.hex;
  }
  const editBtn = tile.querySelector(".swatch-edit-btn");
  if (editBtn) {
    editBtn.setAttribute("aria-label", `Edit ${swatch.hex}`);
    editBtn.title = "Edit color";
  }
}

function shouldPreviewColorOnPage() {
  // Live edits always preview while a picker is open; the toolbar toggle keeps
  // preview armed for this page even between edits.
  return pagePreviewEnabled || Boolean(activePickerMode);
}

function updateSwatchColor(swatchId, hex, { commit = false, tile = null } = {}) {
  const previousHex = currentPalette.find((s) => s.id === swatchId)?.hex || null;
  const parsed = applyColorToSwatchState(swatchId, hex);
  if (!parsed) return;

  const swatch = currentPalette.find((s) => s.id === swatchId);
  const liveTiles = [...swatchesEl.querySelectorAll(".swatch")].filter((el) => {
    const btn = el.querySelector(".swatch-edit-btn");
    return btn?.dataset.swatchId === swatchId;
  });
  if (tile && !liveTiles.includes(tile)) liveTiles.push(tile);
  for (const liveTile of liveTiles) paintSwatchTile(liveTile, swatch);
  const nextHex = String(parsed.hex || "").toLowerCase();
  const baselineHex = String(
    (activePickerBaseline?.id === swatchId && activePickerBaseline?.hex) || previousHex || ""
  ).toLowerCase();
  if (shouldPreviewColorOnPage() && baselineHex && nextHex && baselineHex !== nextHex) {
    schedulePageColorPreview({
      mode: "solid",
      swatchId,
      fromHex: baselineHex,
      toHex: nextHex
    });
  }
  if (commit) {
    persistGenerationCache();
    reportHeight();
  }
}

let activePickerSwatchId = null;
let activePickerGradientId = null;
let activePickerMode = null;
let activePickerTile = null;
let activePickerBaseline = null;
let activePickerGradientBaselineCss = null;
const LOCAL_PICKER_WIDTH = 280;
const LOCAL_PICKER_GAP = 10;

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

function clearLocalStopColorPicker() {
  localStopEditId = null;
  localStopColorPickerMountEl.hidden = true;
  localStopColorPickerMountEl.replaceChildren();
  localStopColorPickerMountEl.style.left = "";
  localStopColorPickerMountEl.style.top = "";
}

function clearActivePickerUi() {
  activePickerTile?.classList.remove("is-editing");
  activePickerSwatchId = null;
  activePickerGradientId = null;
  activePickerMode = null;
  activePickerTile = null;
  activePickerBaseline = null;
  activePickerGradientBaselineCss = null;
  localGradientPickerApi = null;
  clearLocalStopColorPicker();
  localColorPickerMountEl.hidden = true;
  localColorPickerMountEl.replaceChildren();
  localColorPickerMountEl.style.left = "";
  localColorPickerMountEl.style.top = "";
}

function positionLocalColorPicker(tile) {
  if (!tile || localColorPickerMountEl.hidden) return;
  const tileRect = tile.getBoundingClientRect();
  const height = Math.max(
    160,
    Math.ceil(localColorPickerMountEl.getBoundingClientRect().height || 280)
  );
  const leftCandidate = tileRect.left - LOCAL_PICKER_WIDTH - LOCAL_PICKER_GAP;
  const rightCandidate = tileRect.right + LOCAL_PICKER_GAP;
  let left =
    leftCandidate >= 8
      ? leftCandidate
      : Math.min(rightCandidate, Math.max(8, window.innerWidth - LOCAL_PICKER_WIDTH - 8));
  left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - LOCAL_PICKER_WIDTH - 8));
  let top = Math.round(tileRect.top + tileRect.height / 2 - height / 2);
  top = Math.min(Math.max(8, top), Math.max(8, window.innerHeight - height - 8));
  localColorPickerMountEl.style.left = `${Math.round(left)}px`;
  localColorPickerMountEl.style.top = `${Math.round(top)}px`;
  positionLocalStopColorPicker();
}

function positionLocalStopColorPicker() {
  if (localStopColorPickerMountEl.hidden) return;
  const height = Math.max(
    160,
    Math.ceil(localStopColorPickerMountEl.getBoundingClientRect().height || 280)
  );
  const gradientLeft = parseFloat(localColorPickerMountEl.style.left);
  const gradientTop = parseFloat(localColorPickerMountEl.style.top);
  let left;
  let top;
  if (!localColorPickerMountEl.hidden && Number.isFinite(gradientLeft) && Number.isFinite(gradientTop)) {
    left = gradientLeft - LOCAL_PICKER_WIDTH - LOCAL_PICKER_GAP;
    if (left < 8) left = gradientLeft + LOCAL_PICKER_WIDTH + LOCAL_PICKER_GAP;
    top = gradientTop;
  } else {
    left = 8;
    top = 8;
  }
  left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - LOCAL_PICKER_WIDTH - 8));
  top = Math.min(Math.max(8, top), Math.max(8, window.innerHeight - height - 8));
  localStopColorPickerMountEl.style.left = `${Math.round(left)}px`;
  localStopColorPickerMountEl.style.top = `${Math.round(top)}px`;
}

function closeLocalStopColorPicker({ notifyGradient = true } = {}) {
  const wasOpen = !localStopColorPickerMountEl.hidden;
  ignoreLocalStopClose = true;
  closeColorPicker({ immediate: true });
  ignoreLocalStopClose = false;
  clearLocalStopColorPicker();
  if (wasOpen && notifyGradient) {
    localGradientPickerApi?.clearStopColorEdit?.();
  }
}

function openLocalStopColorPicker(stop) {
  if (!stop?.id) return;
  if (localStopEditId === stop.id && !localStopColorPickerMountEl.hidden) {
    closeLocalStopColorPicker({ notifyGradient: true });
    return;
  }

  ignoreLocalStopClose = true;
  closeColorPicker({ immediate: true });
  ignoreLocalStopClose = false;

  localStopEditId = stop.id;
  localStopPickerGen += 1;
  const gen = localStopPickerGen;
  localStopColorPickerMountEl.hidden = false;
  localStopColorPickerMountEl.replaceChildren();

  const bar = document.createElement("div");
  bar.className = "color-picker-card-bar";

  const title = document.createElement("h2");
  title.className = "color-picker-card-title";
  title.textContent = "Color picker";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "cp-close";
  closeBtn.title = "Close";
  closeBtn.setAttribute("aria-label", "Close color picker");
  closeBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">close</span>';
  bar.append(title, closeBtn);

  const mount = document.createElement("div");
  mount.className = "color-picker-frame-mount";
  localStopColorPickerMountEl.append(bar, mount);
  positionLocalStopColorPicker();

  const picker = openColorPicker({
    hex: stop.hex,
    mountEl: mount,
    // Gradient picker owns Escape while a stop editor is open.
    escapeToClose: false,
    onInput: (color) => {
      if (gen !== localStopPickerGen) return;
      localGradientPickerApi?.setStopHex?.(stop.id, color.hex, { commit: false });
    },
    onCommit: (color) => {
      if (gen !== localStopPickerGen) return;
      localGradientPickerApi?.setStopHex?.(stop.id, color.hex, { commit: true });
    },
    onClose: () => {
      if (ignoreLocalStopClose || gen !== localStopPickerGen) return;
      clearLocalStopColorPicker();
      localGradientPickerApi?.clearStopColorEdit?.();
    }
  });

  closeBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    picker?.close?.({ immediate: true });
  });

  requestAnimationFrame(() => positionLocalStopColorPicker());
}

function paintGradientTile(tile, gradient) {
  if (!tile || !gradient) return;
  const css = gradient.css || "";
  tile.style.backgroundColor = "transparent";
  tile.style.backgroundImage = css || "none";
  tile.dataset.gradientId = gradient.id || "";
  tile.setAttribute("aria-label", `Gradient: ${css}`);
  tile.title = "Click to copy CSS";
  const tip = tile.querySelector(".swatch-tooltip");
  if (tip) {
    delete tip.dataset.cssLabel;
    const labelEl = tip.querySelector(".swatch-tooltip-label");
    if (labelEl && !tip.classList.contains("is-pinned")) labelEl.textContent = "";
    const copyBtn = tip.querySelector(".swatch-tooltip-copy");
    if (copyBtn) copyBtn.hidden = true;
  }
  const editBtn = tile.querySelector(".swatch-edit-btn");
  if (editBtn) {
    editBtn.title = "Edit gradient";
    editBtn.setAttribute("aria-label", "Edit gradient");
  }
}

function updateGradientCss(gradientId, css, { commit = false, tile = null } = {}) {
  if (!gradientId || !css) return;
  const previousCss = currentGradients.find((gradient) => gradient.id === gradientId)?.css || null;
  currentGradients = currentGradients.map((gradient) =>
    gradient.id === gradientId
      ? {
          ...gradient,
          css,
          kind: gradientKind(css),
          stops: extractGradientStops(css)
        }
      : gradient
  );
  generation = { ...generation, gradients: currentGradients };
  const latest = currentGradients.find((gradient) => gradient.id === gradientId);
  const liveTiles = [...swatchesEl.querySelectorAll(".gradient-swatch")].filter(
    (el) => el.dataset.gradientId === gradientId
  );
  if (tile && !liveTiles.includes(tile)) liveTiles.push(tile);
  for (const liveTile of liveTiles) paintGradientTile(liveTile, latest);
  const nextCss = String(css || "").trim();
  const baselineCss = String(activePickerGradientBaselineCss || previousCss || "").trim();
  if (shouldPreviewColorOnPage() && baselineCss && nextCss && baselineCss !== nextCss) {
    schedulePageColorPreview({
      mode: "gradient",
      gradientId,
      fromCss: baselineCss,
      toCss: nextCss
    });
  }
  if (commit) persistGenerationCache();
}

function handlePickerClosed() {
  const editingTile = activePickerTile;
  const swatchId = activePickerSwatchId;
  const gradientId = activePickerGradientId;
  clearActivePickerUi();
  if (swatchId) {
    const latest = currentPalette.find((s) => s.id === swatchId);
    if (editingTile && latest) paintSwatchTile(editingTile, latest);
    return;
  }
  if (gradientId) {
    const latest = currentGradients.find((g) => g.id === gradientId);
    if (editingTile && latest) paintGradientTile(editingTile, latest);
  }
}

function dismissSwatchColorPicker({ immediate = true } = {}) {
  if (isEmbedded) {
    window.parent.postMessage({ type: "prism-color-picker-close" }, "*");
  }
  closeLocalStopColorPicker({ notifyGradient: false });
  closeColorPicker({ immediate });
  closeGradientPicker({ immediate });
  if (activePickerSwatchId || activePickerGradientId) handlePickerClosed();
}

function openLocalFloatingColorPicker(swatch, tile, startHex) {
  localColorPickerMountEl.hidden = false;
  localColorPickerMountEl.replaceChildren();

  const bar = document.createElement("div");
  bar.className = "color-picker-card-bar";

  const title = document.createElement("h2");
  title.className = "color-picker-card-title";
  title.textContent = "Color picker";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "cp-close";
  closeBtn.title = "Close";
  closeBtn.setAttribute("aria-label", "Close color picker");
  closeBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">close</span>';
  bar.append(title, closeBtn);

  const mount = document.createElement("div");
  mount.className = "color-picker-frame-mount";
  localColorPickerMountEl.append(bar, mount);
  positionLocalColorPicker(tile);

  const picker = openColorPicker({
    hex: startHex,
    mountEl: mount,
    onInput: (color) => {
      updateSwatchColor(swatch.id, color.hex, { tile });
    },
    onCommit: (color) => {
      updateSwatchColor(swatch.id, color.hex, { commit: true, tile });
    },
    onClose: () => {
      handlePickerClosed();
    }
  });

  closeBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    picker?.close?.({ immediate: true });
  });

  requestAnimationFrame(() => positionLocalColorPicker(tile));
}

function openHostColorPicker(payload) {
  const origin = payload.tile.getBoundingClientRect();
  window.parent.postMessage(
    {
      type: "prism-color-picker-open",
      ...payload.message,
      anchor: {
        left: origin.left,
        top: origin.top,
        width: origin.width,
        height: origin.height
      }
    },
    "*"
  );
}

function openLocalFloatingGradientPicker(gradient, tile) {
  clearLocalStopColorPicker();
  localColorPickerMountEl.hidden = false;
  localColorPickerMountEl.replaceChildren();

  const bar = document.createElement("div");
  bar.className = "color-picker-card-bar";

  const title = document.createElement("h2");
  title.className = "color-picker-card-title";
  title.textContent = "Gradient";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "cp-close";
  closeBtn.title = "Close";
  closeBtn.setAttribute("aria-label", "Close color picker");
  closeBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">close</span>';
  bar.append(title, closeBtn);

  const mount = document.createElement("div");
  mount.className = "color-picker-frame-mount";
  localColorPickerMountEl.append(bar, mount);
  positionLocalColorPicker(tile);

  const picker = openGradientPicker({
    css: gradient.css,
    stops: gradient.stops,
    mountEl: mount,
    onInput: (payload) => {
      updateGradientCss(gradient.id, payload.css, { tile });
    },
    onCommit: (payload) => {
      updateGradientCss(gradient.id, payload.css, { commit: true, tile });
    },
    onEditStopColor: (stop) => {
      openLocalStopColorPicker(stop);
    },
    onCloseStopColor: () => {
      closeLocalStopColorPicker({ notifyGradient: false });
    },
    onLayoutChange: () => {
      requestAnimationFrame(() => positionLocalColorPicker(tile));
    },
    onClose: () => {
      closeLocalStopColorPicker({ notifyGradient: false });
      handlePickerClosed();
    }
  });
  localGradientPickerApi = picker;

  closeBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    picker?.close?.({ immediate: true });
  });

  requestAnimationFrame(() => positionLocalColorPicker(tile));
}

function openSwatchColorPicker(swatch, tile) {
  if (activePickerMode === "solid" && activePickerSwatchId === swatch.id) {
    dismissSwatchColorPicker({ immediate: true });
    return;
  }

  closeCssPreview({ report: false });
  dismissSwatchColorPicker({ immediate: true });

  activePickerMode = "solid";
  activePickerSwatchId = swatch.id;
  activePickerGradientId = null;
  activePickerTile = tile;
  tile.classList.add("is-editing");

  const startHex = currentPalette.find((s) => s.id === swatch.id)?.hex || swatch.hex;
  const startSwatch = currentPalette.find((s) => s.id === swatch.id) || swatch;
  activePickerBaseline = snapshotSwatchForPicker(startSwatch);

  // Editing should always be able to paint the page; arm the toggle so the
  // preference matches what the user is about to see.
  if (!pagePreviewEnabled) {
    setPagePreviewEnabled(true, { persist: true });
  }

  if (isEmbedded) {
    openHostColorPicker({
      tile,
      message: { mode: "solid", hex: startHex, swatchId: swatch.id }
    });
  } else {
    openLocalFloatingColorPicker(swatch, tile, startHex);
  }
}

function openGradientColorPicker(gradient, tile) {
  if (activePickerMode === "gradient" && activePickerGradientId === gradient.id) {
    dismissSwatchColorPicker({ immediate: true });
    return;
  }

  closeCssPreview({ report: false });
  dismissSwatchColorPicker({ immediate: true });

  activePickerMode = "gradient";
  activePickerGradientId = gradient.id;
  activePickerSwatchId = null;
  activePickerTile = tile;
  activePickerBaseline = null;
  tile.classList.add("is-editing");

  const latest = currentGradients.find((item) => item.id === gradient.id) || gradient;
  activePickerGradientBaselineCss = latest.css || null;

  if (!pagePreviewEnabled) {
    setPagePreviewEnabled(true, { persist: true });
  }

  if (isEmbedded) {
    openHostColorPicker({
      tile,
      message: {
        mode: "gradient",
        gradientId: latest.id,
        css: latest.css,
        stops: latest.stops || []
      }
    });
  } else {
    openLocalFloatingGradientPicker(latest, tile);
  }
}

function onHostColorPickerMessage(event) {
  const { type, mode, hex, css, swatchId, gradientId } = event.data || {};
  if (type === "prism-color-picker-input") {
    if (mode === "gradient") {
      if (!gradientId || gradientId !== activePickerGradientId) return;
      updateGradientCss(gradientId, css, { tile: activePickerTile });
      return;
    }
    if (!swatchId || swatchId !== activePickerSwatchId) return;
    updateSwatchColor(swatchId, hex, { tile: activePickerTile });
    return;
  }
  if (type === "prism-color-picker-commit") {
    if (mode === "gradient") {
      if (!gradientId || gradientId !== activePickerGradientId) return;
      updateGradientCss(gradientId, css, { commit: true, tile: activePickerTile });
      return;
    }
    if (!swatchId || swatchId !== activePickerSwatchId) return;
    updateSwatchColor(swatchId, hex, { commit: true, tile: activePickerTile });
    return;
  }
  if (type === "prism-color-picker-closed") {
    if (swatchId && activePickerSwatchId && swatchId !== activePickerSwatchId) return;
    if (gradientId && activePickerGradientId && gradientId !== activePickerGradientId) return;
    handlePickerClosed();
  }
}

const TOOLTIP_EDGE_PAD = 6;

function resetSwatchTooltipShift(tip) {
  if (!tip) return;
  tip.style.setProperty("--swatch-tooltip-shift", "0px");
}

/**
 * Nudge centered tooltips so labels stay inside the swatches scrollport.
 * Uses tile center + tip width (not getBoundingClientRect of a transitioning
 * transform) so "Copied!" still clamps correctly after a hex hover shift.
 */
function clampSwatchTooltip(tile) {
  const tip = tile?.querySelector(".swatch-tooltip");
  if (!tip || !swatchesEl || tile.classList.contains("swatch-stack")) return false;
  const tipWidth = tip.offsetWidth;
  if (!tipWidth) return false;
  const port = swatchesEl.getBoundingClientRect();
  const tileRect = tile.getBoundingClientRect();
  const centerX = tileRect.left + tileRect.width / 2;
  const naturalLeft = centerX - tipWidth / 2;
  const naturalRight = centerX + tipWidth / 2;
  let shift = 0;
  if (naturalLeft < port.left + TOOLTIP_EDGE_PAD) {
    shift = port.left + TOOLTIP_EDGE_PAD - naturalLeft;
  } else if (naturalRight > port.right - TOOLTIP_EDGE_PAD) {
    shift = port.right - TOOLTIP_EDGE_PAD - naturalRight;
  }
  tip.style.setProperty("--swatch-tooltip-shift", `${shift}px`);
  return true;
}

/** Paint favicon + site title above the tabs (matches export naming). */
function updateSiteBrand() {
  if (!siteBrandEl || !siteBrandTitleEl) return;
  const title = formatExportTitle(exportPageMeta);
  siteBrandTitleEl.textContent = title;
  if (siteBrandLogoEl) {
    if (exportPageMeta.iconDataUrl) {
      siteBrandLogoEl.src = exportPageMeta.iconDataUrl;
      if (siteBrandLogoWrapEl) siteBrandLogoWrapEl.hidden = false;
    } else {
      siteBrandLogoEl.removeAttribute("src");
      if (siteBrandLogoWrapEl) siteBrandLogoWrapEl.hidden = true;
    }
  }
  siteBrandEl.hidden = !title;
}

function restoreTileTooltipLabel(tip) {
  if (!tip) return;
  const labelEl = tip.querySelector(".swatch-tooltip-label");
  const copyBtn = tip.querySelector(".swatch-tooltip-copy");
  const display = tooltipDisplayLabel(tip);
  if (labelEl) {
    labelEl.textContent = display;
    if (copyBtn) copyBtn.hidden = false;
    return;
  }
  tip.textContent = display;
}

function flashTileCopyFeedback(tile, success) {
  const tip = tile?.querySelector(".swatch-tooltip");
  if (!tip) return;
  const labelEl = tip.querySelector(".swatch-tooltip-label");
  const copyBtn = tip.querySelector(".swatch-tooltip-copy");
  const hadHoverLabel = Boolean(
    (labelEl?.textContent || tip.textContent || "").trim() || tip.dataset.hexLabel || tip.dataset.cssLabel
  );
  if (hadHoverLabel) clampSwatchTooltip(tile);
  const lockedShift = tip.style.getPropertyValue("--swatch-tooltip-shift") || "0px";
  const message = success ? "Copied!" : "Copy failed";
  if (labelEl) {
    labelEl.textContent = message;
    if (copyBtn) copyBtn.hidden = true;
  } else {
    tip.textContent = message;
  }
  tip.classList.add("is-pinned");
  if (hadHoverLabel) {
    tip.style.setProperty("--swatch-tooltip-shift", lockedShift);
  } else {
    requestAnimationFrame(() => clampSwatchTooltip(tile));
  }
  clearTimeout(tile._copyFeedbackTimer);
  tile._copyFeedbackTimer = window.setTimeout(() => {
    restoreTileTooltipLabel(tip);
    tip.classList.remove("is-pinned");
    requestAnimationFrame(() => clampSwatchTooltip(tile));
    tile._copyFeedbackTimer = null;
  }, 1200);
}

function truncateCssTooltipLabel(css, max = 36) {
  const value = String(css || "")
    .replace(/\s+/g, " ")
    .trim();
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(1, max - 1))}…`;
}

function tooltipDisplayLabel(tip) {
  if (!tip) return "";
  if (tip.dataset.hexLabel) return tip.dataset.hexLabel;
  if (tip.dataset.cssLabel) return truncateCssTooltipLabel(tip.dataset.cssLabel);
  return "";
}

function createSwatchTooltip({ labelText = "", hexLabel = "", cssLabel = "", copyValue = "", copyTitle = "Copy" } = {}) {
  const tooltip = document.createElement("div");
  tooltip.className = "swatch-tooltip";
  tooltip.setAttribute("role", "tooltip");
  if (hexLabel) tooltip.dataset.hexLabel = hexLabel;
  if (cssLabel) tooltip.dataset.cssLabel = cssLabel;

  const label = document.createElement("span");
  label.className = "swatch-tooltip-label";
  label.textContent = labelText;
  tooltip.appendChild(label);

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "swatch-tooltip-copy";
  copyBtn.title = copyTitle;
  copyBtn.setAttribute("aria-label", copyTitle);
  copyBtn.dataset.copyValue = copyValue;
  copyBtn.innerHTML =
    '<span class="material-symbols-outlined" aria-hidden="true">content_copy</span>';
  copyBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const tile = tooltip.closest(".swatch");
    const value = copyBtn.dataset.copyValue || copyValue || "";
    try {
      await navigator.clipboard.writeText(value);
      if (tile) flashTileCopyFeedback(tile, true);
    } catch {
      if (tile) flashTileCopyFeedback(tile, false);
    }
  });
  tooltip.appendChild(copyBtn);
  return tooltip;
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
  const hexLabel = String(swatch.hex || "").toUpperCase();
  tile.setAttribute("aria-label", swatchAriaLabel(swatch));
  tile.dataset.hex = swatch.hex;
  tile.title = "Click to copy hex";
  tile.style.backgroundColor = swatch.hex;

  const tooltip = createSwatchTooltip({
    labelText: hexLabel,
    hexLabel,
    copyValue: swatch.hex,
    copyTitle: "Copy hex"
  });

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
  tile.addEventListener("pointerenter", () => clampSwatchTooltip(tile));
  tile.addEventListener("focus", () => clampSwatchTooltip(tile));
  tile.addEventListener("click", (event) => {
    if (event.target.closest(".swatch-edit-btn, .swatch-tooltip-copy")) return;
    const latest = currentPalette.find((s) => s.id === swatch.id) || swatch;
    copySwatchHex(latest, tile);
  });
  return tile;
}

function createGradientTile(gradient, { variant = "grid" } = {}) {
  const tile = document.createElement("article");
  tile.className = "swatch gradient-swatch";
  if (variant === "bar") tile.classList.add("gradient-swatch-bar");
  const css = gradient.css || "";
  tile.setAttribute("aria-label", `Gradient: ${css}`);
  tile.title = "Click to copy CSS";
  tile.dataset.gradientId = gradient.id || "";
  tile.style.backgroundImage = css;
  tile.style.backgroundColor = "transparent";

  // Empty tip — used only for brief "Copied!" feedback after click.
  const tooltip = document.createElement("div");
  tooltip.className = "swatch-tooltip";
  tooltip.setAttribute("role", "tooltip");
  const tipLabel = document.createElement("span");
  tipLabel.className = "swatch-tooltip-label";
  tooltip.appendChild(tipLabel);

  const meta = document.createElement("div");
  meta.className = "swatch-meta";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "swatch-edit-btn";
  editBtn.dataset.gradientId = gradient.id || "";
  editBtn.title = "Edit gradient";
  editBtn.setAttribute("aria-label", "Edit gradient");
  editBtn.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">edit</span>';
  editBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const latest = currentGradients.find((item) => item.id === gradient.id) || gradient;
    openGradientColorPicker(latest, tile);
  });

  meta.appendChild(editBtn);
  tile.append(tooltip, meta);
  tile.addEventListener("click", (event) => {
    if (event.target.closest(".swatch-edit-btn")) return;
    const latest = currentGradients.find((item) => item.id === gradient.id) || gradient;
    copyGradientCss(latest, tile);
  });
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
  dismissSwatchColorPicker({ immediate: true });
  swatchesEl.innerHTML = "";
  applyColorViewToggleUi();

  if (colorViewMode === COLOR_VIEW_MODES.STACK) {
    renderStackSwatches(swatches);
    renderGradientSection();
  } else {
    renderOrganizedSwatches(swatches);
  }

  if (cssPreviewOpen) refreshCssExportPreview();
  requestAnimationFrame(() => syncPaletteScrollGutters());
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
  if (activeMode !== "colors" || !shuffleBtn || shuffleBtn.disabled) return;
  if (!lastRawExtraction) return;

  shuffleBtn.disabled = true;
  shuffleBtn.classList.add("is-shuffling");
  try {
    await clearPageColorPreview();
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

function makePreviewStorageKey(tabOrUrl) {
  const url = typeof tabOrUrl === "string" ? tabOrUrl : tabOrUrl?.url;
  if (!url || typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return `prism.previewOnPage.${parsed.origin}${parsed.pathname}`;
  } catch {
    return null;
  }
}

async function loadPagePreviewPref(tab) {
  const key = makePreviewStorageKey(tab);
  if (!key) return false;
  try {
    const data = await chrome.storage.local.get(key);
    return Boolean(data[key]?.enabled);
  } catch {
    return false;
  }
}

async function savePagePreviewPref(tab, enabled) {
  const key = makePreviewStorageKey(tab);
  if (!key) return;
  try {
    await chrome.storage.local.set({
      [key]: { enabled: Boolean(enabled), updatedAt: Date.now() }
    });
  } catch {
    /* storage may be unavailable */
  }
}

async function runColorPreviewScript(callback, args = []) {
  const tab = await getTargetTab();
  if (!tab?.id || isUnsupportedPageUrl(tab.url || "")) return null;

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["src/content/previewColor.js"]
  });

  const [injection] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: callback,
    args
  });

  return injection?.result ?? null;
}

async function clearPageColorPreview() {
  if (pagePreviewTimer) {
    clearTimeout(pagePreviewTimer);
    pagePreviewTimer = null;
  }
  pagePreviewPending = null;
  try {
    await runColorPreviewScript(() => window.__prismClearColorPreview?.());
  } catch {
    /* tab may be unavailable */
  }
}

async function applyPageColorPreview(payload) {
  if (!shouldPreviewColorOnPage() || !payload) return null;
  const isGradient = payload.mode === "gradient";
  if (isGradient && (!payload.fromCss || !payload.toCss)) return null;
  if (!isGradient && (!payload.fromHex || !payload.toHex)) return null;
  try {
    const result = await runColorPreviewScript(
      (next) => {
        if (typeof window.__prismPreviewColor !== "function") {
          return { ok: false, count: 0, error: "preview-unavailable" };
        }
        return window.__prismPreviewColor(next);
      },
      [payload]
    );
    return result;
  } catch (error) {
    return { ok: false, count: 0, error: error?.message || "preview-failed" };
  }
}

function schedulePageColorPreview(payload) {
  pagePreviewPending = payload;
  if (pagePreviewTimer) return;
  pagePreviewTimer = window.setTimeout(async () => {
    pagePreviewTimer = null;
    const next = pagePreviewPending;
    pagePreviewPending = null;
    if (!next || !shouldPreviewColorOnPage()) return;
    await applyPageColorPreview(next);
  }, 32);
}

async function setPagePreviewEnabled(enabled, { persist = true } = {}) {
  const next = Boolean(enabled);
  pagePreviewEnabled = next;
  applyPagePreviewToggleUi();
  if (!next) {
    await clearPageColorPreview();
  }
  if (persist) {
    try {
      const tab = await getTargetTab();
      await savePagePreviewPref(tab, next);
    } catch {
      /* ignore */
    }
  }
}

/** Fetch a same-origin (or CORS-ok) font file in the page, return ArrayBuffer for FontFace. */
async function fetchPageFontBytes(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

    const tab = await getTargetTab();
    if (!tab?.id || isUnsupportedPageUrl(tab.url || "")) return null;

    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: async (fontUrl, maxBytes) => {
        try {
          const response = await fetch(fontUrl, { credentials: "omit", cache: "force-cache" });
          if (!response.ok) return null;
          const declared = Number(response.headers.get("content-length"));
          if (Number.isFinite(declared) && declared > maxBytes) return null;
          const buffer = await response.arrayBuffer();
          if (buffer.byteLength > maxBytes) return null;
          const bytes = new Uint8Array(buffer);
          const chunk = 0x8000;
          let binary = "";
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          return btoa(binary);
        } catch {
          return null;
        }
      },
      args: [url, MAX_FONT_PREVIEW_BYTES]
    });

    const base64 = injection?.result;
    if (!base64 || typeof base64 !== "string") return null;
    // Reject oversized payloads before allocating the decoded buffer.
    const approxBytes = Math.floor((base64.length * 3) / 4);
    if (approxBytes > MAX_FONT_PREVIEW_BYTES) return null;
    const binary = atob(base64);
    if (binary.length > MAX_FONT_PREVIEW_BYTES) return null;
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out.buffer;
  } catch {
    return null;
  }
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
    const name = card.dataset.fontFamily || "font";
    const active = Boolean(family && card.dataset.fontFamily === family);
    card.classList.toggle("is-checked", active);
    card.setAttribute("aria-pressed", active ? "true" : "false");
    card.setAttribute(
      "aria-label",
      active ? `Clear highlight for ${name}` : `Highlight text using ${name}`
    );
    card.title = active ? "Clear highlight" : "Highlight on page";
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
    const active = activeHighlight === font.family;
    const card = document.createElement("article");
    card.className = "font-card";
    if (active) card.classList.add("is-checked");
    card.dataset.fontFamily = font.family;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-pressed", active ? "true" : "false");
    card.setAttribute(
      "aria-label",
      active ? `Clear highlight for ${font.family}` : `Highlight text using ${font.family}`
    );
    card.title = active ? "Clear highlight" : "Highlight on page";

    const toggleHighlight = () => {
      const select = highlightedFontFamily !== font.family;
      selectFontHighlight(font.family, select);
    };

    card.addEventListener("click", (event) => {
      if (event.target.closest(".font-copy-btn")) return;
      toggleHighlight();
    });
    card.addEventListener("keydown", (event) => {
      if (event.target.closest(".font-copy-btn")) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleHighlight();
    });

    const titleRow = document.createElement("div");
    titleRow.className = "font-title-row";

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "font-copy-btn";
    copyButton.setAttribute("aria-label", `Copy font family name ${font.family}`);
    copyButton.title = "Copy font family name";
    copyButton.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">content_copy</span>';
    copyButton.addEventListener("click", (event) => {
      event.stopPropagation();
      copyFontFamily(font.family, copyButton);
    });

    const sample = document.createElement("p");
    sample.className = "font-sample";
    sample.textContent = font.family;
    // Preview in the detected face, not the extension UI font (Google Sans).
    // Prefer Medium (500) when the page uses it; otherwise the lightest weight.
    const familyCss = String(font.family).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const sampleWeight = previewFontWeight(font.weights, font.weight);
    sample.style.fontFamily = `"${familyCss}", sans-serif`;
    sample.style.fontWeight = String(sampleWeight);
    // Load the page's exact @font-face bytes into the popup (FontFace +
    // ArrayBuffer). Falls back to Google Fonts when the page has no usable URL.
    ensureFontPreviewLoaded(font.family, sampleWeight, {
      pageFaces: lastRawExtraction?.fontFaces || [],
      fetchFontBytes: fetchPageFontBytes
    }).catch(() => {
      /* preview fallback is best-effort */
    });

    const weights = document.createElement("p");
    weights.className = "font-weights";
    weights.textContent = `Weights: ${font.weightsLabel || font.weight || 400}`;

    titleRow.append(sample, copyButton);
    card.append(titleRow, weights);

    const usageRoles = Array.isArray(font.usageRoles)
      ? font.usageRoles.filter((label) => typeof label === "string" && label.trim())
      : [];
    if (usageRoles.length) {
      const rolesEl = document.createElement("div");
      rolesEl.className = "font-usage-roles";
      rolesEl.setAttribute("aria-label", `Used for ${usageRoles.join(", ")}`);
      for (const label of usageRoles) {
        const chip = document.createElement("span");
        chip.className = "font-usage-role";
        chip.textContent = label;
        rolesEl.appendChild(chip);
      }
      card.appendChild(rolesEl);
    }

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

async function handleIconCopySvg(asset, card) {
  try {
    const tab = await getTargetTab();
    const markup = await resolveSvgMarkup(asset, tab?.id);
    if (!markup) {
      flashAssetCopyFeedback(card, false);
      return;
    }
    await navigator.clipboard.writeText(markup);
    flashAssetCopyFeedback(card, true);
  } catch {
    flashAssetCopyFeedback(card, false);
  }
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
    onCopySvg: handleIconCopySvg,
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

  dismissSwatchColorPicker({ immediate: true });

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
        maxMillis: 6000,
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
    func: () => window.__prismExtractAssets({ maxCandidates: 400, maxMillis: 4000 })
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
  syncAssetTabVisibility();
  reportHeightAfterLayout();
  return true;
}

/** After a full scan, open the first tab that actually has results. */
function revealBestAvailableMode() {
  syncGenerationMirrors();

  // Prefer Colors, then Fonts, then assets — never land on an empty tab.
  const order = ["colors", "fonts", "images", "icons"];
  const next = order.find((mode) => hasResultsForMode(mode));
  if (!next) {
    activeMode = "colors";
    updateModeChrome();
    setLoading(false);
    showError(null, { noPalette: true });
    syncAssetTabVisibility();
    return false;
  }

  activeMode = next;
  updateModeChrome();
  syncAssetTabVisibility();
  return showActiveModeResults();
}

function applyRawToGeneration(result, pageKey, requestId, { silent = false } = {}) {
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

  if (silent) return Boolean(palette?.length || fonts?.length);

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

function applyRawAssetsToGeneration(result, pageKey, requestId, { silent = false } = {}) {
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
  syncAssetTabVisibility();

  if (silent) return Boolean(images?.length || icons?.length);

  // Empty Images/Icons: hide the tab instead of an error empty-state.
  if (
    (activeMode === "images" && !images?.length) ||
    (activeMode === "icons" && !icons?.length)
  ) {
    leaveEmptyAssetMode();
    return false;
  }

  if (activeMode === "images" || activeMode === "icons") {
    return showActiveModeResults();
  }
  return false;
}

/**
 * First-open path: extract colors/fonts, then images/icons, under one loader.
 * Sequential on purpose — parallel injection on heavy pages was starving the
 * color scan and opening Images first with an empty Colors tab.
 */
async function runInitialFullScan(tab) {
  const pageKey = makePageKey(tab);
  const tabUrl = tab.url || "";
  if (!pageKey) return;

  generation = invalidatePage(generation, pageKey);
  syncGenerationMirrors();
  setLoading(true, null, { scope: "all" });
  generation = beginRequest(generation);
  const requestId = generation.requestId;

  const raceTimeout = (promise, ms, { soft = false } = {}) =>
    Promise.race([
      promise,
      new Promise((resolve, reject) => {
        setTimeout(() => {
          if (soft) resolve(null);
          else reject(new Error(ERROR_MESSAGES.TIMEOUT));
        }, ms);
      })
    ]);

  const scanPromise = (async () => {
    exportPageMeta = await readPageMetaFromTab(tab);
    updateSiteBrand();

    let pageResult = null;
    let pageError = null;
    let pageTimedOut = false;
    try {
      pageResult = await raceTimeout(
        runExtractionOnTab(tab).catch((error) => {
          error.injectionFailed = true;
          throw error;
        }),
        FULL_SCAN_PAGE_MS
      );
    } catch (error) {
      pageError = error;
      pageTimedOut = String(error?.message || "") === ERROR_MESSAGES.TIMEOUT;
    }

    if (isStaleRequest(generation, requestId)) return null;
    if (pageResult) {
      applyRawToGeneration(pageResult, pageKey, requestId, { silent: true });
    }

    const assetsResult = await raceTimeout(
      runAssetExtractionOnTab(tab).catch(() => null),
      FULL_SCAN_ASSETS_MS,
      { soft: true }
    );

    if (isStaleRequest(generation, requestId)) return null;
    if (assetsResult) {
      applyRawAssetsToGeneration(assetsResult, pageKey, requestId, {
        silent: true
      });
    }

    syncGenerationMirrors();
    const hasAnything =
      currentPalette.length > 0 ||
      currentFonts.length > 0 ||
      currentImages.length > 0 ||
      currentIcons.length > 0;

    if (!hasAnything) {
      showError(pageError || null, {
        timedOut: pageTimedOut,
        noPalette: !pageError,
        injectionFailed: Boolean(pageError?.injectionFailed),
        unsupportedPage: isUnsupportedPageUrl(tabUrl)
      });
      return null;
    }

    return true;
  })().finally(() => {
    if (!isStaleRequest(generation, requestId)) {
      generation = clearInFlight(generation);
    }
  });

  generation = setInFlight(generation, scanPromise);

  try {
    const ok = await scanPromise;
    if (!ok || isStaleRequest(generation, requestId)) return;
    revealBestAvailableMode();
  } catch {
    /* showError already called from the scan body */
  }
}
async function scanPage(tab, requestId) {
  const config = modeConfig();
  const tabUrl = tab.url || "";
  exportPageMeta = await readPageMetaFromTab(tab);
  updateSiteBrand();

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
    await clearPageColorPreview();
    pagePreviewEnabled = await loadPagePreviewPref(tab);
    applyPagePreviewToggleUi();
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
  if (!button) return;
  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || mode === activeMode || button.hidden) return;
    switchMode(mode);
  });

  button.addEventListener("click", () => {
    if (mode === activeMode || button.hidden) return;
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
if (shuffleBtn) shuffleBtn.addEventListener("click", shufflePalette);

if (colorContentMenuBtn) {
  colorContentMenuBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (activeMode !== "colors") return;
    const open = colorContentMenuBtn.getAttribute("aria-expanded") !== "true";
    setColorContentMenuOpen(open);
  });
}

if (colorContentMenuList) {
  colorContentMenuList.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-content]");
    if (!btn || !colorContentMenuList.contains(btn)) return;
    event.stopPropagation();
    if (activeMode !== "colors") return;
    setColorContentView(btn.dataset.content);
  });
}

document.addEventListener("click", (event) => {
  if (!colorContentMenuEl || colorContentMenuEl.contains(event.target)) return;
  closeColorContentMenu();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeColorContentMenu();
});

if (colorViewToggleEl) {
  colorViewToggleEl.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-view]");
    if (!btn || !colorViewToggleEl.contains(btn)) return;
    if (cssPreviewOpen) return;
    setColorViewMode(btn.dataset.view);
  });
}

if (pagePreviewToggleEl) {
  pagePreviewToggleEl.addEventListener("change", () => {
    setPagePreviewEnabled(pagePreviewToggleEl.checked, { persist: true });
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
    if (cssPreviewOpen) {
      await copyPaletteCss(currentPalette, currentCssExportOptions());
    } else {
      await copyPaletteSvg(currentPalette, exportPageMeta, {
        viewMode: colorViewMode,
        gradients: currentCssExportOptions().gradients
      });
    }
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
  const restricted = isRestrictedPopupContext();
  // Paint the full-scan loader immediately so the panel never sits blank.
  if (!restricted) setLoading(true, null, { scope: "all" });

  colorViewMode = await loadColorViewMode();
  applyColorViewToggleUi();
  updateModeChrome();

  if (restricted) {
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

  pagePreviewEnabled = await loadPagePreviewPref(tab);
  applyPagePreviewToggleUi();

  const pageKey = makePageKey(tab);
  const cached = await loadGenerationCache(pageKey);
  if (cached?.pageKey === pageKey) {
    generation = restoreGenerationCache(cached);
    // Drop any stale edited/shuffled colors from older cache entries and
    // rebuild from the page scan so reopen always shows the live webpage palette.
    if (generation.rawExtraction && !generation.dismissed?.colors) {
      generation = {
        ...generation,
        palette: curateColorsFromRaw(generation.rawExtraction) || [],
        gradients: curateGradientsFromRaw(generation.rawExtraction) || []
      };
    }
    syncGenerationMirrors();
    // Warm cache with both pipelines already filled — skip the full rescan.
    if (generation.rawExtraction && generation.rawAssets) {
      const hasAnything =
        hasResultsForMode("colors") ||
        hasResultsForMode("fonts") ||
        hasResultsForMode("images") ||
        hasResultsForMode("icons");
      if (hasAnything) {
        exportPageMeta = await readPageMetaFromTab(tab);
        updateSiteBrand();
        // Rewrite cache so subsequent opens also get the pristine palette.
        persistGenerationCache();
        revealBestAvailableMode();
        return;
      }
    }
  }

  await runInitialFullScan(tab);
}

bootstrapPopup();
