import {
  APP_PADDING,
  BENTO_GAP,
  CONTENT_WIDTH,
  LIGHT_BORDER_COLOR,
  GRADIENT_BAR_HEIGHT,
  GRADIENT_SECTION_LABEL,
  ROLE_SECTION_GAP,
  ROLE_TITLE_GAP,
  ROLE_TITLE_SIZE,
  STACK_BAR_HEIGHT,
  STACK_GAP,
  TILE_RADIUS,
  TILE_SIZE,
  buildGradientRows,
  buildRoleSections,
  isLightSwatch
} from "./paletteLayout.js";
import { COLOR_VIEW_MODES, buildStackLayout, normalizeColorViewMode } from "./paletteViews.js";
import {
  parseCssGradient,
  paintParsedGradient,
  cssLinearEndpoints
} from "../core/paintGradient.js";
import { getTargetTab } from "./tabs.js";

/**
 * Convert any CSS color (incl. oklch / #rrggbbaa) to `{ css, r, g, b, a }`.
 * Alpha is read from painted pixels so opacity survives into the export PNG.
 */
let gradientColorCtx = null;
function resolveCssColorForCanvas(raw) {
  const token = String(raw || "").trim();
  if (!token) return null;
  if (/^transparent$/i.test(token)) {
    return { css: "rgba(0, 0, 0, 0)", r: 0, g: 0, b: 0, a: 0 };
  }

  try {
    if (!gradientColorCtx) {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      gradientColorCtx = canvas.getContext("2d", {
        willReadFrequently: true,
        colorSpace: "srgb"
      });
    }
    if (!gradientColorCtx) return null;

    gradientColorCtx.fillStyle = "#abcdef";
    const sentinel = gradientColorCtx.fillStyle;
    gradientColorCtx.fillStyle = token;
    if (!gradientColorCtx.fillStyle || gradientColorCtx.fillStyle === sentinel) {
      return null;
    }

    gradientColorCtx.clearRect(0, 0, 1, 1);
    gradientColorCtx.fillStyle = token;
    gradientColorCtx.fillRect(0, 0, 1, 1);
    const [r, g, b, aByte] = gradientColorCtx.getImageData(0, 0, 1, 1).data;
    const a = aByte / 255;
    return {
      css: `rgba(${r}, ${g}, ${b}, ${a})`,
      r,
      g,
      b,
      a
    };
  } catch {
    return null;
  }
}

// Scale the popup's logical geometry up for a crisp, retina-quality export.
const EXPORT_SCALE = 4;

// Header (logo + site title) geometry, in logical px (before EXPORT_SCALE).
const LOGO_SIZE = 24;
const LOGO_GAP = 8;
const LOGO_RADIUS = 6;
const HEADER_GAP = 24;
const TITLE_FONT_SIZE = 20;
const TITLE_FONT_WEIGHT = 600;
const TITLE_COLOR = "#16171b";

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRoundRect(ctx, x, y, width, height, radius) {
  roundRectPath(ctx, x, y, width, height, radius);
  ctx.fill();
}

function strokeRoundRect(ctx, x, y, width, height, radius) {
  roundRectPath(ctx, x, y, width, height, radius);
  ctx.stroke();
}

function drawImageCover(ctx, img, x, y, width, height, radius) {
  if (!img?.width || !img?.height) return;
  ctx.save();
  roundRectPath(ctx, x, y, width, height, radius);
  ctx.clip();

  const aspect = img.width / img.height;
  let drawWidth = width;
  let drawHeight = height;
  let drawX = x;
  let drawY = y;

  if (aspect > width / height) {
    drawHeight = height;
    drawWidth = height * aspect;
    drawX = x - (drawWidth - width) / 2;
  } else {
    drawWidth = width;
    drawHeight = width / aspect;
    drawY = y - (drawHeight - height) / 2;
  }

  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
  ctx.restore();
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function ensureGoogleSansLoaded() {
  const px = TITLE_FONT_SIZE * EXPORT_SCALE;
  try {
    await Promise.all([
      document.fonts.load(`${TITLE_FONT_WEIGHT} ${px}px "Google Sans"`),
      document.fonts.load(`700 ${px}px "Google Sans"`),
      document.fonts.load(`600 ${ROLE_TITLE_SIZE * EXPORT_SCALE}px "Google Sans"`)
    ]);
    await document.fonts.ready;
  } catch {
    /* fonts will fall back to sans-serif */
  }
}

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let value = text;
  while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) {
    value = value.slice(0, -1);
  }
  return `${value}…`;
}

