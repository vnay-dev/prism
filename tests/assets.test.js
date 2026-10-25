import test from "node:test";
import assert from "node:assert/strict";
import {
  createAssetRecord,
  dedupeAssets,
  filenameFromUrl,
  formatDimensions,
  formatFileSize,
  guessFormatFromUrl,
  isLikelySvgUrl,
  isSupportedDirectAssetUrl,
  isTinyDecorativeAsset,
  normalizeAssetUrl,
  preferredSrcsetUrl
} from "../src/core/assetUtils.js";
import { curateImages } from "../src/core/curateImages.js";
import { curateIcons } from "../src/core/curateIcons.js";
import {
  buildSymbolSvgMarkup,
  dataUrlToSvgMarkup,
  inlineSvgFilename,
  svgContentFingerprint,
  svgMarkupHasContent,
  svgMarkupHasDrawableContent,
  svgMarkupToDataUrl
} from "../src/core/inlineSvg.js";
import {
  buildDownloadFilename,
  downloadErrorMessage,
  uniqueZipEntryNames
} from "../src/popup/downloadAsset.js";
import { buildZipStore, crc32 } from "../src/core/zipStore.js";
import {
  applyAssetsSuccess,
  canReuseRawAssets,
  createGenerationState,
  hasResultsForMode,
  isAssetMode,
  resetMode,
  serializeGenerationCache,
  restoreGenerationCache
} from "../src/popup/generationController.js";

test("normalizeAssetUrl resolves relative URLs and strips hashes", () => {
  assert.equal(
    normalizeAssetUrl("/img/hero.png#section", "https://example.com/page"),
    "https://example.com/img/hero.png"
  );
  assert.equal(normalizeAssetUrl("javascript:alert(1)"), null);
  assert.equal(normalizeAssetUrl(""), null);
});

test("direct image and SVG URL detection", () => {
  assert.equal(isSupportedDirectAssetUrl("https://cdn.example.com/a.webp"), true);
  assert.equal(isSupportedDirectAssetUrl("https://cdn.example.com/logo.svg"), true);
  assert.equal(isSupportedDirectAssetUrl("https://cdn.example.com/file.pdf"), false);
  assert.equal(isLikelySvgUrl("https://cdn.example.com/icon.svg?v=2"), true);
  assert.equal(guessFormatFromUrl("https://x.com/photo.JPEG"), "jpeg");
  assert.equal(guessFormatFromUrl("data:image/png;base64,abc"), "png");
});

test("filenameFromUrl preserves original basename and extension", () => {
  assert.equal(
    filenameFromUrl("https://cdn.example.com/assets/brand-mark.png?w=800"),
    "brand-mark.png"
  );
  assert.equal(
    filenameFromUrl("https://cdn.example.com/", { format: "webp", fallbackBase: "image" }),
    "image.webp"
  );
  assert.equal(
    filenameFromUrl("https://cdn.example.com/vector.svg"),
    "vector.svg"
  );
});

test("dedupeAssets collapses duplicate normalized URLs", () => {
  const urlA = normalizeAssetUrl("https://example.com/a.png#frag");
  const urlB = normalizeAssetUrl("https://example.com/b.jpg");
  const merged = dedupeAssets([
    createAssetRecord({
      url: urlA,
      normalizedUrl: urlA,
      width: null,
      height: null,
      source: "background"
    }),
    createAssetRecord({
      url: urlA,
      normalizedUrl: urlA,
      width: 800,
      height: 600,
      source: "img"
    }),
    createAssetRecord({
      url: urlB,
      normalizedUrl: urlB,
      width: 100,
      height: 100,
      source: "img"
    })
  ]);

  assert.equal(merged.length, 2);
  const png = merged.find((a) => a.url.includes("a.png"));
  assert.equal(png.width, 800);
  assert.equal(png.height, 600);
  assert.equal(png.source, "img");
});
test("missing dimensions and file sizes stay unavailable (not zero)", () => {
  const asset = createAssetRecord({
    url: "https://example.com/photo.webp",
    width: null,
    height: undefined,
    fileSize: null
  });
  assert.equal(asset.width, null);
  assert.equal(asset.height, null);
  assert.equal(asset.fileSize, null);
  assert.equal(formatDimensions(asset.width, asset.height), null);
  assert.equal(formatFileSize(asset.fileSize), null);
  assert.equal(formatFileSize(0), null);
  assert.equal(formatDimensions(0, 0), null);
});

test("tiny decorative images are excluded by default", () => {
  assert.equal(isTinyDecorativeAsset({ width: 1, height: 1 }), true);
  assert.equal(isTinyDecorativeAsset({ width: 12, height: 12 }), true);
  assert.equal(isTinyDecorativeAsset({ width: 64, height: 64 }), false);
  assert.equal(isTinyDecorativeAsset({ width: null, height: null }), false);
});

