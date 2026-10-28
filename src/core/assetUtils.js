/**
 * Shared helpers for image/icon URL discovery, dedupe, format/filename, and
 * metadata display. Pure functions — safe to unit test without a DOM.
 */

export const IMAGE_EXTENSIONS = Object.freeze([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "avif",
  "bmp",
  "ico",
  "tif",
  "tiff",
  "svg"
]);

export const ICON_EXTENSIONS = Object.freeze(["svg", "ico", "png", "webp", "gif", "jpg", "jpeg"]);

/** Decorative / tracking assets at or below this edge are excluded by default. */
export const MIN_MEANINGFUL_EDGE = 16;

const EXT_TO_FORMAT = Object.freeze({
  png: "png",
  jpg: "jpeg",
  jpeg: "jpeg",
  webp: "webp",
  gif: "gif",
  avif: "avif",
  bmp: "bmp",
  ico: "ico",
  tif: "tiff",
  tiff: "tiff",
  svg: "svg"
});

const MIME_TO_FORMAT = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "image/svg+xml": "svg",
  "image/tiff": "tiff"
});

/**
 * Resolve and normalize a candidate URL for dedupe / download.
 * Strips hash fragments; keeps query (CDNs often encode size there).
 */
export function normalizeAssetUrl(raw, baseHref = "https://example.com/") {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text || text === "about:blank") return null;
  if (/^javascript:/i.test(text) || /^vbscript:/i.test(text)) return null;

  try {
    const url = new URL(text, baseHref);
    if (!["http:", "https:", "data:", "blob:"].includes(url.protocol)) return null;
    url.hash = "";
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
    return url.href;
  } catch {
    return null;
  }
}

export function extensionFromPath(pathname = "") {
  const match = String(pathname).toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  return match ? match[1] : "";
}

export function formatFromExtension(ext) {
  return EXT_TO_FORMAT[String(ext || "").toLowerCase()] || null;
}

export function formatFromMime(mime) {
  if (!mime || typeof mime !== "string") return null;
  const key = mime.split(";")[0].trim().toLowerCase();
  return MIME_TO_FORMAT[key] || null;
}

