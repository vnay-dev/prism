/**
 * Pure helpers for automatic first-open generation, per-mode Reset, page
 * caching, and in-flight request deduplication. UI wires these into App.js.
 */

export const GENERATION_MODES = Object.freeze(["colors", "fonts"]);

export function makePageKey(tab) {
  if (!tab?.id) return null;
  const url = typeof tab.url === "string" ? tab.url : "";
  return `${tab.id}::${url}`;
}

export function createGenerationState(seed = {}) {
  return {
    pageKey: seed.pageKey ?? null,
    rawExtraction: seed.rawExtraction ?? null,
    palette: Array.isArray(seed.palette) ? seed.palette : [],
    fonts: Array.isArray(seed.fonts) ? seed.fonts : [],
    dismissed: {
      colors: Boolean(seed.dismissed?.colors),
      fonts: Boolean(seed.dismissed?.fonts)
    },
    inFlight: null,
    requestId: Number(seed.requestId) || 0
  };
}

export function hasResultsForMode(state, mode) {
  if (mode === "fonts") return (state.fonts?.length || 0) > 0;
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

export function applyExtractionSuccess(state, { pageKey, rawExtraction, palette, fonts, requestId }) {
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
  if (Array.isArray(fonts) && !state.dismissed.fonts) {
    next.fonts = fonts;
  }
  return next;
}

export function applyModeFromCache(state, { mode, palette, fonts }) {
  const next = { ...state, dismissed: { ...state.dismissed } };
  if (mode === "colors" && Array.isArray(palette)) {
    next.palette = palette;
    next.dismissed.colors = false;
  }
  if (mode === "fonts" && Array.isArray(fonts)) {
    next.fonts = fonts;
    next.dismissed.fonts = false;
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
  } else if (mode === "fonts") {
    next.fonts = [];
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
    palette: state.palette,
    fonts: state.fonts,
    dismissed: { ...state.dismissed }
  };
}

export function restoreGenerationCache(cached) {
  if (!cached || typeof cached !== "object") return createGenerationState();
  return createGenerationState({
    pageKey: cached.pageKey ?? null,
    rawExtraction: cached.rawExtraction ?? null,
    palette: cached.palette,
    fonts: cached.fonts,
    dismissed: cached.dismissed
  });
}