function titleCase(value) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function hostnameLabel(url, hostname = "") {
  try {
    const host = (hostname || new URL(url).hostname).replace(/^www\./i, "");
    const parts = host.split(".").filter(Boolean);
    if (!parts.length) return "";

    let label = parts[0];
    if (parts.length >= 2) {
      const tld = parts[parts.length - 1];
      const sld = parts[parts.length - 2];
      label = tld.length === 2 && sld.length <= 3 && parts.length >= 3 ? parts[parts.length - 3] : sld;
    }

    return titleCase(label.replace(/-/g, " "));
  } catch {
    return "";
  }
}

function isUsableSiteName(name) {
  const value = (name || "").trim();
  if (!value) return false;

  const lower = value.toLowerCase();
  if (lower === "untitled" || lower === "untitled page" || lower === "new tab") return false;
  if (/embed code/i.test(lower)) return false;
  if (/^selection\b/i.test(lower)) return false;

  return true;
}

function trimToLength(text, maxLength) {
  const value = text.trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}…`;
}

/**
 * Strip anything that makes a label look like a URL/domain: protocol, www,
 * trailing path/query, and a domain TLD. A bare host like "chatgpt.com" becomes
 * "Chatgpt", while a real brand name ("ChatGPT", "Acme Studio") is left intact.
 */
function deLinkifyBrand(value) {
  let cleaned = (value || "").trim();
  if (!cleaned) return "";

  cleaned = cleaned.replace(/^https?:\/\//i, "").replace(/^www\./i, "");

  const looksLikeHost = !/\s/.test(cleaned) && /^[\w-]+(\.[\w-]+)+/.test(cleaned);
  if (looksLikeHost) {
    const host = cleaned.split(/[\/?#]/)[0];
    const fromHost = hostnameLabel("", host);
    if (fromHost) return fromHost;
  }

  return cleaned;
}

function parseTitleBrand(title) {
  const safeTitle = (title || "").trim();
  if (!safeTitle || !isUsableSiteName(safeTitle)) return "";

  if (safeTitle.includes("|")) {
    const brand = safeTitle.split("|").pop()?.trim() || "";
    return isUsableSiteName(brand) ? brand : "";
  }

  const enDashParts = safeTitle.split(" – ");
  if (enDashParts.length >= 2) {
    const brand = enDashParts[0].trim();
    if (isUsableSiteName(brand) && brand.length <= 40) return brand;
  }

  const hyphenParts = safeTitle.split(" - ");
  if (hyphenParts.length >= 2) {
    const brand = hyphenParts[0].trim();
    if (isUsableSiteName(brand) && brand.length <= 40) return brand;
  }

  return isUsableSiteName(safeTitle) ? safeTitle : "";
}

export function formatExportTitle(meta = {}) {
  const siteName = meta.siteName?.trim();
  const title = meta.title?.trim();
  const url = meta.url || "";
  const hostname = meta.hostname?.trim();

  if (siteName && isUsableSiteName(siteName)) {
    return trimToLength(deLinkifyBrand(siteName), 48);
  }

  const fromHost = hostnameLabel(url, hostname);
  if (fromHost) return fromHost;

  const fromTitle = parseTitleBrand(title);
  if (fromTitle) return trimToLength(deLinkifyBrand(fromTitle), 48);

  return "Untitled page";
}

function emptyMeta(url = "") {
  return { title: "", siteName: "", hostname: "", url, iconDataUrl: "" };
}

export async function getActiveTabMeta() {
  const tab = await getTargetTab();
  return readPageMetaFromTab(tab);
}

/**
 * Read the page title + site name and resolve the best available logo
 * (apple-touch-icon → declared icons → /favicon.ico). The icon is fetched and
 * converted to a data URL inside the page context, so the export canvas stays
 * untainted and no extra host permissions are required.
 */
export async function readPageMetaFromTab(tab) {
  if (!tab?.id) return emptyMeta(tab?.url || "");

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        const meta = {
          title: document.title?.trim() || "",
          siteName:
            document.querySelector('meta[property="og:site_name"]')?.content?.trim() ||
            document.querySelector('meta[name="application-name"]')?.content?.trim() ||
            "",
          hostname: location.hostname.replace(/^www\./i, ""),
          iconDataUrl: ""
        };

        const toAbs = (href) => {
          try {
            return new URL(href, location.href).href;
          } catch {
            return "";
          }
        };

        const rankSize = (el, fallback) => {
          const sizes = (el.getAttribute("sizes") || "").toLowerCase();
          if (sizes === "any") return 512;
          const match = sizes.match(/(\d+)x(\d+)/);
          return match ? parseInt(match[1], 10) : fallback;
        };

        const candidates = [];
        document
          .querySelectorAll(
            'link[rel~="apple-touch-icon"], link[rel~="apple-touch-icon-precomposed"]'
          )
          .forEach((el) => {
            const url = toAbs(el.getAttribute("href"));
            if (url) candidates.push({ url, size: rankSize(el, 180) });
          });
        document.querySelectorAll('link[rel~="icon"]').forEach((el) => {
          const url = toAbs(el.getAttribute("href"));
          if (url) candidates.push({ url, size: rankSize(el, 32) });
        });
        candidates.push({ url: toAbs("/favicon.ico"), size: 16 });

        const seen = new Set();
        const ordered = candidates
          .filter((c) => c.url && !seen.has(c.url) && seen.add(c.url))
          .sort((a, b) => b.size - a.size);

        const blobToDataUrl = (blob) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

        for (const candidate of ordered) {
          try {
            const response = await fetch(candidate.url, { credentials: "omit" });
            if (!response.ok) continue;
            const blob = await response.blob();
            if (!blob.size || blob.size > 2_000_000) continue;
            const looksImage =
              blob.type.startsWith("image/") ||
              /\.(ico|png|jpe?g|svg|webp|gif)(\?|#|$)/i.test(candidate.url);
            if (!looksImage) continue;
            meta.iconDataUrl = await blobToDataUrl(blob);
            break;
          } catch {
            /* try the next candidate */
          }
        }

        return meta;
      }
    });

    return { ...emptyMeta(tab.url || ""), ...result, url: tab.url || "" };
  } catch {
    return emptyMeta(tab.url || "");
  }
}

function drawSwatchTile(ctx, swatch, x, y, width, height, radius, borderWidth) {
  ctx.fillStyle = swatch.hex;
  fillRoundRect(ctx, x, y, width, height, radius);

  if (isLightSwatch(swatch.hex)) {
    ctx.strokeStyle = LIGHT_BORDER_COLOR;
    ctx.lineWidth = borderWidth;
    strokeRoundRect(
      ctx,
      x + borderWidth / 2,
      y + borderWidth / 2,
      width - borderWidth,
      height - borderWidth,
      Math.max(0, radius - borderWidth / 2)
    );
  }
}

function escapeXmlAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resolveGradientStops(parsed, fallbackTokens = []) {
  const fromParsed = (parsed?.stops || [])
    .map((stop) => {
      const color = resolveCssColorForCanvas(stop.color);
      if (!color) return null;
      return {
        ...color,
        offset: Math.max(0, Math.min(1, Number(stop.offset) || 0))
      };
    })
    .filter(Boolean);

  if (fromParsed.length >= 2) {
    for (let i = 1; i < fromParsed.length; i += 1) {
      if (fromParsed[i].offset < fromParsed[i - 1].offset) {
        fromParsed[i].offset = fromParsed[i - 1].offset;
      }
    }
    return fromParsed;
  }

  const colors = (fallbackTokens || []).map(resolveCssColorForCanvas).filter(Boolean);
  if (colors.length >= 2) {
    return colors.map((color, index) => ({
      ...color,
      offset: index / (colors.length - 1)
    }));
  }
  if (colors.length === 1) {
    return [
      { ...colors[0], offset: 0 },
      { ...colors[0], offset: 1 }
    ];
  }
  return [
    { css: "rgba(208, 213, 221, 1)", r: 208, g: 213, b: 221, a: 1, offset: 0 },
    { css: "rgba(102, 112, 133, 1)", r: 102, g: 112, b: 133, a: 1, offset: 1 }
  ];
}

function buildGradientSvgMarkup(parsed, width, height, stops) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  // SVG 1.1 ignores alpha inside stop-color rgba(); put opacity on stop-opacity.
  const stopXml = stops
    .map((stop) => {
      const offset = `${(stop.offset * 100).toFixed(3)}%`;
      const color = `rgb(${stop.r}, ${stop.g}, ${stop.b})`;
      const opacity = Number.isFinite(stop.a) ? Math.max(0, Math.min(1, stop.a)) : 1;
      return `<stop offset="${offset}" stop-color="${escapeXmlAttr(color)}" stop-opacity="${opacity}"/>`;
    })
    .join("");

  let paint;
  if (parsed?.type === "radial") {
    paint = `<radialGradient id="g" cx="50%" cy="50%" r="75%">${stopXml}</radialGradient>`;
  } else {
    const angle = parsed?.type === "conic" ? 90 : parsed?.angle ?? 180;
    const line = cssLinearEndpoints(angle, w, h);
    paint = `<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}">${stopXml}</linearGradient>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${paint}</defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
}