test("curateImages keeps direct rasters, drops SVG and duplicates", () => {
  const result = curateImages(
    [
      {
        url: "https://cdn.example.com/hero.png",
        width: 1200,
        height: 800,
        source: "img",
        kindHint: "image"
      },
      {
        url: "https://cdn.example.com/hero.png",
        width: 1200,
        height: 800,
        source: "background",
        kindHint: "image"
      },
      {
        url: "https://cdn.example.com/pixel.gif",
        width: 1,
        height: 1,
        source: "img",
        kindHint: "image"
      },
      {
        url: "https://cdn.example.com/logo.svg",
        width: 64,
        height: 64,
        source: "img",
        kindHint: "icon"
      },
      {
        url: "https://cdn.example.com/doc.pdf",
        width: 100,
        height: 100,
        source: "img",
        kindHint: "image"
      }
    ],
    { baseHref: "https://example.com/" }
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].format, "png");
  assert.equal(result[0].filename, "hero.png");
});

test("curateIcons prioritizes external SVG and declared favicons", () => {
  const result = curateIcons(
    [
      {
        url: "/icons/mark.svg",
        width: 24,
        height: 24,
        source: "img",
        kindHint: "icon"
      },
      {
        url: "https://example.com/favicon.ico",
        width: 16,
        height: 16,
        source: "favicon",
        kindHint: "icon"
      },
      {
        url: "https://cdn.example.com/photo.jpg",
        width: 900,
        height: 600,
        source: "img",
        kindHint: "image"
      },
      {
        url: "https://cdn.example.com/photo.jpg",
        width: 900,
        height: 600,
        source: "img",
        kindHint: "image"
      }
    ],
    { baseHref: "https://example.com/page" }
  );

  assert.ok(result.some((a) => a.format === "svg"));
  assert.ok(result.some((a) => a.format === "ico" || a.url.endsWith(".ico")));
  assert.ok(!result.some((a) => a.url.includes("photo.jpg")));
  assert.equal(result[0].format, "svg");
});

test("inline SVG markup becomes a downloadable data URL icon", () => {
  const markup = '<svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';
  const dataUrl = svgMarkupToDataUrl(markup);
  assert.ok(dataUrl.startsWith("data:image/svg+xml"));
  assert.ok(svgMarkupHasContent(markup));
  assert.equal(inlineSvgFilename({ id: "SearchIcon", index: 1 }), "SearchIcon.svg");

  const symbolMarkup = buildSymbolSvgMarkup('<path d="M1 1"/>', { viewBox: "0 0 16 16" });
  assert.match(symbolMarkup, /xmlns=/);
  assert.match(symbolMarkup, /viewBox="0 0 16 16"/);

  const curated = curateIcons(
    [
      {
        url: dataUrl,
        width: 24,
        height: 24,
        source: "inline-svg",
        kindHint: "icon",
        format: "svg",
        filename: "nested-icon.svg",
        viewBox: "0 0 24 24"
      }
    ],
    { baseHref: "https://example.com/" }
  );
  assert.equal(curated.length, 1);
  assert.equal(curated[0].format, "svg");
  assert.equal(curated[0].filename, "nested-icon.svg");
  assert.equal(curated[0].source, "inline-svg");
});

test("curateIcons collapses duplicate inline SVGs and shared symbol ids", () => {
  const path = '<path d="M0 0h24v24H0z"/>';
  const a = svgMarkupToDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" class="icon-a" width="24" height="24" viewBox="0 0 24 24">${path}</svg>`
  );
  const b = svgMarkupToDataUrl(
    `<svg xmlns="http://www.w3.org/2000/svg" class="icon-b" width="16" height="16" viewBox="0 0 24 24">${path}</svg>`
  );
  assert.notEqual(a, b);
  assert.equal(svgContentFingerprint(a), svgContentFingerprint(b));

  const curated = curateIcons(
    [
      {
        url: a,
        width: 24,
        height: 24,
        source: "inline-svg",
        kindHint: "icon",
        format: "svg",
        filename: "search-a.svg",
        domIds: ["pa-1"]
      },
      {
        url: b,
        width: 16,
        height: 16,
        source: "inline-svg",
        kindHint: "icon",
        format: "svg",
        filename: "search-b.svg",
        domIds: ["pa-2"]
      },
      {
        url: svgMarkupToDataUrl(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1 1h1v1H1z"/></svg>`
        ),
        width: 16,
        height: 16,
        source: "inline-svg",
        kindHint: "icon",
        format: "svg",
        filename: "menu.svg",
        symbolId: "icon-menu",
        domIds: ["pa-3"]
      },
      {
        url: svgMarkupToDataUrl(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M1 1h1v1H1z"/></svg>`
        ),
        width: 16,
        height: 16,
        source: "inline-svg",
        kindHint: "icon",
        format: "svg",
        filename: "menu-dupe.svg",
        symbolId: "icon-menu",
        domIds: ["pa-4"]
      }
    ],
    { baseHref: "https://example.com/" }
  );

  assert.equal(curated.length, 2);
  const search = curated.find((icon) => !icon.symbolId);
  const menu = curated.find((icon) => icon.symbolId === "icon-menu");
  assert.ok(search);
  assert.ok(menu);
  assert.deepEqual(search.domIds.sort(), ["pa-1", "pa-2"]);
  assert.deepEqual(menu.domIds.sort(), ["pa-3", "pa-4"]);
});

