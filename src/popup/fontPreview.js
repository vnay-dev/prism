/**
 * Load webfonts into the extension popup so font-card samples paint the
 * detected face.
 *
 * 1) Register page @font-face bytes via FontFace(ArrayBuffer) — fetched in
 *    the page context (or decoded from a small data: URL). No CSS injection,
 *    so extension CSP does not need 'unsafe-inline' or broad https: font-src.
 * 2) Fall back to Google Fonts for common families.
 */

import { isSystemFont, normalizeFontKey } from "../core/fontUtils.js";

/** Max font file size for preview (ArrayBuffer / data: harvest). */
export const MAX_FONT_PREVIEW_BYTES = 2 * 1024 * 1024;

const requestedGoogleFamilies = new Set();
const loadingKeys = new Map();

function stylesheetId(family) {
  const slug = String(family)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `prism-font-preview-${slug || "family"}`;
}

function googleFontsFamilyParam(family) {
  return String(family)
    .trim()
    .split(/\s+/)
    .map((part) => encodeURIComponent(part))
    .join("+");
}

const DETECT_BASELINES = ["monospace", "sans-serif", "serif"];
const DETECT_STRING = "mmmmmmmmmmlliWWWaaaggg0123456789";
let detectCtx = null;

function getDetectCtx() {
  if (detectCtx) return detectCtx;
  try {
    detectCtx = document.createElement("canvas").getContext("2d");
  } catch {
    detectCtx = null;
  }
  return detectCtx;
}

/**
 * Whether `family` actually renders at `weight` in this document.
 * NOTE: document.fonts.check() returns true for unknown families (nothing to
 * load), so it cannot be used as a "is this font available" test.
 */
