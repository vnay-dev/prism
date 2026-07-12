import { curatePalette } from "../core/scoreAndCluster.js";
import { assignRoles } from "../core/assignRoles.js";
import { curateFonts } from "../core/curateFonts.js";
import { shadeColor, hexToRgb, rgbToHsl, rgbToHex, isPureBlackOrWhite } from "../core/colorLab.js";
import { openColorPicker, closeColorPicker } from "./colorPicker.js";
import { copyPaletteImage, readPageMetaFromTab } from "./exportPaletteImage.js";
import { buildBentoRows, isLightSwatch, isDarkSwatch } from "./paletteLayout.js";
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
const shuffleBtn = document.getElementById("shuffleBtn");
const closeBtn = document.getElementById("closeBtn");
const statusEl = document.getElementById("status");
const swatchesEl = document.getElementById("swatches");
const fontsEl = document.getElementById("fonts");
const tabBarEl = document.getElementById("tabBar");
const tabColorsBtn = document.getElementById("tabColors");
const tabFontsBtn = document.getElementById("tabFonts");
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
  }
};

let activeMode = "colors";
let currentPalette = [];
let currentFonts = [];
let highlightedFontFamily = null;
let exportPageMeta = { title: "", siteName: "", hostname: "", url: "", iconDataUrl: "" };
let copyFeedbackTimer = null;

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

function measureAppHeight(app) {
  if (!app) return document.body.offsetHeight;
  const appRect = app.getBoundingClientRect();
  let bottom = appRect.bottom;

  // Morph overlay can sit absolutely over the palette; include it when present.
  for (const selector of [".color-picker-stage:not([hidden])", ".color-picker"]) {
    const el = app.querySelector(selector);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.height > 0) bottom = Math.max(bottom, rect.bottom);
  }

  return Math.ceil(bottom - appRect.top);
}

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
}

function reportHeight() {
  if (isEmbedded) {
    const app = document.querySelector(".app");
    window.parent.postMessage({ type: "prism-resize", height: measureAppHeight(app) }, "*");
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

  if (!copyFeedbackTimer && activeMode === "colors") {
    setCopyButtonState(MODE_COPY.colors.copyLabel, COPY_ICON_DEFAULT);
  }

  updateFooterForMode();
}

function updateFooterForMode() {
  const inResults = appEl.classList.contains("state-results");
  const toolbar = colorResultsEl?.querySelector(".results-toolbar");

  if (activeMode === "colors") {
    // Colors: Reset lives in the results toolbar; Shuffle sits in the footer.
    if (toolbar && resetBtn.parentElement !== toolbar) {
      toolbar.appendChild(resetBtn);
    }
    resetBtn.className = "btn-toolbar";
    resetBtn.title = "Reset color palette";
    resetBtn.setAttribute("aria-label", "Reset color palette");
    shuffleBtn.hidden = false;
    copyBtn.hidden = false;
    if (!copyFeedbackTimer) {
      setCopyButtonState(MODE_COPY.colors.copyLabel, COPY_ICON_DEFAULT);
    }
    return;
  }

  // Fonts: Reset returns to the footer; Shuffle is colors-only.
  if (resultsFooterEl && resetBtn.parentElement !== resultsFooterEl) {
    resultsFooterEl.insertBefore(resetBtn, copyBtn);
  }
  shuffleBtn.hidden = true;
  copyBtn.hidden = true;
  resetBtn.className = "btn";
  resetBtn.title = "Reset";
  resetBtn.setAttribute("aria-label", "Reset");
  if (inResults) {
    resetBtn.classList.add("btn-primary");
  } else {
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
  closeColorPicker({ immediate: true });
  exitPickingMode();
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
  copyFeedbackTimer = null;
  setCopyButtonState(MODE_COPY.colors.copyLabel, COPY_ICON_DEFAULT);

  if (activeMode === "fonts") {
    clearFontHighlightOnPage();
  }

  if (activeMode === "colors") {
    currentPalette = [];
    swatchesEl.innerHTML = "";
    statusEl.textContent = "";
    lastRawExtraction = null;
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
        id: lock.id || `slot-${i}`
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
      id: lock.id || merged[i].id
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
      hsl: replacement.hsl || rgbToHsl(replacement.rgb)
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
  currentPalette = currentPalette.map((s) =>
    s.id === swatchId
      ? { ...s, hex: parsed.hex, rgb: parsed.rgb, hsl: parsed.hsl, locked: true }
      : s
  );
  return parsed;
}

function paintSwatchTile(tile, swatch) {
  if (!tile || !swatch) return;
  tile.style.backgroundColor = swatch.hex;
  tile.classList.toggle("swatch-light", isLightSwatch(swatch.hex));
  tile.classList.toggle("swatch-dark", isDarkSwatch(swatch.hex));
  tile.setAttribute("aria-label", swatch.hex);
  tile.dataset.hex = swatch.hex;
  const tip = tile.querySelector(".swatch-tooltip");
  if (tip) tip.textContent = swatch.hex.toUpperCase();
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
  if (commit) {
    const liveTile =
      tile ||
      [...swatchesEl.querySelectorAll(".swatch")].find((el) => {
        const btn = el.querySelector(".swatch-edit-btn");
        return btn?.dataset.swatchId === swatchId;
      });
    if (liveTile) paintSwatchTile(liveTile, swatch);
    if (!appEl.classList.contains("is-picking-color")) reportHeight();
    return;
  }

  if (tile) paintSwatchTile(tile, swatch);
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
    locked: Boolean(swatch.locked)
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
          locked: baseline.locked
        }
      : s
  );
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

function renderSwatches(swatches) {
  closeColorPicker({ immediate: true });
  activePickerSwatchId = null;
  activePickerTile = null;
  activePickerBaseline = null;
  exitPickingMode();
  swatchesEl.innerHTML = "";

  for (const { tiles, height } of buildBentoRows(swatches)) {
    const row = document.createElement("div");
    row.className = "bento-row";
    row.style.height = `${height}px`;

    for (const swatch of tiles) {
      const tile = document.createElement("article");
      tile.className = `swatch role-${swatch.role}`;
      if (isLightSwatch(swatch.hex)) tile.classList.add("swatch-light");
      if (isDarkSwatch(swatch.hex)) tile.classList.add("swatch-dark");
      tile.setAttribute("aria-label", swatch.hex);
      tile.dataset.hex = swatch.hex;
      tile.style.backgroundColor = swatch.hex;

      const tooltip = document.createElement("div");
      tooltip.className = "swatch-tooltip";
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
      row.appendChild(tile);
    }

    swatchesEl.appendChild(row);
  }
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
        hsl: candidate.hsl || rgbToHsl(candidate.rgb)
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

  closeColorPicker({ immediate: true });
  exitPickingMode();

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

  currentPalette = withSlotMeta(assigned.swatches.slice(0, 8));
  lastRawExtraction = result;
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
shuffleBtn.addEventListener("click", shufflePalette);

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