async function rasterizeGradientSvg(parsed, width, height, stops) {
  const svg = buildGradientSvgMarkup(parsed, width, height, stops);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    if (!img) return null;
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function drawGradientTile(ctx, gradient, x, y, width, height, radius, borderWidth) {
  ctx.save();
  roundRectPath(ctx, x, y, width, height, radius);
  ctx.clip();

  // Same light surface the panel uses — transparent stops composite over this,
  // matching what you see in the extension UI.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, width, height);

  const parsed = parseCssGradient(gradient?.css || "");
  const stops = resolveGradientStops(parsed, gradient?.stops || []);
  const paintModel = {
    type: parsed?.type || "linear",
    repeating: Boolean(parsed?.repeating),
    angle: parsed?.angle ?? 180,
    stops: stops.map((stop) => ({ color: stop.css, offset: stop.offset }))
  };

  // Canvas gradients preserve rgba alpha correctly (unlike SVG stop-color).
  let painted = paintParsedGradient(
    ctx,
    paintModel,
    x,
    y,
    width,
    height,
    (color) => color
  );

  if (!painted) {
    const img = await rasterizeGradientSvg(parsed, width, height, stops);
    if (img) {
      ctx.drawImage(img, x, y, width, height);
      painted = true;
    }
  }

  ctx.restore();

  ctx.strokeStyle = LIGHT_BORDER_COLOR;
  ctx.lineWidth = borderWidth;
  strokeRoundRect(
    ctx,
    x + borderWidth / 2,
    y + borderWidth / 2,
    width - borderWidth,
    height - borderWidth,
    Math.max(0, radius - borderWidth / 2)
  );
}

function measureRolesHeight(sections, scale, gap, sectionGap, titleGap, roleTitlePx) {
  return sections.reduce((sum, section, index) => {
    const rowsHeight =
      section.rows.reduce((rowSum, row) => rowSum + row.height * scale, 0) +
      gap * Math.max(0, section.rows.length - 1);
    const titleHeight = section.label ? roleTitlePx + titleGap : 0;
    return sum + (index > 0 ? sectionGap : 0) + titleHeight + rowsHeight;
  }, 0);
}

/**
 * Render the palette exactly as the popup shows it: branded header + either
 * organized role tiles or the stack (full-width bar) layout.
 */
export async function renderPalettePng(swatches, pageMeta = {}, options = {}) {
  await ensureGoogleSansLoaded();

  const viewMode = normalizeColorViewMode(options.viewMode);
  const palette = Array.isArray(swatches) ? swatches : [];
  const useStack = viewMode === COLOR_VIEW_MODES.STACK;

  const scale = EXPORT_SCALE;
  const pad = APP_PADDING * scale;
  const gap = BENTO_GAP * scale;
  const stackGap = STACK_GAP * scale;
  const contentWidth = CONTENT_WIDTH * scale;
  const radius = TILE_RADIUS * scale;
  const borderWidth = 1 * scale;
  const stackBarHeight = STACK_BAR_HEIGHT * scale;

  const logoSize = LOGO_SIZE * scale;
  const logoGap = LOGO_GAP * scale;
  const logoRadius = LOGO_RADIUS * scale;
  const headerGap = HEADER_GAP * scale;
  const titlePx = TITLE_FONT_SIZE * scale;
  const titleFont = `${TITLE_FONT_WEIGHT} ${titlePx}px "Google Sans", sans-serif`;
  const headerHeight = Math.max(logoSize, titlePx);

  const sectionGap = ROLE_SECTION_GAP * scale;
  const titleGap = ROLE_TITLE_GAP * scale;
  const roleTitlePx = ROLE_TITLE_SIZE * scale;
  const roleTitleFont = `600 ${roleTitlePx}px "Google Sans", sans-serif`;

  const gradients = Array.isArray(options.gradients) ? options.gradients : [];
  const sections = useStack ? null : buildRoleSections(palette, { gradients });
  const stackItems = useStack ? buildStackLayout(palette) : null;
  const stackGradientRows = useStack ? buildGradientRows(gradients) : [];
  const stackGradientsHeight = stackGradientRows.length
    ? sectionGap +
      roleTitlePx +
      titleGap +
      stackGradientRows.length * GRADIENT_BAR_HEIGHT * scale +
      gap * Math.max(0, stackGradientRows.length - 1)
    : 0;

  const bodyHeight = useStack
    ? stackItems.length * stackBarHeight +
      stackGap * Math.max(0, stackItems.length - 1) +
      stackGradientsHeight
    : measureRolesHeight(sections, scale, gap, sectionGap, titleGap, roleTitlePx);

  const logo = await loadImage(pageMeta.iconDataUrl);
  const heading = formatExportTitle(pageMeta);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(contentWidth + pad * 2);
  canvas.height = Math.round(pad + headerHeight + headerGap + bodyHeight + pad);

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header: logo + site title, both vertically centered in the header band.
  const headerCenterY = pad + headerHeight / 2;
  let textX = pad;
  if (logo) {
    const logoY = pad + (headerHeight - logoSize) / 2;
    drawImageCover(ctx, logo, pad, logoY, logoSize, logoSize, logoRadius);
    textX = pad + logoSize + logoGap;
  }

  ctx.font = titleFont;
  ctx.fillStyle = TITLE_COLOR;
  ctx.textBaseline = "middle";
  const headingText = truncateText(ctx, heading, contentWidth + pad - textX);
  ctx.fillText(headingText, textX, headerCenterY);

  let y = pad + headerHeight + headerGap;

  if (useStack) {
    for (let index = 0; index < stackItems.length; index += 1) {
      if (index > 0) y += stackGap;
      const { swatch } = stackItems[index];
      drawSwatchTile(ctx, swatch, pad, y, contentWidth, stackBarHeight, radius, borderWidth);
      y += stackBarHeight;
    }

    if (stackGradientRows.length) {
      y += sectionGap;
      ctx.font = roleTitleFont;
      ctx.fillStyle = TITLE_COLOR;
      ctx.textBaseline = "top";
      ctx.fillText(truncateText(ctx, GRADIENT_SECTION_LABEL, contentWidth), pad, y);
      y += roleTitlePx + titleGap;

      for (let rowIndex = 0; rowIndex < stackGradientRows.length; rowIndex += 1) {
        if (rowIndex > 0) y += gap;
        const rowHeight = GRADIENT_BAR_HEIGHT * scale;
        await drawGradientTile(
          ctx,
          stackGradientRows[rowIndex].tiles[0],
          pad,
          y,
          contentWidth,
          rowHeight,
          radius,
          borderWidth
        );
        y += rowHeight;
      }
    }
  } else {
    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
      const section = sections[sectionIndex];
      if (sectionIndex > 0) y += sectionGap;

      if (section.label) {
        ctx.font = roleTitleFont;
        ctx.fillStyle = TITLE_COLOR;
        ctx.textBaseline = "top";
        ctx.fillText(truncateText(ctx, section.label, contentWidth), pad, y);
        y += roleTitlePx + titleGap;
      }

      for (let rowIndex = 0; rowIndex < section.rows.length; rowIndex += 1) {
        const row = section.rows[rowIndex];
        const rowHeight = (row.height || TILE_SIZE) * scale;
        const count = row.tiles.length;
        if (count === 0) continue;
        if (rowIndex > 0) y += gap;

        const tileWidth = row.tileSize * scale;
        const isGradientSection = section.kind === "gradients";
        for (let index = 0; index < row.tiles.length; index += 1) {
          const tile = row.tiles[index];
          const x = pad + index * (tileWidth + gap);
          if (isGradientSection) {
            await drawGradientTile(ctx, tile, x, y, tileWidth, rowHeight, radius, borderWidth);
          } else {
            drawSwatchTile(ctx, tile, x, y, tileWidth, rowHeight, radius, borderWidth);
          }
        }

        y += rowHeight;
      }
    }
  }

  return canvas;
}

export async function copyPaletteImage(swatches, pageMeta, options = {}) {
  const meta = pageMeta || (await getActiveTabMeta());
  const canvas = await renderPalettePng(swatches, meta, options);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not render PNG.");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
