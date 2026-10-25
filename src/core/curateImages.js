import {
  createAssetRecord,
  dedupeAssets,
  isLikelySvgUrl,
  isSupportedDirectAssetUrl,
  isTinyDecorativeAsset,
  normalizeAssetUrl
} from "./assetUtils.js";

/**
 * Curate downloadable raster image candidates from a page scan.
 * Prefers direct http(s)/data image URLs. SVG files belong on the Icons tab.
 */
export function curateImages(rawCandidates = [], { baseHref = "https://example.com/" } = {}) {
  const prepared = [];

  for (const raw of rawCandidates) {
    if (!raw) continue;
    if (raw.kind === "icon" || raw.kindHint === "icon") continue;

    const normalizedUrl = normalizeAssetUrl(raw.url, baseHref);
    if (!normalizedUrl) continue;
    if (!isSupportedDirectAssetUrl(normalizedUrl)) continue;
    if (isLikelySvgUrl(normalizedUrl)) continue;

    const width = finiteOrNull(raw.width);
    const height = finiteOrNull(raw.height);
    if (isTinyDecorativeAsset({ width, height })) continue;

    prepared.push(
      createAssetRecord({
        url: normalizedUrl,
        normalizedUrl,
        kind: "image",
        format: raw.format || null,
        filename: raw.filename || null,
        width,
        height,
        fileSize: finiteOrNull(raw.fileSize),
        source: raw.source || "unknown",
        domIds: raw.domIds || []
      })
    );
  }

  const unique = dedupeAssets(prepared);
  unique.sort((a, b) => scoreImage(b) - scoreImage(a));
  return unique;
}

function scoreImage(asset) {
  const area =
    Number.isFinite(asset.width) && Number.isFinite(asset.height)
      ? asset.width * asset.height
      : 0;
  const sourceBoost =
    asset.source === "img"
      ? 30
      : asset.source === "srcset" || asset.source === "picture"
        ? 20
        : asset.source === "background"
          ? 5
          : 0;
  return area / 1000 + sourceBoost;
}

function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function isImageListEmpty(images) {
  return !Array.isArray(images) || images.length === 0;
}
