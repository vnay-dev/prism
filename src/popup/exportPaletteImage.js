import {
  APP_PADDING,
  BENTO_GAP,
  CONTENT_WIDTH,
  LIGHT_BORDER_COLOR,
  TILE_RADIUS,
  buildBentoRows,
  isLightSwatch
} from "./paletteLayout.js";
import { getTargetTab } from "./tabs.js";

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
      document.fonts.load(`700 ${px}px "Google Sans"`)
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

/**
 * Render the palette exactly as the popup shows it: a branded header (site logo
 * + title) above a bento grid of pure color blocks (foundation/primary as hero
 * rows, supporting roles as half-height rows) with matching gaps, corner radius
 * and light-swatch borders.
 */
export async function renderPalettePng(swatches, pageMeta = {}) {
  await ensureGoogleSansLoaded();

  const palette = Array.isArray(swatches) ? swatches : [];
  const rows = buildBentoRows(palette);

  const scale = EXPORT_SCALE;
  const pad = APP_PADDING * scale;
  const gap = BENTO_GAP * scale;
  const contentWidth = CONTENT_WIDTH * scale;
  const radius = TILE_RADIUS * scale;
  const borderWidth = 1 * scale;

  const logoSize = LOGO_SIZE * scale;
  const logoGap = LOGO_GAP * scale;
  const logoRadius = LOGO_RADIUS * scale;
  const headerGap = HEADER_GAP * scale;
  const titlePx = TITLE_FONT_SIZE * scale;
  const titleFont = `${TITLE_FONT_WEIGHT} ${titlePx}px "Google Sans", sans-serif`;
  const headerHeight = Math.max(logoSize, titlePx);

  const rowsHeight =
    rows.reduce((sum, row) => sum + row.height * scale, 0) +
    gap * Math.max(0, rows.length - 1);

  const logo = await loadImage(pageMeta.iconDataUrl);
  const heading = formatExportTitle(pageMeta);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(contentWidth + pad * 2);
  canvas.height = Math.round(pad + headerHeight + headerGap + rowsHeight + pad);

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

  // Palette: bento grid identical to the popup.
  let y = pad + headerHeight + headerGap;
  for (const row of rows) {
    const rowHeight = row.height * scale;
    const count = row.tiles.length;
    if (count === 0) continue;

    const tileWidth = (contentWidth - gap * (count - 1)) / count;

    row.tiles.forEach((swatch, index) => {
      const x = pad + index * (tileWidth + gap);

      ctx.fillStyle = swatch.hex;
      fillRoundRect(ctx, x, y, tileWidth, rowHeight, radius);

      if (isLightSwatch(swatch.hex)) {
        ctx.strokeStyle = LIGHT_BORDER_COLOR;
        ctx.lineWidth = borderWidth;
        strokeRoundRect(
          ctx,
          x + borderWidth / 2,
          y + borderWidth / 2,
          tileWidth - borderWidth,
          rowHeight - borderWidth,
          Math.max(0, radius - borderWidth / 2)
        );
      }
    });

    y += rowHeight + gap;
  }

  return canvas;
}

export async function copyPaletteImage(swatches, pageMeta) {
  const meta = pageMeta || (await getActiveTabMeta());
  const canvas = await renderPalettePng(swatches, meta);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not render PNG.");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
