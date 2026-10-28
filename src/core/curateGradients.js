/**
 * Curate CSS gradients collected during the page color scan.
 * Gradients are shown as their own category beside Background / Text / Accent.
 */

import { parseCssGradient } from "./paintGradient.js";

const MAX_GRADIENTS = 6;
const MIN_AREA = 6000;
/** Drop near-solid “gradients” (one opaque stop, or all stops the same). */
const MIN_DISTINCT_STOPS = 2;

const GRADIENT_KIND_RE =
  /^(?:repeating-)?(?:linear|radial|conic)-gradient\(/i;

/**
 * Split a CSS background-image value into top-level layers
 * (commas outside parentheses).
 */
export function splitBackgroundImageLayers(value) {
  if (!value || typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return [];

  const layers = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      const part = trimmed.slice(start, i).trim();
      if (part) layers.push(part);
      start = i + 1;
    }
  }
  const last = trimmed.slice(start).trim();
  if (last) layers.push(last);
  return layers;
}

export function isGradientLayer(css) {
  if (!css || typeof css !== "string") return false;
  const value = css.trim();
  if (!GRADIENT_KIND_RE.test(value)) return false;
  if (/^url\(/i.test(value)) return false;
  return true;
}

export function gradientKind(css) {
  const match = String(css || "").trim().match(
    /^(repeating-)?(linear|radial|conic)-gradient/i
  );
  if (!match) return "gradient";
  const repeating = match[1] ? "repeating-" : "";
  return `${repeating}${match[2].toLowerCase()}`;
}

export function normalizeGradientCss(css) {
  return String(css || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Pull color stop tokens in source order for previews / fallback export.
 */
export function extractGradientStops(css) {
  const parsed = parseCssGradient(css);
  if (parsed?.stops?.length) {
    return parsed.stops.map((stop) => stop.color);
  }
  return [];
}

function distinctStopCount(stops) {
  const opaque = (stops || []).filter((s) => !/^transparent$/i.test(s));
  const keys = new Set(opaque.map((s) => s.toLowerCase()));
  return keys.size;
}

function scoreGradient(entry) {
  const area = Number(entry.area) || 0;
  const importance = Number(entry.importance) || 1;
  const stopBonus = Math.min(4, distinctStopCount(entry.stops)) * 0.15;
  return area * Math.max(0.25, importance) * (1 + stopBonus);
}

/**
 * @param {{ css: string, area?: number, importance?: number }[]} samples
 * @returns {{ id: string, css: string, kind: string, stops: string[], area: number }[]}
 */
export function curateGradients(samples, { limit = MAX_GRADIENTS } = {}) {
  const list = Array.isArray(samples) ? samples : [];
  const merged = new Map();

  for (const sample of list) {
    const layers = splitBackgroundImageLayers(sample?.css || sample?.backgroundImage || "");
    const candidates = layers.length
      ? layers
      : sample?.css
        ? [sample.css]
        : [];

    for (const layer of candidates) {
      if (!isGradientLayer(layer)) continue;
      const css = layer.trim();
      const key = normalizeGradientCss(css);
      if (!key) continue;

      const stops = extractGradientStops(css);
      if (distinctStopCount(stops) < MIN_DISTINCT_STOPS) continue;

      const area = Number(sample.area) || 0;
      const importance = Number(sample.importance) || 1;
      const existing = merged.get(key);
      if (existing) {
        existing.area += area;
        existing.importance = Math.max(existing.importance, importance);
        continue;
      }
      merged.set(key, {
        css,
        kind: gradientKind(css),
        stops,
        area,
        importance
      });
    }
  }

  const ranked = [...merged.values()]
    .filter((entry) => entry.area >= MIN_AREA || entry.importance >= 40)
    .sort((a, b) => scoreGradient(b) - scoreGradient(a) || b.area - a.area)
    .slice(0, Math.max(0, limit));

  return ranked.map((entry, index) => ({
    id: `grad-${index + 1}`,
    css: entry.css,
    kind: entry.kind,
    stops: entry.stops,
    area: Math.round(entry.area)
  }));
}
