/**
 * Full-page visual identity extraction (injected, self-contained).
 * Virtual section scan (no page scroll) — maps document bands, collects rendered colors.
 */
window.__prismExtractPalette = async function extractPaletteInPage(options = {}) {
  const maxMillis = options.maxMillis || 18000;
  const startedAt = performance.now();
  const colorCache = new Map();

  function parseHex(raw) {
    const value = raw.trim().toLowerCase();
    if (/^#([0-9a-f]{3}|[0-9a-f]{4})$/i.test(value)) {
      const p = value.slice(1).split("");
      const [r, g, b, a] = p;
      return { r: parseInt(r + r, 16), g: parseInt(g + g, 16), b: parseInt(b + b, 16), a: a ? parseInt(a + a, 16) / 255 : 1 };
    }
    if (/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) {
      const h = value.slice(1);
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1
      };
    }
    return null;
  }

  function parseRgb(raw) {
    const m = raw.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\)/i);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  }

  function rgbaFromCssColor(raw) {
    if (!raw || typeof raw !== "string") return null;
    const key = raw.trim().toLowerCase();
    if (colorCache.has(key)) return colorCache.get(key);
    if (["transparent", "inherit", "initial", "unset"].includes(key) || /gradient/i.test(key)) {
      colorCache.set(key, null);
      return null;
    }
    const parsed = parseRgb(key) || parseHex(key);
    if (!parsed || parsed.a < 0.04) {
      colorCache.set(key, null);
      return null;
    }
    colorCache.set(key, parsed);
    return parsed;
  }

  function toHex({ r, g, b }) {
    const h = (v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
    return `#${h(r)}${h(g)}${h(b)}`;
  }

  function toHsl({ r, g, b }) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), d = max - min;
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (d > 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (max === rn) h = ((gn - bn) / d) % 6;
      else if (max === gn) h = (bn - rn) / d + 2;
      else h = (rn - gn) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function rgbToLab({ r, g, b }) {
    let rn = r / 255, gn = g / 255, bn = b / 255;
    const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    rn = lin(rn); gn = lin(gn); bn = lin(bn);
    const x = (rn * 0.4124 + gn * 0.3576 + bn * 0.1805) / 0.95047;
    const y = rn * 0.2126 + gn * 0.7152 + bn * 0.0722;
    const z = (rn * 0.0193 + gn * 0.1192 + bn * 0.9505) / 1.08883;
    const f = (t) => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116);
    const fy = f(y);
    return { l: 116 * fy - 16, a: 500 * (f(x) - fy), b: 200 * (fy - f(z)) };
  }

  function deltaE(a, b) {
    const dl = a.l - b.l, da = a.a - b.a, db = a.b - b.b;
    return Math.sqrt(dl * dl + da * da + db * db);
  }

  function isSyntax(el) {
    return !!el.closest("pre, code, [class*='hljs'], [class*='highlight'], [class*='prism']");
  }

  function isChart(el) {
    const blob = `${el.className} ${el.id} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
    return /chart|graph|recharts|d3|plot|visualization|sparkline|canvas/.test(blob) || !!el.closest("svg[class*='chart' i]");
  }

  const SOURCE_WEIGHT = {
    hero_cta: 10,
    primary_button: 9,
    navigation: 8,
    global_background: 8,
    hero_background: 8,
    logo: 8,
    repeated_section_bg: 7,
    major_container: 6,
    illustration: 5,
    card: 4,
    promo_content: 2,
    blog_card: 2,
    marketing_banner: 2,
    dynamic_content: 2,
    success_state: 1,
    warning_state: 1,
    error_state: 1,
    alert: 1,
    notification: 1,
    status_chip: 1,
    chart: 1,
    syntax_highlight: 0.5,
    demo_navigation: 1,
    demo_sidebar: 1,
    demo_status: 1,
    demo_illustration: 2,
    default: 3
  };

  const PRODUCT_DEMO_SELECTOR = [
    '[class*="IssueView" i]',
    '[class*="SlackIssue" i]',
    '[class*="Plan_" i]',
    '[class*="Monitor_" i]',
    '[class*="Build_cmdk" i]',
    '[class*="Build_blink" i]',
    '[class*="page_panel" i]',
    '[class*="Sidebar_navItem" i]',
    '[class*="Sidebar_navItems" i]',
    '[class*="Sidebar_sidebar" i]',
    '[class*="mock" i]',
    '[class*="preview" i]',
    '[class*="screenshot" i]',
    '[class*="product-demo" i]',
    '[class*="browser-window" i]',
    '[class*="device-frame" i]',
    '[class*="kanban" i]',
    '[class*="timelineContent" i]',
    '[class*="chatBox" i]',
    '[class*="agentChart" i]',
    '[class*="initiativesBox" i]'
  ].join(", ");

  function isInsideProductDemo(el) {
    return !!el.closest(PRODUCT_DEMO_SELECTOR);
  }

  function detectContentZone(el) {
    if (isInsideProductDemo(el)) return "product_demo";

    const siteHeader = el.closest("header");
    if (siteHeader && !isInsideProductDemo(siteHeader)) return "website_chrome";

    const siteNav = el.closest('nav, [role="navigation"]');
    if (siteNav && !isInsideProductDemo(siteNav)) return "website_chrome";

    if (el.closest("footer") && !isInsideProductDemo(el.closest("footer"))) return "website_chrome";

    const marketingHero = el.closest('[class*="Hero_" i], [id*="hero" i]');
    if (marketingHero && !isInsideProductDemo(marketingHero)) return "website_chrome";

    return "page_content";
  }

  function isStatusLike(blob, context) {
    if (
      /success|positive|complete|verified|passed|done/.test(blob) &&
      /badge|tag|chip|pill|status|toast|alert|banner|label|dot/.test(blob)
    ) {
      return true;
    }
    if (
      /warning|caution|pending|attention|at risk|risk/.test(blob) &&
      /badge|tag|chip|pill|status|toast|alert|banner|label|dot/.test(blob)
    ) {
      return true;
    }
    if (
      /error|danger|fail|invalid|destructive/.test(blob) &&
      /badge|tag|chip|pill|status|toast|alert|banner|label|dot/.test(blob)
    ) {
      return true;
    }
    if (/labeldot|status|badge|chip|pill/.test(blob)) return true;
    if (context === "icon" && /sidebar|navitem|nav-item/.test(blob)) return true;
    return false;
  }

  function classifySource(el, rect, sectionIndex, vh, prop, context, contentZone) {
    const tag = el.tagName || "";
    const classText = typeof el.className === "string" ? el.className : "";
    const idText = el.id || "";
    const ariaLabel = el.getAttribute("aria-label") || "";
    const role = el.getAttribute("role") || "";
    const text = (el.innerText || "").slice(0, 80);
    const blob = `${classText} ${idText} ${ariaLabel} ${text}`.toLowerCase();
    const inNav = !!el.closest('nav, [role="navigation"]');
    const inHeader = !!el.closest("header");
    const inFooter = !!el.closest("footer");
    const inHero =
      sectionIndex === 0 ||
      rect.top < vh * 0.9 ||
      !!el.closest('[class*="hero" i], [id*="hero" i], main > section:first-of-type');
    const chromeHero = contentZone === "website_chrome" && inHero;

    if (isSyntax(el)) return "syntax_highlight";
    if (isChart(el)) return "chart";

    if (contentZone === "product_demo") {
      if (inNav || role === "navigation" || tag === "NAV" || /sidebar|navitem|nav-item/.test(blob)) {
        if (isStatusLike(blob, context)) return "demo_status";
        if (/sidebar/.test(blob)) return "demo_sidebar";
        return "demo_navigation";
      }
      if (isStatusLike(blob, context)) return "demo_status";
      if (context === "icon" || tag === "SVG") return "demo_illustration";
      if (prop === "backgroundColor" || context === "surface") return "demo_illustration";
      return "default";
    }

    if (/success|positive|complete|verified|passed|done/.test(blob) && /badge|tag|chip|pill|status|toast|alert|banner|label/.test(blob)) {
      return "success_state";
    }
    if (/warning|caution|pending|attention/.test(blob) && /badge|tag|chip|pill|status|toast|alert|banner|label/.test(blob)) {
      return "warning_state";
    }
    if (/error|danger|fail|invalid|destructive/.test(blob) && /badge|tag|chip|pill|status|toast|alert|banner|label/.test(blob)) {
      return "error_state";
    }
    if (/alert|toast|notification|snackbar/.test(blob)) return "alert";
    if (/badge|chip|pill|status|tag-label/.test(blob)) return "status_chip";

    if (/promo|promotion|offer|sale|campaign|advert/.test(blob)) return "promo_content";
    if (/blog|article|post-card|newsletter/.test(blob)) return "blog_card";
    if (/banner|billboard|hero-ad/.test(blob)) return "marketing_banner";

    if (inNav || role === "navigation" || tag === "NAV") return "navigation";
    if (/logo|brand-mark|wordmark/.test(blob) || (tag === "SVG" && inHeader)) return "logo";

    if (chromeHero) {
      if (context === "button" || tag === "BUTTON" || role === "button") return "hero_cta";
      if (prop === "backgroundColor" || context === "surface") return "hero_background";
    }

    if (context === "button" || tag === "BUTTON" || role === "button") return "primary_button";
    if ((tag === "BODY" || tag === "HTML") && (prop === "backgroundColor" || context === "surface")) return "global_background";
    if (inHeader && (prop === "backgroundColor" || context === "surface")) return "global_background";
    if (sectionIndex === 0 && (prop === "backgroundColor" || context === "surface") && rect.width * rect.height > vw * vh * 0.5) {
      return "global_background";
    }
    if (prop === "backgroundColor" || context === "surface") {
      if (/section|container|wrapper|layout|shell|page/.test(blob)) return "repeated_section_bg";
      if (tag === "MAIN" || tag === "SECTION" || tag === "ARTICLE") return "repeated_section_bg";
      return "major_container";
    }

    if (context === "icon" || tag === "SVG") return "illustration";
    if (/card|tile|feature/.test(blob) || el.closest('[class*="card" i], article')) return "card";
    if (inFooter) return "default";

    return "default";
  }

  function parsePx(val) {
    if (!val || val === "normal") return 0;
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : 0;
  }

  const AREA_SOURCE_LABEL = {
    backgroundColor: "Background",
    color: "Text",
    borderTopColor: "Border",
    fill: "SVG Fill",
    stroke: "SVG Stroke"
  };

  function measureTextArea(el, styles) {
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return 0;

    let area = 0;
    const hasTextElementChild = [...el.children].some((child) => {
      const cr = child.getBoundingClientRect();
      return cr.width > 0 && cr.height > 0 && (child.textContent || "").trim().length > 0;
    });

    const textNodes = [];
    if (hasTextElementChild) {
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) textNodes.push(node);
      }
    } else {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      let node;
      while ((node = walker.nextNode())) textNodes.push(node);
    }

    for (const node of textNodes) {
      try {
        const range = document.createRange();
        range.selectNodeContents(node);
        const boxes = range.getClientRects();
        for (let i = 0; i < boxes.length; i += 1) {
          area += boxes[i].width * boxes[i].height;
        }
      } catch (_err) {
        /* ignore range errors on detached nodes */
      }
    }
    if (area > 0) return area;

    // Fall back to an estimate, but only for this element's OWN text. Using
    // el.textContent here would attribute descendant text — which child
    // elements render in their own fonts — to this element, fabricating
    // phantom font families for containers that merely set a font-family
    // their children override (e.g. a button styled "Arial" whose label span
    // actually renders in "Inter").
    const text = textNodes.map((node) => node.textContent).join("").trim();
    if (!text.length) return 0;

    const fontSize = parsePx(styles.fontSize) || 16;
    const lineHeightRaw = styles.lineHeight;
    let lineHeight = fontSize * 1.2;
    if (lineHeightRaw && lineHeightRaw !== "normal") {
      lineHeight = lineHeightRaw.endsWith("px")
        ? parsePx(lineHeightRaw)
        : fontSize * parseFloat(lineHeightRaw);
    }
    const avgCharWidth = fontSize * 0.55;
    const textWidth = Math.min(text.length * avgCharWidth, rect.width);
    const lines = Math.max(1, Math.ceil(textWidth / Math.max(rect.width, 1)));
    return Math.min(rect.width * rect.height, lines * lineHeight * textWidth);
  }

  function measureBorderArea(styles, rect) {
    const bt = parsePx(styles.borderTopWidth);
    const br = parsePx(styles.borderRightWidth);
    const bb = parsePx(styles.borderBottomWidth);
    const bl = parsePx(styles.borderLeftWidth);
    return bt * rect.width + bb * rect.width + bl * rect.height + br * rect.height;
  }

  function measureSvgArea(el) {
    const svg = el.tagName === "SVG" ? el : el.closest("svg");
    const target = svg || el;
    const r = target.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return 0;
    const rawArea = r.width * r.height;
    const svgCap = Math.max(2500, vw * vh * 0.015);
    return Math.min(rawArea, svgCap);
  }

  function computeColorArea(el, styles, rect, js) {
    switch (js) {
      case "backgroundColor":
        return rect.width * rect.height;
      case "color":
        return measureTextArea(el, styles);
      case "borderTopColor":
        return measureBorderArea(styles, rect);
      case "fill":
      case "stroke":
        return measureSvgArea(el);
      default:
        return rect.width * rect.height;
    }
  }

  function getContext(el, prop) {
    const tag = el.tagName;
    if (tag === "BUTTON" || el.getAttribute("role") === "button") return "button";
    if (tag === "A") return "link";
    if (tag === "SVG" || prop === "fill" || prop === "stroke") return "icon";
    if (/^H[1-6]$/.test(tag)) return "heading";
    if (prop === "backgroundColor") return "surface";
    if (prop === "color") return "text";
    if (prop === "borderTopColor") return "border";
    return "other";
  }

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

  // Canvas-based detection of whether a font family is actually installed or
  // loaded. A declared family is only rendered if the browser actually has it;
  // otherwise the glyph metrics fall back to the generic baseline and match it.
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
      // Detection unavailable — assume present so we don't drop real fonts.
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
    fontAvailabilityCache.set(key, available);
    return available;
  }

  // Resolve the family the browser *actually renders* rather than the first
  // name declared in the CSS stack. Pages frequently list a brand font that the
  // visitor doesn't have installed (e.g. "Mona Sans", "Segoe UI", sans-serif);
  // the browser silently falls back to the next available family, so reporting
  // the first declared name would be wrong.
  function resolveRenderedFont(families) {
    if (!families.length) return "";
    for (const family of families) {
      if (GENERIC_FAMILIES.has(family.toLowerCase())) continue;
      if (isFontAvailable(family)) return family;
    }
    // Nothing in the stack is installed/loaded — fall back to the page's
    // intended primary so we at least surface what it was reaching for.
    return resolvePrimaryFont(families);
  }

  function normalizeFontWeight(weight) {
    if (weight == null || weight === "") return 400;
    const value = String(weight).trim().toLowerCase();
    if (value === "normal") return 400;
    if (value === "bold") return 700;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 400;
  }

  function getHeadingLevel(el) {
    const match = (el.tagName || "").match(/^H([1-6])$/i);
    return match ? parseInt(match[1], 10) : null;
  }

  function getAncestorHeadingLevel(el) {
    if (!el || typeof el.closest !== "function") return null;
    const heading = el.closest("h1, h2, h3, h4, h5, h6");
    return heading ? getHeadingLevel(heading) : null;
  }

  function getViewportVisibility(virtualRect, vh) {
    const visibleTop = Math.max(virtualRect.top, 0);
    const visibleBottom = Math.min(virtualRect.bottom, vh);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    const ratio = visibleHeight / Math.max(virtualRect.height, 1);
    return {
      viewportVisible: ratio >= 0.2,
      visibilityRatio: Math.min(1, ratio)
    };
  }

  function collectFontTokens() {
    const tokens = [];
    const seen = new Set();
    const root = getComputedStyle(document.documentElement);
    const varNames = [
      "--font-family",
      "--font-sans",
      "--font-serif",
      "--font-mono",
      "--font-body",
      "--font-heading",
      "--font-display",
      "--font-ui",
      "--typography-font-family",
      "--default-font-family"
    ];

    for (const name of varNames) {
      const value = root.getPropertyValue(name).trim();
      if (!value) continue;
      const family = resolveRenderedFont(parseFontStack(value));
      const key = family.toLowerCase();
      if (!family || seen.has(key)) continue;
      seen.add(key);
      tokens.push({ family, source: name });
    }

    return tokens;
  }

  function getImportance(el, rect, sectionIndex, vh, contentZone) {
    const tag = el.tagName;
    const role = el.getAttribute("role") || "";
    const text = (el.innerText || "").slice(0, 80).toLowerCase();
    const inHero =
      sectionIndex === 0 ||
      rect.top < vh * 0.9 ||
      !!el.closest('[class*="hero" i], [id*="hero" i], main > section:first-of-type');

    if (contentZone === "product_demo") return 3;

    if (contentZone === "website_chrome" && inHero && (/^H[1-2]$/.test(tag) || (tag === "BUTTON" && rect.width > 72))) {
      return 100;
    }
    if (tag === "BUTTON" || role === "button") {
      if (contentZone === "website_chrome" && /sign up|free trial|get started|book now|try|start|join|subscribe|buy/.test(text)) {
        return 90;
      }
      return contentZone === "website_chrome" ? 60 : 40;
    }
    if (contentZone === "website_chrome" && el.closest('nav, [role="navigation"], header')) return 70;
    if (contentZone === "website_chrome" && (tag === "A" || role === "link")) return 60;
    if (el.closest('[class*="card" i], article, [class*="feature" i]')) return 30;
    if (/^P$|^H[3-6]$|^LI$|^TD$/.test(tag)) return 10;
    return 3;
  }

  const samples = [];
  const fontSamples = [];
  const fontTokens = collectFontTokens();
  const areaContributions = new Map();
  const sections = [];
  const seenPerSection = new Set();
  const panelHost = document.getElementById("prism-panel-host");
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxScroll = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
  const step = Math.max(Math.floor(vh * 0.72), 280);
  let scrollY = 0;
  let sectionIndex = 0;

  const props = [
    { js: "backgroundColor", css: "background-color" },
    { js: "color", css: "color" },
    { js: "borderTopColor", css: "border-top-color" },
    { js: "fill", css: "fill" },
    { js: "stroke", css: "stroke" }
  ];

  function parentBgLab(el) {
    let cur = el.parentElement;
    for (let i = 0; i < 8 && cur; i += 1) {
      const bg = rgbaFromCssColor(getComputedStyle(cur).backgroundColor);
      if (bg) return rgbToLab(bg);
      cur = cur.parentElement;
    }
    return { l: 100, a: 0, b: 0 };
  }

  function scanVirtualSection(virtualScrollY, sectionId, sectionIndex) {
    const nodes = document.querySelectorAll("*");
    const limit = options.maxElementsPerSection || 1800;
    let count = 0;
    const pageScrollY = window.scrollY;

    for (const el of nodes) {
      if (performance.now() - startedAt > maxMillis) return;
      if (count++ > limit) break;

      // Never analyze Prism's own injected panel — its chrome (e.g. the host's
      // `system-ui` font and white background) would otherwise pollute results.
      if (panelHost && panelHost.contains(el)) continue;

      const styles = getComputedStyle(el);
      if (styles.display === "none" || styles.visibility === "hidden") continue;
      if (Number(styles.opacity) < 0.05) continue;

      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (rect.right < 0 || rect.left > vw) continue;

      const docTop = rect.top + pageScrollY;
      const docBottom = rect.bottom + pageScrollY;
      const virtualTop = docTop - virtualScrollY;
      const virtualBottom = docBottom - virtualScrollY;
      if (virtualBottom < 0 || virtualTop > vh) continue;

      const virtualRect = {
        top: virtualTop,
        bottom: virtualBottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height
      };

      const contentZone = detectContentZone(el);
      const importance = getImportance(el, virtualRect, sectionIndex, vh, contentZone);
      const dedupeKey = `${sectionId}:${el.tagName}:${Math.round(docTop)}:${Math.round(rect.left)}:${Math.round(rect.width)}`;

      for (const { js, css } of props) {
        if (isSyntax(el) && (js === "color" || js === "fill" || js === "stroke")) continue;

        const rgba = rgbaFromCssColor(styles.getPropertyValue(css) || styles[js]);
        if (!rgba) continue;

        const area = computeColorArea(el, styles, virtualRect, js);
        if (area <= 0) continue;

        const hex = toHex(rgba);
        const areaSourceType = AREA_SOURCE_LABEL[js] || js;
        const contribKey = `${hex}:${areaSourceType}`;
        const existing = areaContributions.get(contribKey) || { hex, sourceType: areaSourceType, area: 0, count: 0 };
        existing.area += area;
        existing.count += 1;
        areaContributions.set(contribKey, existing);

        const context = getContext(el, js);
        const sourceCategory = classifySource(el, virtualRect, sectionIndex, vh, js, context, contentZone);
        const brandWeight = SOURCE_WEIGHT[sourceCategory] || SOURCE_WEIGHT.default;
        const propImportance = js === "borderTopColor" ? 3 : importance;
        const weightedImportance = propImportance * brandWeight;
        const lab = rgbToLab(rgba);
        const contrast = Math.min(1, deltaE(lab, parentBgLab(el)) / 55);
        const onceKey = `${dedupeKey}:${context}:${toHex(rgba)}`;
        if (seenPerSection.has(onceKey)) continue;
        seenPerSection.add(onceKey);

        samples.push({
          hex,
          rgb: { r: rgba.r, g: rgba.g, b: rgba.b },
          hsl: toHsl(rgba),
          area,
          areaSourceType,
          importance: weightedImportance,
          rawImportance: propImportance,
          brandWeight,
          sourceCategory,
          contentZone,
          sectionId,
          context,
          contrast
        });
      }

      if (isSyntax(el)) continue;

      const textArea = measureTextArea(el, styles);
      if (textArea <= 0) continue;

      const family = resolveRenderedFont(parseFontStack(styles.fontFamily));
      if (!family) continue;

      const textContext = getContext(el, "color");
      const fontOnceKey = `${dedupeKey}:font`;
      if (seenPerSection.has(fontOnceKey)) continue;
      seenPerSection.add(fontOnceKey);

      const fontSourceCategory = classifySource(
        el,
        virtualRect,
        sectionIndex,
        vh,
        "color",
        textContext,
        contentZone
      );
      const fontBrandWeight = SOURCE_WEIGHT[fontSourceCategory] || SOURCE_WEIGHT.default;

      // Display fonts are often applied to inline accents inside a heading
      // (e.g. an <em> styled with a serif inside an <h1>). Such text is not a
      // heading *tag*, so without this it scores like low-priority body copy
      // and gets dropped from the curated set. Treat it as the heading it lives
      // in so its distinct family surfaces.
      const ownHeadingLevel = getHeadingLevel(el);
      const headingLevel = ownHeadingLevel || getAncestorHeadingLevel(el);
      const fontContext = headingLevel ? "heading" : textContext;

      let fontImportance = getImportance(el, virtualRect, sectionIndex, vh, contentZone);
      if (headingLevel && !ownHeadingLevel) {
        const headingFloor = headingLevel <= 2 ? 60 : headingLevel <= 4 ? 10 : 3;
        fontImportance = Math.max(fontImportance, headingFloor);
      }
      const weightedFontImportance = fontImportance * fontBrandWeight;
      const visibility = getViewportVisibility(virtualRect, vh);
      const textLength = (el.textContent || "").trim().length;

      fontSamples.push({
        family,
        stack: styles.fontFamily,
        fontSize: parsePx(styles.fontSize) || 16,
        weight: normalizeFontWeight(styles.fontWeight),
        style: styles.fontStyle || "normal",
        textLength,
        headingLevel,
        viewportVisible: visibility.viewportVisible,
        visibilityRatio: visibility.visibilityRatio,
        area: textArea,
        importance: weightedFontImportance,
        rawImportance: fontImportance,
        brandWeight: fontBrandWeight,
        sourceCategory: fontSourceCategory,
        contentZone,
        sectionId,
        context: fontContext
      });
    }
  }

  while (scrollY <= maxScroll && performance.now() - startedAt < maxMillis * 0.92) {
    const sectionId = `section-${sectionIndex}`;
    const startY = scrollY;
    const endY = Math.min(scrollY + vh, maxScroll);
    sections.push({ sectionId, startY, endY });
    seenPerSection.clear();
    scanVirtualSection(scrollY, sectionId, sectionIndex);

    if (scrollY + vh >= maxScroll) break;
    scrollY += step;
    sectionIndex += 1;
    if (sectionIndex > 25) break;
  }

  return {
    sampledElements: samples.length,
    sectionCount: sections.length,
    sections,
    samples,
    fontSamples,
    fontTokens,
    areaContributions: [...areaContributions.values()]
      .map((c) => ({ hex: c.hex, sourceType: c.sourceType, area: Math.round(c.area), count: c.count }))
      .sort((a, b) => b.area - a.area)
  };
};