export function guessFormatFromUrl(url) {
  if (!url) return null;
  if (url.startsWith("data:")) {
    const mime = url.slice(5).split(";")[0] || "";
    return formatFromMime(mime) || (mime.startsWith("image/") ? mime.slice(6) : null);
  }
  try {
    const parsed = new URL(url);
    const fromPath = formatFromExtension(extensionFromPath(parsed.pathname));
    if (fromPath) return fromPath;
    // Some CDNs put the format in a query param.
    for (const key of ["format", "fm", "ext", "type"]) {
      const value = parsed.searchParams.get(key);
      const fmt = formatFromExtension(value) || formatFromMime(value);
      if (fmt) return fmt;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function isLikelyImageUrl(url) {
  if (!url) return false;
  if (url.startsWith("data:image/")) return true;
  if (url.startsWith("blob:")) return true;
  const format = guessFormatFromUrl(url);
  return Boolean(format && format !== "svg");
}

export function isLikelySvgUrl(url) {
  if (!url) return false;
  if (url.startsWith("data:image/svg+xml")) return true;
  return guessFormatFromUrl(url) === "svg";
}

export function isSupportedDirectAssetUrl(url) {
  if (!url) return false;
  if (url.startsWith("data:image/")) return true;
  if (url.startsWith("blob:")) return true;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  } catch {
    return false;
  }
  const format = guessFormatFromUrl(url);
  return Boolean(format);
}

/**
 * Prefer the original basename from the URL; otherwise synthesize one.
 */
export function filenameFromUrl(url, { format = null, fallbackBase = "asset" } = {}) {
  const fmt = format || guessFormatFromUrl(url) || "bin";
  const ext = fmt === "jpeg" ? "jpg" : fmt;

  if (!url) return `${fallbackBase}.${ext}`;

  if (url.startsWith("data:")) {
    return `${fallbackBase}.${ext}`;
  }

  try {
    const parsed = new URL(url);
    const segment = decodedPathBasename(parsed.pathname);
    if (segment) {
      const cleaned = sanitizeFilename(segment);
      if (cleaned) {
        if (/\.[a-z0-9]{2,5}$/i.test(cleaned)) return cleaned;
        return `${cleaned}.${ext}`;
      }
    }
  } catch {
    /* fall through */
  }

  return `${fallbackBase}.${ext}`;
}

function decodedPathBasename(pathname) {
  const parts = String(pathname || "")
    .split("/")
    .filter(Boolean);
  if (!parts.length) return "";
  try {
    return decodeURIComponent(parts[parts.length - 1]);
  } catch {
    return parts[parts.length - 1];
  }
}

export function sanitizeFilename(name) {
  return String(name || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

/**
 * Tiny tracking / decorative pixels. Unknown dimensions are kept
 * (do not treat missing as zero).
 */
export function isTinyDecorativeAsset({ width = null, height = null } = {}) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  if (width <= 0 || height <= 0) return false;
  if (width <= 5 && height <= 5) return true;
  if (width < MIN_MEANINGFUL_EDGE && height < MIN_MEANINGFUL_EDGE) return true;
  return false;
}

export function formatFileSize(bytes) {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDimensions(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return `${Math.round(width)} × ${Math.round(height)}`;
}

export function formatLabel(format) {
  if (!format) return "Unknown";
  return String(format).toUpperCase();
}

/**
 * Deduplicate by normalized URL, keeping the richer metadata record.
 */
export function dedupeAssets(assets) {
  return dedupeAssetsBy(assets, (asset) => asset?.normalizedUrl || asset?.url || null);
}

/**
 * Deduplicate with a custom key, keeping the richer metadata record and
 * merging domIds so highlight can still find every on-page instance.
 */
export function dedupeAssetsBy(assets, getKey) {
  const byKey = new Map();
  for (const asset of assets || []) {
    const key = getKey?.(asset);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, asset);
      continue;
    }
    byKey.set(key, mergeAssetRecords(existing, asset));
  }
  return [...byKey.values()];
}

function mergeAssetRecords(a, b) {
  const preferB =
    (Number.isFinite(b.width) && b.width > 0 && !(Number.isFinite(a.width) && a.width > 0)) ||
    sourceRank(b.source) > sourceRank(a.source);

  const primary = preferB ? b : a;
  const secondary = preferB ? a : b;

  return {
    ...secondary,
    ...primary,
    url: primary.url || secondary.url,
    normalizedUrl: primary.normalizedUrl || secondary.normalizedUrl,
    format:
      primary.format && primary.format !== "unknown"
        ? primary.format
        : secondary.format,
    filename: primary.filename || secondary.filename,
    width: pickKnownNumber(primary.width, secondary.width),
    height: pickKnownNumber(primary.height, secondary.height),
    fileSize: pickKnownNumber(primary.fileSize, secondary.fileSize),
    viewBox: primary.viewBox || secondary.viewBox,
    source: primary.source || secondary.source,
    kind: primary.kind || secondary.kind,
    symbolId: primary.symbolId || secondary.symbolId || null,
    domIds: [
      ...new Set([...(primary.domIds || []), ...(secondary.domIds || [])].filter(Boolean))
    ]
  };
}

function sourceRank(source) {
  switch (source) {
    case "img":
      return 50;
    case "srcset":
    case "picture":
      return 40;
    case "link-icon":
      return 35;
    case "object":
    case "svg-use":
      return 30;
    case "favicon":
      return 20;
    case "background":
      return 10;
    default:
      return 0;
  }
}

function pickKnownNumber(a, b) {
  if (Number.isFinite(a) && a > 0) return a;
  if (Number.isFinite(b) && b > 0) return b;
  return null;
}

/**
 * Parse CSS background-image / mask-image value lists into url(...) strings.
 */
export function extractCssImageUrls(cssValue) {
  if (!cssValue || typeof cssValue !== "string") return [];
  if (cssValue === "none") return [];
  const urls = [];
  const re = /url\(\s*(['"]?)([^)"']+)\1\s*\)/gi;
  let match;
  while ((match = re.exec(cssValue))) {
    const candidate = match[2].trim();
    if (candidate) urls.push(candidate);
  }
  return urls;
}

/**
 * Parse srcset into { url, descriptor } entries (largest width/density preferred upstream).
 */
export function parseSrcset(srcset) {
  if (!srcset || typeof srcset !== "string") return [];
  return srcset
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [url, descriptor = ""] = part.split(/\s+/);
      return { url, descriptor };
    })
    .filter((entry) => entry.url);
}

export function preferredSrcsetUrl(srcset) {
  const entries = parseSrcset(srcset);
  if (!entries.length) return null;

  let best = entries[0];
  let bestScore = -1;
  for (const entry of entries) {
    const score = srcsetDescriptorScore(entry.descriptor);
    if (score >= bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return best.url;
}

function srcsetDescriptorScore(descriptor) {
  const text = String(descriptor || "").trim().toLowerCase();
  if (!text) return 1;
  if (text.endsWith("w")) {
    const w = parseFloat(text);
    return Number.isFinite(w) ? w : 1;
  }
  if (text.endsWith("x")) {
    const x = parseFloat(text);
    return Number.isFinite(x) ? x * 10000 : 1;
  }
  return 1;
}

export function createAssetRecord({
  url,
  normalizedUrl = url,
  kind = "image",
  format = null,
  filename = null,
  width = null,
  height = null,
  fileSize = null,
  viewBox = null,
  source = "unknown",
  domIds = null,
  symbolId = null
} = {}) {
  const resolvedFormat = format || guessFormatFromUrl(url) || "unknown";
  return {
    id: `${kind}:${normalizedUrl || url}`,
    url,
    normalizedUrl: normalizedUrl || url,
    kind,
    format: resolvedFormat,
    filename: filename || filenameFromUrl(url, { format: resolvedFormat, fallbackBase: kind }),
    width: Number.isFinite(width) && width > 0 ? width : null,
    height: Number.isFinite(height) && height > 0 ? height : null,
    fileSize: Number.isFinite(fileSize) && fileSize > 0 ? fileSize : null,
    viewBox: viewBox || null,
    source,
    symbolId: symbolId ? String(symbolId) : null,
    domIds: Array.isArray(domIds) ? [...new Set(domIds.filter(Boolean))] : []
  };
}