test("blank use-only SVG data URLs are filtered out of Icons", () => {
  const emptyUse = svgMarkupToDataUrl('<svg viewBox="0 0 24 24"><use href="#missing"/></svg>');
  // Helper still encodes, but drawable check rejects it.
  assert.equal(svgMarkupHasDrawableContent('<svg><use href="#x"/></svg>'), false);
  assert.equal(svgMarkupHasDrawableContent('<svg><path d="M0 0h1v1H0z"/></svg>'), true);

  const blankDataUrl =
    emptyUse ||
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg"><use href="#missing"/></svg>'
    )}`;
  assert.ok(dataUrlToSvgMarkup(blankDataUrl));

  const curated = curateIcons(
    [
      {
        url: blankDataUrl,
        width: 24,
        height: 24,
        source: "inline-svg",
        kindHint: "icon",
        format: "svg",
        filename: "empty.svg"
      },
      {
        url: "https://example.com/real.svg",
        width: 24,
        height: 24,
        source: "img",
        kindHint: "icon",
        format: "svg"
      }
    ],
    { baseHref: "https://example.com/" }
  );
  assert.equal(curated.length, 1);
  assert.match(curated[0].url, /real\.svg/);
});

test("unsupported or inaccessible-looking URLs are rejected", () => {
  assert.equal(normalizeAssetUrl("chrome://extensions"), null);
  assert.equal(isSupportedDirectAssetUrl("ftp://files.example.com/a.png"), false);
  const curated = curateImages([
    { url: "not a url", source: "img", kindHint: "image", width: 100, height: 100 }
  ]);
  assert.equal(curated.length, 0);
});

test("preferredSrcsetUrl picks the largest candidate", () => {
  assert.equal(
    preferredSrcsetUrl(
      "small.jpg 400w, medium.jpg 800w, large.jpg 1600w"
    ),
    "large.jpg"
  );
});

test("download helpers preserve filenames and map failures", () => {
  const asset = createAssetRecord({
    url: "https://cdn.example.com/gallery/shot.avif",
    format: "avif"
  });
  assert.equal(buildDownloadFilename(asset), "shot.avif");
  assert.match(downloadErrorMessage("inaccessible"), /couldn’t be reached|couldn't be reached/i);
  assert.match(downloadErrorMessage("interrupted"), /interrupted/i);
  assert.ok(downloadErrorMessage("unknown-code").length > 0);
});

test("generation controller tracks images and icons independently", () => {
  let state = createGenerationState();
  assert.equal(isAssetMode("images"), true);
  assert.equal(isAssetMode("colors"), false);

  state = applyAssetsSuccess(state, {
    pageKey: "1::https://example.com",
    rawAssets: { candidates: [{ url: "https://example.com/a.png" }] },
    images: [{ id: "i1", url: "https://example.com/a.png" }],
    icons: [{ id: "k1", url: "https://example.com/a.svg" }],
    requestId: 0
  });

  assert.equal(hasResultsForMode(state, "images"), true);
  assert.equal(hasResultsForMode(state, "icons"), true);
  assert.equal(canReuseRawAssets(state, { pageKey: "1::https://example.com" }), true);

  state = resetMode(state, "images");
  assert.equal(state.images.length, 0);
  assert.equal(state.dismissed.images, true);
  assert.equal(state.icons.length, 1);

  const restored = restoreGenerationCache(serializeGenerationCache(state));
  assert.equal(restored.icons[0].url, "https://example.com/a.svg");
  assert.equal(restored.dismissed.images, true);
});

test("uniqueZipEntryNames dedupes colliding filenames", () => {
  const names = uniqueZipEntryNames([
    { filename: "logo.png" },
    { filename: "logo.png" },
    { filename: "icon" },
    { filename: "icon" }
  ]);
  assert.deepEqual(names, ["logo.png", "logo-2.png", "icon", "icon-2"]);
});

test("buildZipStore writes a readable STORE archive", () => {
  const payload = new TextEncoder().encode("hello prism");
  const zip = buildZipStore([{ name: "note.txt", data: payload }]);

  assert.equal(zip[0], 0x50); // P
  assert.equal(zip[1], 0x4b); // K
  assert.equal(zip[2], 0x03);
  assert.equal(zip[3], 0x04);

  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert.equal(view.getUint32(14, true), crc32(payload));
  assert.equal(view.getUint32(18, true), payload.length);
  assert.equal(view.getUint16(8, true), 0); // STORE

  const nameLen = view.getUint16(26, true);
  const dataStart = 30 + nameLen;
  const extracted = new TextDecoder().decode(zip.subarray(dataStart, dataStart + payload.length));
  assert.equal(extracted, "hello prism");

  // End of central directory signature near the end
  const eocd = zip.byteLength - 22;
  assert.equal(view.getUint32(eocd, true), 0x06054b50);
  assert.equal(view.getUint16(eocd + 8, true), 1);
});