export function isFontPreviewLoaded(family, weight = 400) {
  const ctx = getDetectCtx();
  if (!ctx) return false;
  const escaped = String(family).replace(/(['"\\])/g, "\\$1");
  for (const base of DETECT_BASELINES) {
    ctx.font = `${weight} 72px ${base}`;
    const baseWidth = ctx.measureText(DETECT_STRING).width;
    ctx.font = `${weight} 72px "${escaped}", ${base}`;
    if (ctx.measureText(DETECT_STRING).width !== baseWidth) return true;
  }
  return false;
}

function ensureGoogleStylesheet(family) {
  const id = stylesheetId(family);
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  const familyParam = googleFontsFamilyParam(family);
  link.href =
    `https://fonts.googleapis.com/css2?family=${familyParam}` +
    `:wght@100;200;300;400;500;600;700;800;900&display=swap`;
  document.head.appendChild(link);
}

function parseFaceWeight(weightRaw) {
  if (weightRaw == null || weightRaw === "") return { min: 400, max: 400 };
  const value = String(weightRaw).trim().toLowerCase();
  if (value === "normal") return { min: 400, max: 400 };
  if (value === "bold") return { min: 700, max: 700 };
  const parts = value
    .split(/\s+/)
    .map((part) => parseInt(part, 10))
    .filter((n) => Number.isFinite(n));
  if (!parts.length) return { min: 400, max: 400 };
  return { min: Math.min(...parts), max: Math.max(...parts) };
}

function coversBasicLatin(unicodeRange) {
  if (!unicodeRange || !String(unicodeRange).trim()) return true;
  const compact = String(unicodeRange).replace(/\s+/g, "");
  return /U\+0+-0*FF|U\+00+-00FF|U\+0+-FF|U\+00+-7[Ff]|U\+0+-7[Ff]|U\+20+-7[Ee]|U\+0020+-007[Ee]/i.test(
    compact
  );
}

/**
 * Approximate decoded byte length of a data: URL (base64 or raw).
 * Used to skip oversized inlined fonts during harvest / preview.
 */
export function estimateDataUrlBytes(dataUrl) {
  const raw = String(dataUrl || "");
  const match = raw.match(/^data:[^;,]+(;charset=[^;,]+)?(;base64)?,(.*)$/i);
  if (!match) return Infinity;
  const payload = match[3] || "";
  if (match[2]) {
    const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
  }
  try {
    return decodeURIComponent(payload).length;
  } catch {
    return payload.length;
  }
}

/**
 * Pick the best page @font-face descriptor for a preview sample.
 */
export function pickBestPageFontFace(pageFaces, family, targetWeight = 400) {
  if (!Array.isArray(pageFaces) || !pageFaces.length || !family) return null;
  const key = normalizeFontKey(family);
  const candidates = pageFaces.filter(
    (face) => normalizeFontKey(face?.family) === key && face?.url
  );
  if (!candidates.length) return null;

  const target = Number(targetWeight) || 400;
  let best = null;
  let bestScore = -Infinity;

  for (const face of candidates) {
    const { min, max } = parseFaceWeight(face.weight);
    const weightDist =
      target < min ? min - target : target > max ? target - max : 0;
    const latin = coversBasicLatin(face.unicodeRange);
    const isWoff2 = /\.woff2(\?|$)/i.test(face.url) || /^data:.*woff2/i.test(face.url);
    const score =
      (latin ? 1000 : 0) +
      (isWoff2 ? 50 : 0) +
      Math.max(0, 200 - weightDist);
    if (score > bestScore) {
      bestScore = score;
      best = face;
    }
  }
  return best;
}

function dataUrlToArrayBuffer(dataUrl) {
  if (estimateDataUrlBytes(dataUrl) > MAX_FONT_PREVIEW_BYTES) return null;
  const match = String(dataUrl).match(/^data:[^;,]+(;charset=[^;,]+)?;base64,(.+)$/i);
  if (!match) return null;
  try {
    const binary = atob(match[2]);
    if (binary.length > MAX_FONT_PREVIEW_BYTES) return null;
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  } catch {
    return null;
  }
}

function resolveFaceWeight(pageFace, weight) {
  const { min, max } = parseFaceWeight(pageFace.weight);
  if (weight >= min && weight <= max) return weight;
  return Math.abs(weight - min) <= Math.abs(weight - max) ? min : max;
}

async function registerFontFace(family, source, weight, style = "normal") {
  const face = new FontFace(family, source, {
    weight: String(weight || 400),
    style: style || "normal",
    display: "swap"
  });
  await face.load();
  document.fonts.add(face);
  return true;
}

async function waitForFont(family, weight, sampleText = "Aa") {
  try {
    await Promise.race([
      document.fonts.load(`${weight} 16px "${family}"`, sampleText),
      new Promise((resolve) => setTimeout(resolve, 2500))
    ]);
  } catch {
    /* ignore */
  }
  return isFontPreviewLoaded(family, weight);
}

async function loadFromPageFace(family, weight, pageFace, fetchFontBytes) {
  if (!pageFace?.url) return false;

  try {
    const faceWeight = resolveFaceWeight(pageFace, weight);
    let source = null;

    if (/^data:/i.test(pageFace.url)) {
      source = dataUrlToArrayBuffer(pageFace.url);
    } else if (typeof fetchFontBytes === "function") {
      source = await fetchFontBytes(pageFace.url);
    }

    if (!source) return false;
    if (source.byteLength > MAX_FONT_PREVIEW_BYTES) return false;

    await registerFontFace(family, source, faceWeight, pageFace.style || "normal");
    return isFontPreviewLoaded(family, weight) || isFontPreviewLoaded(family, faceWeight);
  } catch {
    return false;
  }
}

async function loadFromGoogleFonts(family, weight) {
  const key = family.toLowerCase();
  if (!requestedGoogleFamilies.has(key)) {
    requestedGoogleFamilies.add(key);
    ensureGoogleStylesheet(family);
  }
  return waitForFont(family, weight, family);
}

/**
 * Ensure `family` is available for popup preview at `weight`.
 * @param {object} [options]
 * @param {Array} [options.pageFaces] font face descriptors from extraction
 * @param {(url: string) => Promise<ArrayBuffer|null>} [options.fetchFontBytes]
 */
export async function ensureFontPreviewLoaded(family, weight = 400, options = {}) {
  if (!family || typeof family !== "string") return false;
  const trimmed = family.trim();
  if (!trimmed) return false;
  const sampleWeight = Number(weight) || 400;

  if (isFontPreviewLoaded(trimmed, sampleWeight)) return true;
  if (isSystemFont(trimmed)) return isFontPreviewLoaded(trimmed, sampleWeight);

  const cacheKey = `${normalizeFontKey(trimmed)}|${sampleWeight}`;
  if (loadingKeys.has(cacheKey)) return loadingKeys.get(cacheKey);

  const task = (async () => {
    try {
      const pageFace = pickBestPageFontFace(options.pageFaces, trimmed, sampleWeight);
      if (pageFace) {
        const ok = await loadFromPageFace(
          trimmed,
          sampleWeight,
          pageFace,
          options.fetchFontBytes
        );
        if (ok) return true;
      }
    } catch {
      /* fall through to Google Fonts */
    }
    try {
      return await loadFromGoogleFonts(trimmed, sampleWeight);
    } catch {
      return false;
    }
  })();

  loadingKeys.set(cacheKey, task);
  try {
    return await task;
  } finally {
    loadingKeys.delete(cacheKey);
  }
}
