/**
 * Temporary live preview: rewrite matching solid colors and gradients on the
 * page while the user edits palette tiles. Changes are inline overrides and
 * restore when preview clears (toggle off, panel close, or refresh).
 */
(function initPrismColorPreview() {
  const STATE_KEY = "__prismColorPreviewState";
  const ATTR = "data-prism-color-preview";
  const MAX_PATCHES = 500;
  const COLOR_PROPS = [
    "backgroundColor",
    "color",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "outlineColor",
    "fill",
    "stroke"
  ];

  function isPrismElement(el) {
    return Boolean(el?.closest?.("#prism-panel-host"));
  }

  function parseHex(hex) {
    const raw = String(hex || "")
      .trim()
      .replace(/^#/, "")
      .toUpperCase();
    if (/^[0-9A-F]{3}$/.test(raw)) {
      return {
        r: parseInt(raw[0] + raw[0], 16),
        g: parseInt(raw[1] + raw[1], 16),
        b: parseInt(raw[2] + raw[2], 16)
      };
    }
    if (/^[0-9A-F]{6}$/.test(raw)) {
      return {
        r: parseInt(raw.slice(0, 2), 16),
        g: parseInt(raw.slice(2, 4), 16),
        b: parseInt(raw.slice(4, 6), 16)
      };
    }
    return null;
  }

  function hexToCss(hex) {
    const rgb = parseHex(hex);
    if (!rgb) return null;
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  }

  function parseCssColor(raw) {
    const value = String(raw || "").trim();
    if (!value || value === "transparent" || value === "rgba(0, 0, 0, 0)" || value === "none") {
      return null;
    }

    const hex = parseHex(value);
    if (hex && /^#/i.test(value)) return hex;
    if (hex && /^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(value)) return hex;

    // Comma rgb/rgba: rgb(255, 0, 0) / rgba(255, 0, 0, 0.5)
    const comma = value.match(
      /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+)\s*)?\)$/i
    );
    if (comma) {
      const alpha = comma[4] == null ? 1 : Number(comma[4]);
      if (!(alpha > 0.08)) return null;
      return {
        r: Math.round(Number(comma[1])),
        g: Math.round(Number(comma[2])),
        b: Math.round(Number(comma[3]))
      };
    }

    // Modern space-separated: rgb(255 0 0) / rgb(255 0 0 / 0.5)
    const modern = value.match(
      /^rgba?\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+%?))?\s*\)$/i
    );
    if (modern) {
      let alpha = 1;
      if (modern[4] != null) {
        const token = modern[4];
        alpha = token.endsWith("%") ? Number(token.slice(0, -1)) / 100 : Number(token);
      }
      if (!(alpha > 0.08)) return null;
      return {
        r: Math.round(Number(modern[1])),
        g: Math.round(Number(modern[2])),
        b: Math.round(Number(modern[3]))
      };
    }

    return null;
  }

  function colorsMatch(a, b, tolerance = 0) {
    if (!a || !b) return false;
    if (tolerance <= 0) return a.r === b.r && a.g === b.g && a.b === b.b;
    return (
      Math.abs(a.r - b.r) <= tolerance &&
      Math.abs(a.g - b.g) <= tolerance &&
      Math.abs(a.b - b.b) <= tolerance
    );
  }

  function normalizeGradientCss(css) {
    return String(css || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function compactCss(value) {
    return String(value || "").replace(/\s+/g, "");
  }

  function gradientMatches(backgroundImage, targetCss) {
    const bg = normalizeGradientCss(backgroundImage);
    if (!bg || bg === "none") return false;
    const target = normalizeGradientCss(targetCss);
    if (!target) return false;
    if (bg.includes(target)) return true;
    return compactCss(bg).includes(compactCss(target));
  }

  function cssPropToStyleName(prop) {
    return prop.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
  }

  function shouldSkipElement(el) {
    if (!el || el.nodeType !== 1 || isPrismElement(el)) return true;
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEMPLATE") {
      return true;
    }
    if (tag === "INPUT" && String(el.type || "").toLowerCase() === "password") return true;
    return false;
  }

  function originKey(payload) {
    if (payload?.mode === "gradient") {
      return payload.gradientId ? `gradient:${payload.gradientId}` : null;
    }
    return payload?.swatchId ? `solid:${payload.swatchId}` : null;
  }

  function ensureState() {
    if (window[STATE_KEY]) return window[STATE_KEY];
    const state = {
      patches: new Map(),
      origins: new Map(),
      varPatches: new Map()
    };
    window[STATE_KEY] = state;
    return state;
  }

  function restoreElement(el, patch) {
    if (!el || !patch?.props) return;
    for (const [styleName, prev] of Object.entries(patch.props)) {
      if (prev?.value) {
        el.style.setProperty(styleName, prev.value, prev.priority || "");
      } else {
        el.style.removeProperty(styleName);
      }
    }
    el.removeAttribute(ATTR);
  }

  function restoreCssVars(state) {
    for (const [root, vars] of state.varPatches) {
      if (!root) continue;
      for (const [name, prev] of Object.entries(vars)) {
        if (prev?.value) root.style.setProperty(name, prev.value, prev.priority || "");
        else root.style.removeProperty(name);
      }
    }
    state.varPatches.clear();
  }

  function clearPreview() {
    const state = window[STATE_KEY];
    if (!state) return { cleared: true, count: 0 };
    let count = 0;
    for (const [el, patch] of state.patches) {
      restoreElement(el, patch);
      count += 1;
    }
    restoreCssVars(state);
    state.patches.clear();
    state.origins.clear();
    window[STATE_KEY] = null;
    return { cleared: true, count };
  }

  function patchBelongsTo(patch, payload) {
    if (!patch || !payload) return false;
    if (payload.mode === "gradient") {
      return patch.mode === "gradient" && patch.gradientId === payload.gradientId;
    }
    return patch.mode !== "gradient" && patch.swatchId === payload.swatchId;
  }

  function matchingColorProps(el, targetRgb, tolerance = 1) {
    const styles = getComputedStyle(el);
    const props = [];
    for (const prop of COLOR_PROPS) {
      const parsed = parseCssColor(styles[prop]);
      if (colorsMatch(parsed, targetRgb, tolerance)) props.push(prop);
    }
    return props;
  }

  function pushSolidMatch(matches, el, fromRgb, tolerance, seen) {
    if (!el || seen.has(el) || shouldSkipElement(el)) return;
    const props = matchingColorProps(el, fromRgb, tolerance);
    if (!props.length) return;
    seen.add(el);
    matches.push({ el, props });
  }

  function collectSolidMatches(fromRgb, limit) {
    const matches = [];
    if (!fromRgb) return matches;
    const seen = new Set();

    // TreeWalker(root) never yields `root` itself — page canvas colors often live
    // on html/body (e.g. Apple Store #f5f5f7), so check them explicitly first.
    // Exact match only so editing an accent never repaints the page canvas.
    pushSolidMatch(matches, document.documentElement, fromRgb, 0, seen);
    pushSolidMatch(matches, document.body, fromRgb, 0, seen);

    if (!document.body) return matches;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode(el) {
        if (shouldSkipElement(el)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode() && matches.length < limit) {
      pushSolidMatch(matches, walker.currentNode, fromRgb, 0, seen);
    }
    return matches;
  }

  function pushGradientMatch(matches, el, fromCss, seen) {
    if (!el || seen.has(el) || shouldSkipElement(el) || !fromCss) return;
    const bg = getComputedStyle(el).backgroundImage;
    if (!gradientMatches(bg, fromCss)) return;
    seen.add(el);
    matches.push({ el, props: ["backgroundImage"] });
  }

  function collectGradientMatches(fromCss, limit) {
    const matches = [];
    if (!fromCss) return matches;
    const seen = new Set();

    pushGradientMatch(matches, document.documentElement, fromCss, seen);
    pushGradientMatch(matches, document.body, fromCss, seen);

    if (!document.body) return matches;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode(el) {
        if (shouldSkipElement(el)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    while (walker.nextNode() && matches.length < limit) {
      pushGradientMatch(matches, walker.currentNode, fromCss, seen);
    }
    return matches;
  }

  function paintElement(el, props, toCss, payload, state) {
    const styleProps = {};
    for (const prop of props) {
      const styleName = cssPropToStyleName(prop);
      if (!styleProps[styleName]) {
        styleProps[styleName] = {
          value: el.style.getPropertyValue(styleName),
          priority: el.style.getPropertyPriority(styleName)
        };
      }
      el.style.setProperty(styleName, toCss, "important");
    }
    const id = payload.mode === "gradient" ? payload.gradientId : payload.swatchId;
    el.setAttribute(ATTR, id || "");
    state.patches.set(el, {
      mode: payload.mode === "gradient" ? "gradient" : "solid",
      swatchId: payload.swatchId || null,
      gradientId: payload.gradientId || null,
      props: styleProps
    });
  }

  function applyCssVarPreview(fromRgb, toCss, state, owner) {
    const roots = [document.documentElement, document.body].filter(Boolean);
    let painted = 0;
    for (const root of roots) {
      const styles = getComputedStyle(root);
      const vars = state.varPatches.get(root) || {};
      for (let i = 0; i < styles.length; i += 1) {
        const name = styles[i];
        if (!name || !name.startsWith("--")) continue;

        const existing = vars[name];
        if (existing) {
          // Only rewrite vars claimed by this same swatch/gradient — never
          // reassign another tile's variable to the color being edited now.
          if (!patchBelongsTo(existing, owner)) continue;
          root.style.setProperty(name, toCss, "important");
          painted += 1;
          continue;
        }

        const raw = styles.getPropertyValue(name).trim();
        const parsed = parseCssColor(raw);
        if (!colorsMatch(parsed, fromRgb, 0)) continue;
        vars[name] = {
          value: root.style.getPropertyValue(name),
          priority: root.style.getPropertyPriority(name),
          mode: owner.mode === "gradient" ? "gradient" : "solid",
          swatchId: owner.swatchId || null,
          gradientId: owner.gradientId || null
        };
        root.style.setProperty(name, toCss, "important");
        painted += 1;
      }
      if (Object.keys(vars).length) state.varPatches.set(root, vars);
    }
    return painted;
  }

  function applySolidPreview(payload, state) {
    const swatchId = payload.swatchId ? String(payload.swatchId) : null;
    const fromHex = payload.fromHex;
    const toHex = payload.toHex;
    const fromRgb = parseHex(fromHex);
    const toCss = hexToCss(toHex);
    if (!fromRgb || !toCss) return { ok: false, count: 0 };

    const key = originKey({ mode: "solid", swatchId });
    if (key && !state.origins.has(key)) {
      state.origins.set(key, String(fromHex).toLowerCase());
    }
    const originHex = key ? state.origins.get(key) : fromHex;
    const originRgb = parseHex(originHex) || fromRgb;
    const scoped = { mode: "solid", swatchId };

    let painted = 0;
    for (const [el, patch] of state.patches) {
      if (!el.isConnected) {
        state.patches.delete(el);
        continue;
      }
      if (!patchBelongsTo(patch, scoped)) continue;
      for (const styleName of Object.keys(patch.props || {})) {
        el.style.setProperty(styleName, toCss, "important");
      }
      painted += 1;
    }

    painted += applyCssVarPreview(originRgb, toCss, state, scoped);

    const room = Math.max(0, MAX_PATCHES - state.patches.size);
    if (room > 0) {
      for (const { el, props } of collectSolidMatches(originRgb, room + 40)) {
        if (state.patches.has(el)) continue;
        if (state.patches.size >= MAX_PATCHES) break;
        paintElement(el, props, toCss, scoped, state);
        painted += 1;
      }
    }

    return {
      ok: true,
      mode: "solid",
      count: painted,
      total: state.patches.size,
      swatchId,
      fromHex: originHex,
      toHex
    };
  }

  function applyGradientPreview(payload, state) {
    const gradientId = payload.gradientId ? String(payload.gradientId) : null;
    const fromCss = String(payload.fromCss || "").trim();
    const toCss = String(payload.toCss || "").trim();
    if (!fromCss || !toCss) return { ok: false, count: 0 };

    const key = originKey({ mode: "gradient", gradientId });
    if (key && !state.origins.has(key)) {
      state.origins.set(key, fromCss);
    }
    const originCss = key ? state.origins.get(key) : fromCss;
    const scoped = { mode: "gradient", gradientId };

    let painted = 0;
    for (const [el, patch] of state.patches) {
      if (!el.isConnected) {
        state.patches.delete(el);
        continue;
      }
      if (!patchBelongsTo(patch, scoped)) continue;
      el.style.setProperty("background-image", toCss, "important");
      painted += 1;
    }

    const room = Math.max(0, MAX_PATCHES - state.patches.size);
    if (room > 0) {
      for (const { el, props } of collectGradientMatches(originCss, room + 40)) {
        if (state.patches.has(el)) continue;
        if (state.patches.size >= MAX_PATCHES) break;
        paintElement(el, props, toCss, scoped, state);
        painted += 1;
      }
    }

    return {
      ok: true,
      mode: "gradient",
      count: painted,
      total: state.patches.size,
      gradientId,
      fromCss: originCss,
      toCss
    };
  }

  function applyPreview(payload = {}) {
    const state = ensureState();
    if (payload.mode === "gradient") {
      return applyGradientPreview(payload, state);
    }
    return applySolidPreview(payload, state);
  }

  window.__prismClearColorPreview = function prismClearColorPreview() {
    return clearPreview();
  };

  window.__prismPreviewColor = function prismPreviewColor(payload) {
    if (!payload) return { ok: false, count: 0 };
    if (payload.mode === "gradient") {
      if (!payload.fromCss || !payload.toCss) return { ok: false, count: 0 };
      return applyPreview(payload);
    }
    if (!payload.fromHex || !payload.toHex) return { ok: false, count: 0 };
    return applyPreview(payload);
  };
})();
