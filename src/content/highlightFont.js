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

  function resolvePrimaryFont(families) {
    if (!families.length) return "";
    for (const family of families) {
      if (!GENERIC_FAMILIES.has(family.toLowerCase())) return family;
    }
    return families[0];
  }

  function normalizeFontKey(family) {
    return (family || "").trim().toLowerCase();
  }

  function fontMatchesTarget(computedFamily, targetKey) {
    const stack = parseFontStack(computedFamily);
    if (!stack.length) return false;
    if (stack.some((family) => normalizeFontKey(family) === targetKey)) return true;
    return normalizeFontKey(resolvePrimaryFont(stack)) === targetKey;
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

  function isTextNodeRenderable(textNode) {
    const parent = textNode.parentElement;
    if (!parent || isPrismElement(parent)) return false;
    if (!textNode.textContent || !textNode.textContent.trim()) return false;

    const styles = getComputedStyle(parent);
    if (styles.display === "none" || styles.visibility === "hidden") return false;
    if (Number(styles.opacity) < 0.05) return false;
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

    return startHighlightSession(family, targetKey);
  };

  teardownSession();
})();
