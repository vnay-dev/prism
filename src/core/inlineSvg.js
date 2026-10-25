/**
 * Helpers for turning inline <svg> markup into downloadable SVG data URLs.
 * Pure string utilities — the DOM walk lives in extractAssets.js.
 */

export function ensureSvgXmlns(markup) {
  const text = String(markup || "").trim();
  if (!text) return "";
  if (/\sxmlns\s*=/.test(text)) return text;
  return text.replace(
    /<svg\b/i,
    '<svg xmlns="http://www.w3.org/2000/svg"'
  );
}

export function svgMarkupToDataUrl(markup) {
  const withNs = ensureSvgXmlns(markup);
  if (!withNs) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withNs)}`;
}

export function parseViewBox(viewBox) {
  if (!viewBox || typeof viewBox !== "string") return null;
  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [, , w, h] = parts;
  if (w <= 0 || h <= 0) return null;
  return { width: w, height: h, viewBox: viewBox.trim() };
}

export function buildSymbolSvgMarkup(symbolInnerMarkup, { viewBox = null, id = "" } = {}) {
  const vb = viewBox ? ` viewBox="${escapeXmlAttr(viewBox)}"` : "";
  const inner = String(symbolInnerMarkup || "").trim();
  if (!inner) return null;
  return ensureSvgXmlns(`<svg${vb}>${inner}</svg>`);
}

export function inlineSvgFilename({ id = "", label = "", index = 1 } = {}) {
  const base =
    sanitize(label) ||
    sanitize(id) ||
    `inline-icon-${index}`;
  return base.toLowerCase().endsWith(".svg") ? base : `${base}.svg`;
}

function sanitize(value) {
  return String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function escapeXmlAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/** Loose check used for quick rejects. */
export function svgMarkupHasContent(markup) {
  return svgMarkupHasDrawableContent(markup);
}

/**
 * True when markup has real drawable shapes. Bare <use>/<g>/<defs> alone
 * often serialize to blank previews once sprite references are gone.
 */
export function svgMarkupHasDrawableContent(markup) {
  const text = String(markup || "");
  return /<(path|circle|rect|polygon|polyline|line|ellipse|text|image)\b/i.test(text);
}

/** Decode a data:image/svg+xml URL back to markup when possible. */
export function dataUrlToSvgMarkup(url) {
  if (!url || typeof url !== "string" || !url.startsWith("data:image/svg+xml")) {
    return null;
  }
  try {
    const comma = url.indexOf(",");
    if (comma < 0) return null;
    const meta = url.slice(5, comma);
    const payload = url.slice(comma + 1);
    if (/;base64/i.test(meta)) {
      return null;
    }
    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

/**
 * Stable fingerprint for SVG data URLs so visually identical icons with
 * different wrapper attrs / whitespace collapse during dedupe.
 */
export function svgContentFingerprint(url) {
  const markup = dataUrlToSvgMarkup(url);
  if (!markup) return null;
  return normalizeSvgFingerprint(markup);
}

export function normalizeSvgFingerprint(markup) {
  return String(markup || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<svg\b([^>]*)>/gi, (_, attrs) => {
      const cleaned = String(attrs)
        .replace(
          /\s+(?:id|class|data-[\w-]+|aria-[\w-]+|role|focusable|tabindex|style|width|height)=("[^"]*"|'[^']*')/gi,
          ""
        )
        .trim();
      return cleaned ? `<svg ${cleaned}>` : "<svg>";
    })
    .replace(/\s+/g, " ")
    .replace(/\s*=\s*/g, "=")
    .trim()
    .toLowerCase();
}
