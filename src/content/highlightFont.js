/**
 * Highlight visible text on the page that uses a given font family.
 * Uses the CSS Highlight API so only glyphs are marked, not containers.
 * Viewport matches appear first; more are revealed as the user scrolls.
 */
(function initPrismFontHighlight() {
  const STYLE_ID = "prism-font-highlight-style";
  const HIGHLIGHT_NAME = "prism-font-match";
  const WRAP_ATTR = "data-prism-font-highlight";
  const MAX_HIGHLIGHTS = 8000;
  const STATE_KEY = "__prismFontHighlightState";

  const GENERIC_FAMILIES = new Set([
    "serif",
    "sans-serif",
    "monospace",
    "cursive",
    "fantasy",
    "system-ui",
    "ui-serif",
    "ui-sans-serif",
    "ui-monospace",
    "ui-rounded",
    "inherit",
    "initial",
    "unset"
  ]);

  function parseFontStack(fontFamily) {
    if (!fontFamily || typeof fontFamily !== "string") return [];
    return fontFamily
      .split(",")
      .map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }

  function isMetricPlaceholderFont(family) {
    const key = (family || "").trim().toLowerCase();
    return key.endsWith(" placeholder") || key.endsWith(" fallback");
  }

  function resolvePrimaryFont(families) {
    if (!families.length) return "";
    for (const family of families) {
      if (GENERIC_FAMILIES.has(family.toLowerCase())) continue;
      if (isMetricPlaceholderFont(family)) continue;
      return family;
    }
    for (const family of families) {
      if (!GENERIC_FAMILIES.has(family.toLowerCase())) return family;
    }
    return families[0];
  }

  // Detect whether a declared family is actually installed/loaded. Mirrors the
  // canvas detection used during extraction so the font we highlight matches
  // the font we reported, even when the page lists an unavailable brand font
  // ahead of the one the browser really renders.
  const fontAvailabilityCache = new Map();
  const FONT_DETECT_BASELINES = ["monospace", "sans-serif", "serif"];
  const FONT_DETECT_STRING = "mmmmmmmmmmlliWWWaaaggg0123456789";
  const FONT_DETECT_PX = "72px";
  let fontDetectCtx = null;
  let fontBaselineWidths = null;

  function ensureFontDetect() {
    if (fontDetectCtx) return true;
    try {
      const canvas = document.createElement("canvas");
      fontDetectCtx = canvas.getContext("2d");
      if (!fontDetectCtx) return false;
      fontBaselineWidths = {};
      for (const base of FONT_DETECT_BASELINES) {
        fontDetectCtx.font = `${FONT_DETECT_PX} ${base}`;
        fontBaselineWidths[base] = fontDetectCtx.measureText(FONT_DETECT_STRING).width;
      }
      return true;
    } catch (_err) {
      fontDetectCtx = null;
      return false;
    }
  }

  function isFontAvailable(family) {
    if (!family) return false;
    const key = family.toLowerCase();
    if (GENERIC_FAMILIES.has(key)) return true;
    if (fontAvailabilityCache.has(key)) return fontAvailabilityCache.get(key);
    if (!ensureFontDetect()) {
      fontAvailabilityCache.set(key, true);
      return true;
    }
    let available = false;
    const escaped = family.replace(/(['"\\])/g, "\\$1");
    for (const base of FONT_DETECT_BASELINES) {
      fontDetectCtx.font = `${FONT_DETECT_PX} "${escaped}", ${base}`;
      if (fontDetectCtx.measureText(FONT_DETECT_STRING).width !== fontBaselineWidths[base]) {
        available = true;
        break;
      }
    }
    // Only cache positives: a font still loading now may be available later.
    if (available) fontAvailabilityCache.set(key, true);
    return available;
  }

  function resolveRenderedFont(families) {
    if (!families.length) return "";
    for (const family of families) {
      if (GENERIC_FAMILIES.has(family.toLowerCase())) continue;
      if (isMetricPlaceholderFont(family)) continue;
      if (isFontAvailable(family)) return family;
    }
    return resolvePrimaryFont(families);
  }

  function normalizeFontKey(family) {
    return (family || "").trim().toLowerCase();
  }

  // Keep in sync with fontStackMatchesTarget in src/core/fontUtils.js.
  function fontMatchesTarget(computedFamily, targetKey) {
    const stack = parseFontStack(computedFamily);
    if (!stack.length) return false;

    // First available design face wins. Metric placeholders never count.
    // An unavailable selected face matches only when no later design face
    // is available (extraction's primary-fallback case).
    for (let i = 0; i < stack.length; i += 1) {
      const family = stack[i];
      if (GENERIC_FAMILIES.has(family.toLowerCase())) continue;
      if (isMetricPlaceholderFont(family)) continue;
      const key = normalizeFontKey(family);
      if (isFontAvailable(family)) return key === targetKey;
      if (key === targetKey) {
        let laterAvailable = false;
        for (let j = i + 1; j < stack.length; j += 1) {
          const later = stack[j];
          if (GENERIC_FAMILIES.has(later.toLowerCase())) continue;
          if (isMetricPlaceholderFont(later)) continue;
          if (isFontAvailable(later)) {
            laterAvailable = true;
            break;
          }
        }
        if (!laterAvailable) return true;
      }
    }

    return normalizeFontKey(resolveRenderedFont(stack)) === targetKey;
  }

  function supportsHighlightApi() {
    return typeof CSS !== "undefined" && typeof CSS.highlights !== "undefined";
  }

  function ensureHighlightStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = supportsHighlightApi()
      ? `
      ::highlight(${HIGHLIGHT_NAME}) {
        background-color: rgba(186, 64, 147, 0.24);
        color: inherit;
      }
    `
      : `
      [${WRAP_ATTR}] {
        background-color: rgba(186, 64, 147, 0.24);
        box-decoration-break: clone;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function isPrismElement(el) {
    return Boolean(el?.closest("#prism-panel-host"));
  }

  const NON_TEXT_PARENT_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEMPLATE",
    "SVG",
    "TITLE"
  ]);

  // Screen-reader-only / clipped text still yields getClientRects(), so without
  // this check we'd "highlight" invisible copy (e.g. NYT sr-only headlines that
  // inherit body "Times New Roman") and the user would see nothing on the page.
  function isVisuallyHidden(el, styles, rect) {
    if (!el) return true;
    const s = styles || getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return true;
    if (Number(s.opacity) < 0.05) return true;

    const clip = s.clip || "";
    if (/rect\(\s*0(?:px)?\s*,\s*0(?:px)?\s*,\s*0(?:px)?\s*,\s*0(?:px)?\s*\)/i.test(clip)) {
      return true;
    }

    const clipPath = s.clipPath || s.webkitClipPath || "";
    if (clipPath && clipPath !== "none") {
      if (/inset\(\s*50%\s*\)/i.test(clipPath)) return true;
      if (/inset\(\s*100%\s*\)/i.test(clipPath)) return true;
      if (/circle\(\s*0/i.test(clipPath)) return true;
    }

    const box = rect || el.getBoundingClientRect();
    if (
      (s.position === "absolute" || s.position === "fixed") &&
      s.overflow === "hidden" &&
      box.width <= 1 &&
      box.height <= 1
    ) {
      return true;
    }

    return false;
  }

  function isInsideVisuallyHidden(el) {
    let cur = el;
    for (let i = 0; i < 8 && cur && cur !== document.body; i += 1) {
      if (isVisuallyHidden(cur)) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  function isTextNodeRenderable(textNode) {
    const parent = textNode.parentElement;
    if (!parent || isPrismElement(parent)) return false;
    if (NON_TEXT_PARENT_TAGS.has(parent.tagName)) return false;
    if (!textNode.textContent || !textNode.textContent.trim()) return false;
    if (isInsideVisuallyHidden(parent)) return false;
    return true;
  }

  function isTextNodeInViewport(textNode) {
    const range = document.createRange();
    range.selectNodeContents(textNode);

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    for (const rect of range.getClientRects()) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.bottom < 0 || rect.top > viewportHeight) continue;
      if (rect.right < 0 || rect.left > viewportWidth) continue;
      return true;
    }
    return false;
  }

  function collectMatchingTextNodes(targetKey) {
    const nodes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(textNode) {
        if (!isTextNodeRenderable(textNode)) return NodeFilter.FILTER_REJECT;
        const parent = textNode.parentElement;
        if (!fontMatchesTarget(getComputedStyle(parent).fontFamily, targetKey)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode() && nodes.length < MAX_HIGHLIGHTS) {
      nodes.push(walker.currentNode);
    }

    return nodes;
  }

  function removeScrollListeners(state) {
    if (!state?.onScroll) return;
    window.removeEventListener("scroll", state.onScroll, true);
    window.removeEventListener("resize", state.onScroll);
  }

  function teardownSession() {
    const state = window[STATE_KEY];
    if (!state) return;

    removeScrollListeners(state);

    if (state.mode === "highlight-api" && supportsHighlightApi()) {
      CSS.highlights.delete(HIGHLIGHT_NAME);
    }

    if (state.mode === "wrap") {
      for (const wrapper of document.querySelectorAll(`[${WRAP_ATTR}]`)) {
        const parent = wrapper.parentNode;
        if (!parent) continue;
        while (wrapper.firstChild) {
          parent.insertBefore(wrapper.firstChild, wrapper);
        }
        wrapper.remove();
      }
    }

    window[STATE_KEY] = null;
  }

  function addWrapHighlight(textNode, state) {
    if (state.highlighted.has(textNode)) return false;

    const parent = textNode.parentElement;
    if (!parent || parent.hasAttribute(WRAP_ATTR)) return false;

    const wrapper = document.createElement("span");
    wrapper.setAttribute(WRAP_ATTR, "");
    parent.insertBefore(wrapper, textNode);
    wrapper.appendChild(textNode);
    state.highlighted.add(textNode);
    state.highlightedCount += 1;
    return true;
  }

  function addRangeHighlight(textNode, state) {
    if (state.highlighted.has(textNode)) return false;

    const range = document.createRange();
    range.selectNodeContents(textNode);
    if (!range.getClientRects().length) return false;

    state.highlight.add(range);
    state.highlighted.add(textNode);
    state.highlightedCount += 1;
    return true;
  }

  function revealViewportMatches(state) {
    if (!state || state.done) return;

    for (const textNode of state.candidates) {
      if (state.highlightedCount >= MAX_HIGHLIGHTS) {
        state.done = true;
        break;
      }
      if (state.highlighted.has(textNode)) continue;
      if (!isTextNodeInViewport(textNode)) continue;

      const added =
        state.mode === "highlight-api"
          ? addRangeHighlight(textNode, state)
          : addWrapHighlight(textNode, state);

      if (!added) continue;
    }

    if (state.highlightedCount >= state.candidates.length) {
      state.done = true;
      removeScrollListeners(state);
    }
  }

  function startHighlightSession(family, targetKey) {
    teardownSession();
    ensureHighlightStyle();

    const candidates = collectMatchingTextNodes(targetKey);
    const useHighlightApi = supportsHighlightApi();

    const state = {
      family,
      targetKey,
      candidates,
      highlighted: new WeakSet(),
      highlightedCount: 0,
      done: candidates.length === 0,
      mode: useHighlightApi ? "highlight-api" : "wrap",
      highlight: useHighlightApi ? new Highlight() : null,
      onScroll: null
    };

    if (useHighlightApi) {
      CSS.highlights.set(HIGHLIGHT_NAME, state.highlight);
    }

    if (!state.done) {
      state.onScroll = () => {
        if (state.scrollScheduled) return;
        state.scrollScheduled = true;
        requestAnimationFrame(() => {
          state.scrollScheduled = false;
          revealViewportMatches(state);
        });
      };

      window.addEventListener("scroll", state.onScroll, { capture: true, passive: true });
      window.addEventListener("resize", state.onScroll, { passive: true });
    }

    window[STATE_KEY] = state;
    revealViewportMatches(state);

    // Bring the first match into view when nothing is already on screen.
    if (candidates.length) {
      const scrollTarget =
        candidates.find((node) => isTextNodeInViewport(node)) || candidates[0];
      const anchor = scrollTarget?.parentElement;
      if (anchor && !isTextNodeInViewport(scrollTarget)) {
        try {
          anchor.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        } catch {
          anchor.scrollIntoView(true);
        }
        // After scroll settles, paint newly visible matches.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => revealViewportMatches(state));
        });
        window.setTimeout(() => revealViewportMatches(state), 350);
      } else if (anchor) {
        try {
          anchor.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        } catch {
          /* ignore */
        }
      }
    }

    return {
      family,
      count: candidates.length,
      highlighted: state.highlightedCount
    };
  }

  window.__prismClearFontHighlight = function prismClearFontHighlight() {
    teardownSession();
    return { cleared: true };
  };

  window.__prismHighlightFont = function prismHighlightFont(family) {
    const targetKey = normalizeFontKey(family);
    if (!targetKey) {
      teardownSession();
      return { family: "", count: 0, highlighted: 0 };
    }

    // Drop stale availability guesses so we re-check against currently loaded
    // webfonts before matching (same faces extraction waited on).
    fontAvailabilityCache.clear();
    return startHighlightSession(family, targetKey);
  };

  teardownSession();
})();
