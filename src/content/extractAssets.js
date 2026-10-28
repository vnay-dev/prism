/**
 * Page-context asset discovery (injected). Returns raw image/icon URL
 * candidates only — curation/dedupe/filtering runs in the extension popup.
 * Does not fetch remote asset bodies. Inline <svg> nodes are serialized to
 * data: URLs so nested icons (e.g. inside buttons) can be downloaded.
 */
window.__prismExtractAssets = function extractAssetsInPage(options = {}) {
  const maxCandidates = options.maxCandidates || 400;
  const maxInlineSvgBytes = options.maxInlineSvgBytes || 400_000;
  const baseHref = location.href;
  const candidates = [];
  const byKey = new Map();
  let stampSeq = 0;
  const XLINK_NS = "http://www.w3.org/1999/xlink";
  const DOM_ATTR = "data-prism-asset-id";

  function normalize(raw) {
    if (raw == null) return null;
    const text = String(raw).trim();
    if (!text || /^javascript:/i.test(text)) return null;
    try {
      const url = new URL(text, baseHref);
      if (!["http:", "https:", "data:", "blob:"].includes(url.protocol)) return null;
      url.hash = "";
      return url.href;
    } catch {
      return null;
    }
  }

  function stampElement(el) {
    if (!el?.setAttribute) return null;
    let id = el.getAttribute(DOM_ATTR);
    if (!id) {
      stampSeq += 1;
      id = `pa-${stampSeq}`;
      el.setAttribute(DOM_ATTR, id);
    }
    return id;
  }

  function push(entry, els = null) {
    if (!entry?.url) return;
    const key = `${entry.kindHint || "image"}:${entry.url}`;
    const targets = Array.isArray(els) ? els.filter(Boolean) : els ? [els] : [];
    const stampedIds = [];
    for (const el of targets) {
      const domId = stampElement(el);
      if (domId) stampedIds.push(domId);
    }
    const existing = byKey.get(key);
    if (existing) {
      for (const domId of stampedIds) {
        if (!existing.domIds.includes(domId)) existing.domIds.push(domId);
      }
      if (entry.symbolId && !existing.symbolId) existing.symbolId = entry.symbolId;
      if (
        (!Number.isFinite(existing.width) || existing.width <= 0) &&
        Number.isFinite(entry.width) &&
        entry.width > 0
      ) {
        existing.width = entry.width;
        existing.height = entry.height;
      }
      return;
    }
    if (candidates.length >= maxCandidates) return;
    const record = {
      ...entry,
      domIds: [...new Set(stampedIds)]
    };
    byKey.set(key, record);
    candidates.push(record);
  }

  /** Visible <svg>/<use> hosts that reference a sprite symbol id. */
  function hostsForSymbolId(symbolId) {
    if (!symbolId) return [];
    const want = String(symbolId);
    const hosts = [];
    const seen = new Set();
    for (const use of queryAllDeep("use")) {
      const href = readHref(use);
      if (!href?.startsWith("#")) continue;
      let id = "";
      try {
        id = decodeURIComponent(href.slice(1));
      } catch {
        id = href.slice(1);
      }
      if (id !== want) continue;
      const host = use.closest?.("svg") || use;
      if (!host || seen.has(host)) continue;
      seen.add(host);
      hosts.push(host);
    }
    return hosts;
  }

  function dimFromElement(el) {
    const nw = el.naturalWidth || 0;
    const nh = el.naturalHeight || 0;
    if (nw > 0 && nh > 0) return { width: nw, height: nh };
    const rect = el.getBoundingClientRect?.();
    if (rect && rect.width > 0 && rect.height > 0) {
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    }
    const attrW = parseInt(el.getAttribute?.("width") || "", 10);
    const attrH = parseInt(el.getAttribute?.("height") || "", 10);
    if (attrW > 0 && attrH > 0) return { width: attrW, height: attrH };
    return { width: null, height: null };
  }

  function parseSrcset(srcset) {
    if (!srcset) return [];
    return srcset
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [url, descriptor = ""] = part.split(/\s+/);
        return { url, descriptor };
      })
      .filter((e) => e.url);
  }

  function bestSrcsetUrl(srcset) {
    const entries = parseSrcset(srcset);
    if (!entries.length) return null;
    let best = entries[0];
    let bestScore = -1;
    for (const entry of entries) {
      const d = String(entry.descriptor || "").toLowerCase();
      let score = 1;
      if (d.endsWith("w")) score = parseFloat(d) || 1;
      else if (d.endsWith("x")) score = (parseFloat(d) || 1) * 10000;
      if (score >= bestScore) {
        bestScore = score;
        best = entry;
      }
    }
    return best.url;
  }

  function extractCssUrls(value) {
    if (!value || value === "none") return [];
    const out = [];
    const re = /url\(\s*(['"]?)([^)"']+)\1\s*\)/gi;
    let match;
    while ((match = re.exec(value))) {
      if (match[2]) out.push(match[2].trim());
    }
    return out;
  }

  function looksSvg(url) {
    if (!url) return false;
    if (url.startsWith("data:image/svg+xml")) return true;
    try {
      const parsed = new URL(url);
      if (/\.svg$/i.test(parsed.pathname)) return true;
      if (/image\/svg\+xml/i.test(parsed.search)) return true;
    } catch {
      return /\.svg(\?|#|$)/i.test(url);
    }
    return false;
  }

  /** SVG href / xlink:href (getAttribute alone often fails for namespaced attrs). */
  function readHref(el) {
    if (!el) return null;
    try {
      if (el.href && typeof el.href === "object" && el.href.baseVal != null) {
        const base = String(el.href.baseVal || "").trim();
        if (base) return base;
      }
    } catch {
      /* ignore */
    }
    return (
      el.getAttribute?.("href") ||
      el.getAttributeNS?.(XLINK_NS, "href") ||
      el.getAttribute?.("xlink:href") ||
      null
    );
  }

  function queryAllDeep(selector, root = document) {
    const out = [];
    const visit = (node) => {
      if (!node?.querySelectorAll) return;
      try {
        out.push(...node.querySelectorAll(selector));
      } catch {
        /* invalid selector in this root */
      }
      let children;
      try {
        children = node.querySelectorAll("*");
      } catch {
        return;
      }
      for (const el of children) {
        if (el.shadowRoot) visit(el.shadowRoot);
      }
    };
    visit(root);
    return out;
  }

  function ensureXmlns(markup) {
    const text = String(markup || "").trim();
    if (!text) return "";
    if (/\sxmlns\s*=/.test(text)) return text;
    return text.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  function hasDrawableMarkup(markup) {
    return /<(path|circle|rect|polygon|polyline|line|ellipse|text|image)\b/i.test(
      String(markup || "")
    );
  }

  function markupToDataUrl(markup) {
    const withNs = ensureXmlns(markup);
    if (!withNs || withNs.length > maxInlineSvgBytes) return null;
    // Require real shapes — bare <use href="#…"> serializes to a blank tile.
    if (!hasDrawableMarkup(withNs)) return null;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withNs)}`;
  }

  function parseViewBox(raw) {
    if (!raw) return null;
    const parts = String(raw).trim().split(/[\s,]+/).map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
    const [, , w, h] = parts;
    if (w <= 0 || h <= 0) return null;
    return { width: w, height: h, viewBox: String(raw).trim() };
  }

  function sanitizeName(value) {
    return String(value || "")
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  function inlineFilename(el, index) {
    const label =
      el.getAttribute?.("aria-label") ||
      el.getAttribute?.("data-icon") ||
      el.getAttribute?.("data-testid") ||
      el.id ||
      el.getAttribute?.("title") ||
      "";
    const base = sanitizeName(label) || `inline-icon-${index}`;
    return base.toLowerCase().endsWith(".svg") ? base : `${base}.svg`;
  }

  function resolveLocalUses(clone, doc) {
    const uses = [...(clone.querySelectorAll?.("use") || [])];
    for (const use of uses) {
      const href = readHref(use);
      if (!href) {
        use.remove();
        continue;
      }
      // External sprite file — leave as-is (may still fail in data URL preview).
      if (!href.startsWith("#")) continue;

      const id = decodeURIComponent(href.slice(1));
      let ref = null;
      try {
        ref = doc.getElementById(id);
      } catch {
        ref = null;
      }
      if (!ref) {
        use.remove();
        continue;
      }

      const ns = "http://www.w3.org/2000/svg";
      const g = doc.createElementNS(ns, "g");
      const x = use.getAttribute("x");
      const y = use.getAttribute("y");
      const transform = use.getAttribute("transform");
      const parts = [];
      if (x || y) parts.push(`translate(${x || 0} ${y || 0})`);
      if (transform) parts.push(transform);
      if (parts.length) g.setAttribute("transform", parts.join(" "));

      const tag = ref.tagName?.toLowerCase?.() || "";
      if (tag === "symbol" || tag === "svg" || tag === "g") {
        for (const child of [...ref.childNodes]) {
          if (child.nodeType === 1) g.appendChild(child.cloneNode(true));
        }
      } else {
        g.appendChild(ref.cloneNode(true));
      }

      // Copy common presentation attrs from <use> onto the group.
      for (const attr of ["fill", "stroke", "stroke-width", "opacity", "class"]) {
        const value = use.getAttribute(attr);
        if (value != null && !g.getAttribute(attr)) g.setAttribute(attr, value);
      }

      use.replaceWith(g);
    }
  }

  function serializeSvgElement(svgEl) {
    try {
      const doc = svgEl.ownerDocument || document;
      const clone = svgEl.cloneNode(true);
      if (!clone.getAttribute("xmlns")) {
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      }
      clone.querySelectorAll?.("script").forEach((node) => node.remove());
      // Inline local <use href="#id"> so the data URL is self-contained.
      resolveLocalUses(clone, doc);
      // Bake currentColor so icons still paint inside <img> previews.
      clone.querySelectorAll?.("[fill='currentColor']").forEach((el) => {
        el.setAttribute("fill", "#111827");
      });
      clone.querySelectorAll?.("[stroke='currentColor']").forEach((el) => {
        el.setAttribute("stroke", "#111827");
      });
      if (clone.getAttribute("fill") === "currentColor") {
        clone.setAttribute("fill", "#111827");
      }
      if (clone.getAttribute("stroke") === "currentColor") {
        clone.setAttribute("stroke", "#111827");
      }

      // Prefer viewBox from a referenced symbol when the host svg lacks one.
      if (!clone.getAttribute("viewBox")) {
        const firstUse = svgEl.querySelector?.("use");
        const href = firstUse ? readHref(firstUse) : null;
        if (href?.startsWith("#")) {
          const ref = doc.getElementById(decodeURIComponent(href.slice(1)));
          const vb = ref?.getAttribute?.("viewBox");
          if (vb) clone.setAttribute("viewBox", vb);
        }
      }

      return new XMLSerializer().serializeToString(clone);
    } catch {
      return null;
    }
  }

  function isSpriteHostOnly(svg, symbolCount) {
    if (!symbolCount) return false;
    // Hidden sprite sheets should not also become a blank tile.
    const style = svg.getAttribute("style") || "";
    const hidden =
      svg.getAttribute("aria-hidden") === "true" ||
      /display\s*:\s*none/i.test(style) ||
      svg.getAttribute("width") === "0" ||
      svg.getAttribute("height") === "0";
    if (hidden) return true;
    // No drawable shapes outside symbol/defs → host-only sprite.
    const probe = svg.cloneNode(true);
    probe.querySelectorAll?.("symbol, defs").forEach((node) => node.remove());
    return !hasDrawableMarkup(new XMLSerializer().serializeToString(probe));
  }

  // --- <img> including lazy + responsive currentSrc ---
  for (const img of queryAllDeep("img")) {
    const dims = dimFromElement(img);
    const urls = new Set();

    if (img.currentSrc) urls.add(img.currentSrc);
    if (img.src) urls.add(img.src);
    for (const attr of [
      "data-src",
      "data-lazy-src",
      "data-original",
      "data-srcset",
      "srcset"
    ]) {
      const value = img.getAttribute(attr);
      if (!value) continue;
      if (attr.endsWith("srcset") || attr === "srcset") {
        const best = bestSrcsetUrl(value);
        if (best) urls.add(best);
        for (const entry of parseSrcset(value)) urls.add(entry.url);
      } else {
        urls.add(value);
      }
    }

    for (const raw of urls) {
      const url = normalize(raw);
      if (!url) continue;
      push(
        {
          url,
          width: dims.width,
          height: dims.height,
          source: "img",
          kindHint: looksSvg(url) ? "icon" : "image",
          fileSize: null
        },
        img
      );
    }
  }

  // --- <picture><source srcset> ---
  for (const source of queryAllDeep("picture source[srcset], source[srcset]")) {
    const best = bestSrcsetUrl(source.getAttribute("srcset"));
    const url = normalize(best);
    if (!url) continue;
    push(
      {
        url,
        width: null,
        height: null,
        source: "picture",
        kindHint: looksSvg(url) ? "icon" : "image",
        fileSize: null
      },
      source.closest("picture") || source
    );
  }

  // --- CSS background-image (sampled) ---
  const bgRoots = queryAllDeep("body *");
  let bgScanned = 0;
  const maxBgScan = options.maxBackgroundScan || 2500;
  for (const el of bgRoots) {
    if (bgScanned >= maxBgScan || candidates.length >= maxCandidates) break;
    bgScanned += 1;
    let styles;
    try {
      styles = getComputedStyle(el);
    } catch {
      continue;
    }
    const urls = [
      ...extractCssUrls(styles.backgroundImage),
      ...extractCssUrls(styles.maskImage || styles.webkitMaskImage)
    ];
    if (!urls.length) continue;
    const rect = el.getBoundingClientRect();
    const width = rect.width > 0 ? Math.round(rect.width) : null;
    const height = rect.height > 0 ? Math.round(rect.height) : null;
    for (const raw of urls) {
      const url = normalize(raw);
      if (!url) continue;
      push(
        {
          url,
          width,
          height,
          source: "background",
          kindHint: looksSvg(url) ? "icon" : "image",
          fileSize: null
        },
        el
      );
    }
  }

  // --- Declared icons / favicons ---
  for (const link of queryAllDeep(
    'link[rel~="icon"], link[rel~="apple-touch-icon"], link[rel~="apple-touch-icon-precomposed"], link[rel="shortcut icon"], link[rel="mask-icon"]'
  )) {
    const url = normalize(link.getAttribute("href"));
    if (!url) continue;
    let width = null;
    let height = null;
    const sizes = (link.getAttribute("sizes") || "").toLowerCase();
    const match = sizes.match(/(\d+)\s*x\s*(\d+)/i);
    if (match) {
      width = parseInt(match[1], 10);
      height = parseInt(match[2], 10);
    }
    const type = (link.getAttribute("type") || "").toLowerCase();
    push(
      {
        url,
        width,
        height,
        source: "link-icon",
        kindHint: "icon",
        format: type.includes("svg") ? "svg" : null,
        fileSize: null
      },
      link
    );
  }

  // --- External SVG via <image>, <object>, <embed>, <use href> ---
  for (const el of queryAllDeep("image, object[data], embed[src]")) {
    const raw =
      readHref(el) ||
      el.getAttribute("data") ||
      el.getAttribute("src");
    const url = normalize(raw);
    if (!url) continue;
    const tag = el.tagName;
    if (!looksSvg(url) && tag !== "OBJECT" && tag !== "EMBED") continue;
    const dims = dimFromElement(el);
    push(
      {
        url,
        width: dims.width,
        height: dims.height,
        source: "object",
        kindHint: "icon",
        fileSize: null
      },
      el
    );
  }

  for (const el of queryAllDeep("use")) {
    const raw = readHref(el);
    if (!raw || raw.startsWith("#")) continue;
    const url = normalize(raw.split("#")[0]);
    if (!url || !looksSvg(url)) continue;
    push(
      {
        url,
        width: null,
        height: null,
        source: "svg-use",
        kindHint: "icon",
        fileSize: null
      },
      el.closest("svg") || el
    );
  }

  // --- Inline <svg> nested in HTML (buttons, links, nav, etc.) ---
  let inlineIndex = 0;
  const rootSvgs = queryAllDeep("svg").filter((el) => !el.parentElement?.closest?.("svg"));
  const exportedSymbolIds = new Set();

  for (const svg of rootSvgs) {
    if (candidates.length >= maxCandidates) break;

    // Sprite sheet: export each <symbol id> as its own icon.
    const symbols = [
      ...svg.querySelectorAll(":scope > symbol[id], :scope > defs > symbol[id]")
    ];
    if (symbols.length) {
      for (const symbol of symbols) {
        if (candidates.length >= maxCandidates) break;
        const id = symbol.getAttribute("id") || "";
        if (id) exportedSymbolIds.add(id);
        const vb =
          symbol.getAttribute("viewBox") ||
          svg.getAttribute("viewBox") ||
          null;
        let inner = "";
        try {
          const symbolClone = symbol.cloneNode(true);
          resolveLocalUses(symbolClone, svg.ownerDocument || document);
          inner = new XMLSerializer().serializeToString(symbolClone);
          inner = inner.replace(/^<symbol\b[^>]*>/i, "").replace(/<\/symbol>$/i, "");
        } catch {
          inner = symbol.innerHTML || "";
        }
        if (!hasDrawableMarkup(inner)) continue;
        const vbAttr = vb ? ` viewBox="${String(vb).replace(/"/g, "&quot;")}"` : "";
        const markup = ensureXmlns(`<svg${vbAttr}>${inner}</svg>`);
        const dataUrl = markupToDataUrl(markup);
        if (!dataUrl) continue;
        const parsed = parseViewBox(vb);
        inlineIndex += 1;
        // Stamp the sprite host and every visible <use> of this symbol so
        // highlight can find the icon where it actually appears on the page.
        const stampTargets = [svg, ...hostsForSymbolId(id)];
        push(
          {
            url: dataUrl,
            width: parsed?.width ?? null,
            height: parsed?.height ?? null,
            viewBox: parsed?.viewBox || vb,
            source: "inline-svg",
            kindHint: "icon",
            format: "svg",
            filename: inlineFilename(symbol, inlineIndex),
            symbolId: id || null,
            fileSize: null
          },
          stampTargets
        );
      }
      if (isSpriteHostOnly(svg, symbols.length)) continue;
    }

    // Skip use-only wrappers that only point at symbols we already exported.
    const uses = [...(svg.querySelectorAll?.(":scope > use") || [])];
    if (
      uses.length &&
      uses.every((use) => {
        const href = readHref(use);
        return href?.startsWith("#") && exportedSymbolIds.has(decodeURIComponent(href.slice(1)));
      }) &&
      !hasDrawableMarkup(
        (() => {
          const probe = svg.cloneNode(true);
          probe.querySelectorAll?.("use").forEach((n) => n.remove());
          return new XMLSerializer().serializeToString(probe);
        })()
      )
    ) {
      continue;
    }

    const markup = serializeSvgElement(svg);
    const dataUrl = markupToDataUrl(markup);
    if (!dataUrl) continue;

    const vb =
      parseViewBox(svg.getAttribute("viewBox")) ||
      (() => {
        const use = svg.querySelector?.("use");
        const href = use ? readHref(use) : null;
        if (!href?.startsWith("#")) return null;
        const ref = (svg.ownerDocument || document).getElementById(
          decodeURIComponent(href.slice(1))
        );
        return parseViewBox(ref?.getAttribute?.("viewBox"));
      })();
    const dims = dimFromElement(svg);
    const width = vb?.width ?? dims.width;
    const height = vb?.height ?? dims.height;
    if (width != null && height != null && width <= 5 && height <= 5) continue;

    inlineIndex += 1;
    push(
      {
        url: dataUrl,
        width,
        height,
        viewBox: vb?.viewBox || svg.getAttribute("viewBox") || null,
        source: "inline-svg",
        kindHint: "icon",
        format: "svg",
        filename: inlineFilename(svg, inlineIndex),
        fileSize: null
      },
      svg
    );
  }

  return {
    baseHref,
    candidates,
    candidateCount: candidates.length
  };
};
