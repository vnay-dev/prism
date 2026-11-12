/**
 * Load webfonts into the extension popup so font-card samples paint the
 * detected face.
 *
 * 1) Prefer the page's exact @font-face URLs (CORS-enabled https fonts work
 *    from the extension iframe once font-src allows https:).
 * 2) Optionally fetch bytes in-page and register via FontFace(ArrayBuffer).
 * 3) Fall back to Google Fonts for common families.
 */

import { isSystemFont, normalizeFontKey } from "../core/fontUtils.js";

const requestedGoogleFamilies = new Set();
const injectedPageFaceIds = new Set();
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

function injectPageFaceRule(family, face) {
  const id = `${stylesheetId(family)}-page-${String(face.weight || "400").replace(/\s+/g, "-")}`;
  if (injectedPageFaceIds.has(id) || document.getElementById(id)) {
    injectedPageFaceIds.add(id);
    return;
  }
  const style = document.createElement("style");
  style.id = id;
  const weight = face.weight || "400";
  const fontStyle = face.style || "normal";
  // Exact page file — works when the host sends Access-Control-Allow-Origin
  // (toonify does) and extension CSP allows https fonts.
  style.textContent = `
@font-face {
  font-family: ${JSON.stringify(family)};
  font-style: ${fontStyle};
  font-weight: ${weight};
  font-display: swap;
  src: url(${JSON.stringify(face.url)}) format("woff2");
}
`;
  document.head.appendChild(style);
  injectedPageFaceIds.add(id);
}

function dataUrlToArrayBuffer(dataUrl) {
  const match = String(dataUrl).match(/^data:[^;,]+(;charset=[^;,]+)?;base64,(.+)$/i);
  if (!match) return null;
  try {
    const binary = atob(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  } catch {
    return null;
  }
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
    if (/^data:/i.test(pageFace.url)) {
      const buffer = dataUrlToArrayBuffer(pageFace.url);
      if (!buffer) return false;
      const { min, max } = parseFaceWeight(pageFace.weight);
      const faceWeight =
        weight >= min && weight <= max
          ? weight
          : Math.abs(weight - min) <= Math.abs(weight - max)
            ? min
            : max;
      await registerFontFace(family, buffer, faceWeight, pageFace.style || "normal");
      return isFontPreviewLoaded(family, weight) || isFontPreviewLoaded(family, faceWeight);
    }

    // Fast path: CSS @font-face pointing at the page's https URL.
    injectPageFaceRule(family, pageFace);
    if (await waitForFont(family, weight, family)) return true;

    // Fallback: fetch bytes in the page and register as ArrayBuffer.
    if (typeof fetchFontBytes === "function") {
      const source = await fetchFontBytes(pageFace.url);
      if (!source) return false;
      const { min, max } = parseFaceWeight(pageFace.weight);
      const faceWeight =
        weight >= min && weight <= max
          ? weight
          : Math.abs(weight - min) <= Math.abs(weight - max)
            ? min
            : max;
      await registerFontFace(family, source, faceWeight, pageFace.style || "normal");
      return isFontPreviewLoaded(family, weight) || isFontPreviewLoaded(family, faceWeight);
    }
  } catch {
    return false;
  }

  return false;
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
