/* Browser-side diagnostic extractor for Linear.app — injected via DevTools, not part of extension. */
async () => {
  const maxMillis = 18000;
  const scrollPauseMs = 180;
  const startedAt = performance.now();
  const colorCache = new Map();
  const gradientHits = [];

  function parseHex(raw) {
    const value = raw.trim().toLowerCase();
    if (/^#([0-9a-f]{3}|[0-9a-f]{4})$/i.test(value)) {
      const p = value.slice(1).split("");
      const [r, g, b, a] = p;
      return { r: parseInt(r + r, 16), g: parseInt(g + g, 16), b: parseInt(b + b, 16), a: a ? parseInt(a + a, 16) / 255 : 1 };
    }
    if (/^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) {
      const h = value.slice(1);
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
    }
    return null;
  }

  function parseRgb(raw) {
    const m = raw.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\)/i);
    if (!m) return null;
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  }

  function rgbaFromCssColor(raw, cssProp, el) {
    if (!raw || typeof raw !== "string") return null;
    const key = raw.trim().toLowerCase();
    if (/gradient/i.test(key)) {
      gradientHits.push({ cssProp, raw: key.slice(0, 120), tag: el?.tagName });
      return null;
    }
    if (colorCache.has(key)) return colorCache.get(key);
    if (["transparent", "inherit", "initial", "unset"].includes(key)) {
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

  function hueFamilyName(h, s, l) {
    if (s <= 18 || l <= 12 || l >= 90) return "neutral";
    if (h >= 230 && h <= 259) return "indigo";
    if (h >= 260 && h <= 274) return "blue-violet";
    if (h >= 275 && h <= 289) return "violet";
    if (h >= 290 && h <= 320) return "purple";
    return "other-chroma";
  }

  const PROP_LABEL = {
    backgroundColor: "background-color",
    color: "text-color",
    borderTopColor: "border-color",
    fill: "svg-fill",
    stroke: "svg-stroke"
  };

  const samples = [];
  const sections = [];
  const seenPerSection = new Set();
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
      const bg = rgbaFromCssColor(getComputedStyle(cur).backgroundColor, "background-color", cur);
      if (bg) return rgbToLab(bg);
      cur = cur.parentElement;
    }
    return { l: 100, a: 0, b: 0 };
  }

  function scanViewport(sectionId) {
    const nodes = document.querySelectorAll("*");
    let count = 0;
    for (const el of nodes) {
      if (performance.now() - startedAt > maxMillis) return;
      if (count++ > 1800) break;
      const styles = getComputedStyle(el);
      if (styles.display === "none" || styles.visibility === "hidden") continue;
      if (Number(styles.opacity) < 0.05) continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) continue;
      const area = rect.width * rect.height;
      const dedupeKey = `${sectionId}:${el.tagName}:${Math.round(rect.top)}:${Math.round(rect.left)}:${Math.round(rect.width)}`;
      for (const { js, css } of props) {
        if (isSyntax(el) && (js === "color" || js === "fill" || js === "stroke")) continue;
        const raw = styles.getPropertyValue(css) || styles[js];
        const rgba = rgbaFromCssColor(raw, PROP_LABEL[js] || js, el);
        if (!rgba) continue;
        const hex = toHex(rgba);
        const hsl = toHsl(rgba);
        const contrast = Math.min(1, deltaE(rgbToLab(rgba), parentBgLab(el)) / 55);
        const onceKey = `${dedupeKey}:${js}:${hex}`;
        if (seenPerSection.has(onceKey)) continue;
        seenPerSection.add(onceKey);
        samples.push({
          hex,
          hsl,
          area,
          contrast,
          cssProperty: PROP_LABEL[js] || js,
          sectionId,
          tag: el.tagName,
          hueFamily: hueFamilyName(hsl.h, hsl.s, hsl.l)
        });
      }
    }
  }

  const originalScroll = window.scrollY;
  window.scrollTo(0, 0);
  await new Promise((r) => setTimeout(r, scrollPauseMs));
  while (scrollY <= maxScroll && performance.now() - startedAt < maxMillis * 0.92) {
    const sectionId = `section-${sectionIndex}`;
    sections.push({ sectionId, scrollY });
    seenPerSection.clear();
    scanViewport(sectionId);
    if (scrollY + vh >= maxScroll) break;
    scrollY += step;
    window.scrollTo(0, scrollY);
    await new Promise((r) => setTimeout(r, scrollPauseMs));
    sectionIndex += 1;
    if (sectionIndex > 25) break;
  }
  window.scrollTo(0, originalScroll);

  const byHex = new Map();
  for (const s of samples) {
    const cur = byHex.get(s.hex) || {
      hex: s.hex,
      hsl: s.hsl,
      hueFamily: s.hueFamily,
      totalArea: 0,
      occurrences: 0,
      sections: new Set(),
      contrastSum: 0,
      sources: {}
    };
    cur.totalArea += s.area;
    cur.occurrences += 1;
    cur.sections.add(s.sectionId);
    cur.contrastSum += s.contrast;
    cur.sources[s.cssProperty] = (cur.sources[s.cssProperty] || 0) + 1;
    byHex.set(s.hex, cur);
  }

  const top50Raw = [...byHex.values()]
    .sort((a, b) => b.totalArea - a.totalArea)
    .slice(0, 50)
    .map((c) => ({
      hex: c.hex,
      hsl: c.hsl,
      hueFamily: c.hueFamily,
      totalArea: Math.round(c.totalArea),
      occurrences: c.occurrences,
      sectionCount: c.sections.size,
      avgContrast: Number((c.contrastSum / c.occurrences).toFixed(3)),
      sources: c.sources
    }));

  const purpleFamily = [...byHex.values()]
    .filter((c) => ["purple", "violet", "indigo", "blue-violet"].includes(c.hueFamily))
    .sort((a, b) => b.totalArea - a.totalArea)
    .map((c) => ({
      hex: c.hex,
      hsl: c.hsl,
      hueFamily: c.hueFamily,
      totalArea: Math.round(c.totalArea),
      occurrences: c.occurrences,
      sectionCount: c.sections.size,
      sources: c.sources
    }));

  return {
    url: location.href,
    title: document.title,
    viewport: { w: vw, h: vh },
    sectionCount: sections.length,
    totalSamples: samples.length,
    uniqueColors: byHex.size,
    gradientSkipped: gradientHits.length,
    gradientExamples: gradientHits.slice(0, 15),
    top50Raw,
    purpleFamily,
    samples
  };
};
