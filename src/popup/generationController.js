/**
 * Pure helpers for automatic first-open generation, per-mode Reset, page
 * caching, and in-flight request deduplication. UI wires these into App.js.
 */

export const GENERATION_MODES = Object.freeze(["colors", "fonts", "images", "icons"]);

export function makePageKey(tab) {
  if (!tab?.id) return null;
  const url = typeof tab.url === "string" ? tab.url : "";
  return `${tab.id}::${url}`;
}

export function createGenerationState(seed = {}) {
  return {
    pageKey: seed.pageKey ?? null,
    rawExtraction: seed.rawExtraction ?? null,
    rawAssets: seed.rawAssets ?? null,
    palette: Array.isArray(seed.palette) ? seed.palette : [],
    gradients: Array.isArray(seed.gradients) ? seed.gradients : [],
    fonts: Array.isArray(seed.fonts) ? seed.fonts : [],
    images: Array.isArray(seed.images) ? seed.images : [],
    icons: Array.isArray(seed.icons) ? seed.icons : [],
    dismissed: {
      colors: Boolean(seed.dismissed?.colors),
      fonts: Boolean(seed.dismissed?.fonts),
      images: Boolean(seed.dismissed?.images),
      icons: Boolean(seed.dismissed?.icons)
    },
    inFlight: null,
    requestId: Number(seed.requestId) || 0
  };
}

export function hasResultsForMode(state, mode) {
  if (mode === "fonts") return (state.fonts?.length || 0) > 0;
  if (mode === "images") return (state.images?.length || 0) > 0;
  if (mode === "icons") return (state.icons?.length || 0) > 0;
  return (state.palette?.length || 0) > 0;
}

export function isModeDismissed(state, mode) {
  return Boolean(state.dismissed?.[mode]);
}

/**
 * Whether the active mode should kick off (or await) generation.
 * Never auto-runs after Reset until the user explicitly generates.
 */
export function shouldAutoGenerate(state, { mode, pageKey, unsupported = false, restricted = false } = {}) {
  if (restricted || unsupported) return false;
  if (!pageKey) return false;
  if (isModeDismissed(state, mode)) return false;
  if (hasResultsForMode(state, mode) && state.pageKey === pageKey) return false;
  return true;
}

/** Cached curated results for this page/mode — show without re-extracting. */
export function canReuseModeResults(state, { mode, pageKey } = {}) {
  if (!pageKey || state.pageKey !== pageKey) return false;
  if (isModeDismissed(state, mode)) return false;
  return hasResultsForMode(state, mode);
}

/** Raw page scan still valid — derive the other tab without a new injection. */
export function canReuseRawExtraction(state, { pageKey } = {}) {
  if (!pageKey || state.pageKey !== pageKey) return false;
  return Boolean(state.rawExtraction);
}

/** Asset scan still valid for Images / Icons tabs. */
export function canReuseRawAssets(state, { pageKey } = {}) {
  if (!pageKey || state.pageKey !== pageKey) return false;
  return Boolean(state.rawAssets);
}

export function beginRequest(state) {
  const requestId = (state.requestId || 0) + 1;
  return { ...state, requestId };
}

export function isStaleRequest(state, requestId) {
  return requestId !== state.requestId;
}

/**
 * Attach a shared in-flight promise so tab/view switches await the same scan
 * instead of starting duplicates.
 */
export function setInFlight(state, promise) {
  return { ...state, inFlight: promise || null };
}

export function clearInFlight(state) {
  return { ...state, inFlight: null };
}

export function applyExtractionSuccess(
  state,
  { pageKey, rawExtraction, palette, gradients, fonts, requestId }
) {
  if (isStaleRequest(state, requestId)) return state;

  const next = {
    ...state,
    pageKey,
    rawExtraction: rawExtraction ?? state.rawExtraction,
    inFlight: null,
    requestId: state.requestId
  };

  if (Array.isArray(palette) && !state.dismissed.colors) {
    next.palette = palette;
  }
  if (Array.isArray(gradients) && !state.dismissed.colors) {
    next.gradients = gradients;
  }
  if (Array.isArray(fonts) && !state.dismissed.fonts) {
    next.fonts = fonts;
  }
  return next;
}

export function applyAssetsSuccess(state, { pageKey, rawAssets, images, icons, requestId }) {
  if (isStaleRequest(state, requestId)) return state;

  const next = {
    ...state,
    pageKey,
    rawAssets: rawAssets ?? state.rawAssets,
    inFlight: null,
    requestId: state.requestId
  };

  if (Array.isArray(images) && !state.dismissed.images) {
    next.images = images;
  }
  if (Array.isArray(icons) && !state.dismissed.icons) {
    next.icons = icons;
  }
  return next;
}

export function applyModeFromCache(state, { mode, palette, gradients, fonts, images, icons }) {
  const next = { ...state, dismissed: { ...state.dismissed } };
  if (mode === "colors" && Array.isArray(palette)) {
    next.palette = palette;
    if (Array.isArray(gradients)) next.gradients = gradients;
    next.dismissed.colors = false;
  }
  if (mode === "fonts" && Array.isArray(fonts)) {
    next.fonts = fonts;
    next.dismissed.fonts = false;
  }
  if (mode === "images" && Array.isArray(images)) {
    next.images = images;
    next.dismissed.images = false;
  }
  if (mode === "icons" && Array.isArray(icons)) {
    next.icons = icons;
    next.dismissed.icons = false;
  }
  return next;
}

/** Reset one mode: clear its results, mark dismissed so auto-gen stays off. */
export function resetMode(state, mode) {
  const next = {
    ...state,
    dismissed: { ...state.dismissed, [mode]: true }
  };
  if (mode === "colors") {
    next.palette = [];
    next.gradients = [];
  } else if (mode === "fonts") {
    next.fonts = [];
  } else if (mode === "images") {
    next.images = [];
  } else if (mode === "icons") {
    next.icons = [];
  }
  return next;
}

/** Explicit Generate: clear dismissed for that mode so results may apply. */
export function markModeForManualGenerate(state, mode) {
  return {
    ...state,
    dismissed: { ...state.dismissed, [mode]: false }
  };
}

export function invalidatePage(state, pageKey) {
  if (state.pageKey && pageKey && state.pageKey === pageKey) return state;
  return createGenerationState({ requestId: (state.requestId || 0) + 1 });
}

/** Snapshot for chrome.storage.session — omit the live Promise. */
export function serializeGenerationCache(state) {
  return {
    pageKey: state.pageKey,
    rawExtraction: state.rawExtraction,
    rawAssets: state.rawAssets,
    palette: state.palette,
    gradients: state.gradients,
    fonts: state.fonts,
    images: state.images,
    icons: state.icons,
    dismissed: { ...state.dismissed }
  };
}

export function restoreGenerationCache(cached) {
  if (!cached || typeof cached !== "object") return createGenerationState();
  return createGenerationState({
    pageKey: cached.pageKey ?? null,
    rawExtraction: cached.rawExtraction ?? null,
    rawAssets: cached.rawAssets ?? null,
    palette: cached.palette,
    gradients: cached.gradients,
    fonts: cached.fonts,
    images: cached.images,
    icons: cached.icons,
    dismissed: cached.dismissed
  });
}

export function isAssetMode(mode) {
  return mode === "images" || mode === "icons";
}
