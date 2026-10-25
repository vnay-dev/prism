import {
  createAssetRecord,
  dedupeAssetsBy,
  isLikelySvgUrl,
  isSupportedDirectAssetUrl,
  isTinyDecorativeAsset,
  normalizeAssetUrl
} from "./assetUtils.js";
import {
  dataUrlToSvgMarkup,
  svgContentFingerprint,
  svgMarkupHasDrawableContent
} from "./inlineSvg.js";

/**
 * Curate downloadable icon assets (external URLs only — no inline SVG export).
 * Prioritizes external SVG files, then declared favicons / touch icons.
 * Collapses duplicates by symbol id, SVG content, or URL.
 */
export function curateIcons(rawCandidates = [], { baseHref = "https://example.com/" } = {}) {
  const prepared = [];

  for (const raw of rawCandidates) {
    if (!raw) continue;

    const normalizedUrl = normalizeAssetUrl(raw.url, baseHref);
    if (!normalizedUrl) continue;
    if (!isSupportedDirectAssetUrl(normalizedUrl) && !isLikelySvgUrl(normalizedUrl)) continue;

    // Drop inline SVG data URLs that would preview as blank tiles.
    if (normalizedUrl.startsWith("data:image/svg+xml")) {
      const markup = dataUrlToSvgMarkup(normalizedUrl);
      if (!markup || !svgMarkupHasDrawableContent(markup)) continue;
    }

    const isSvg = isLikelySvgUrl(normalizedUrl);
    const isIconHint =
      raw.kind === "icon" ||
      raw.kindHint === "icon" ||
      raw.source === "link-icon" ||
      raw.source === "favicon" ||
      raw.source === "inline-svg" ||
      raw.source === "svg-use" ||
      raw.source === "object";

    // Icons tab: SVG URLs + explicitly icon-like sources. Skip large content
    // photos that happen to appear in an <img>.
    if (!isSvg && !isIconHint) continue;
    if (normalizedUrl.startsWith("data:") && !isSvg && !isIconHint) continue;

    const width = finiteOrNull(raw.width);
    const height = finiteOrNull(raw.height);
    // Allow small favicons; only drop true tracking pixels.
    if (width != null && height != null && width <= 5 && height <= 5) continue;
    if (!isSvg && !isIconHint && isTinyDecorativeAsset({ width, height })) continue;

    prepared.push(
      createAssetRecord({
        url: normalizedUrl,
        normalizedUrl,
        kind: "icon",
        format: raw.format || (isSvg ? "svg" : null),
        filename: raw.filename || null,
        width,
        height,
        fileSize: finiteOrNull(raw.fileSize),
        viewBox: raw.viewBox || null,
        source: raw.source || "unknown",
        symbolId: raw.symbolId || null,
        domIds: raw.domIds || []
      })
    );
  }

  const unique = dedupeAssetsBy(prepared, iconDedupeKey);
  unique.sort((a, b) => scoreIcon(b) - scoreIcon(a));
  return unique;
}

/** Prefer symbol id, then drawable SVG content, then exact URL. */
function iconDedupeKey(asset) {
  if (asset?.symbolId) return `symbol:${asset.symbolId}`;
  const fingerprint = svgContentFingerprint(asset?.url || asset?.normalizedUrl);
  if (fingerprint) return `svg:${fingerprint}`;
  const url = asset?.normalizedUrl || asset?.url;
  return url ? `url:${url}` : null;
}

function scoreIcon(asset) {
  let score = 0;
  if (asset.format === "svg") score += 100;
  if (asset.source === "inline-svg") score += 70;
  if (asset.source === "link-icon") score += 40;
  if (asset.source === "favicon") score += 20;
  if (asset.source === "img" && asset.format === "svg") score += 50;
  if (Number.isFinite(asset.width) && Number.isFinite(asset.height)) {
    score += Math.min(asset.width, 512) / 10;
  }
  return score;
}

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function isIconListEmpty(icons) {
  return !Array.isArray(icons) || icons.length === 0;
}
