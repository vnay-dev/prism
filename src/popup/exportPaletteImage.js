import { getTargetTab } from "./tabs.js";

function roleTitle(role) {
  if (role === "foundation") return "Foundation";
  return role.slice(0, 1).toUpperCase() + role.slice(1);
}

async function ensureGoogleSansLoaded() {
  await Promise.all([
    document.fonts.load('700 34px "Google Sans"'),
    document.fonts.load('600 22px "Google Sans"'),
    document.fonts.load('400 16px "Google Sans"')
  ]);
  await document.fonts.ready;
}

function roundRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
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

function isLightSwatch(hex) {
  const value = hex.replace("#", "");
  if (value.length !== 6) return false;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return r >= 248 && g >= 248 && b >= 248;
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
    return trimToLength(siteName, 48);
  }

  const fromHost = hostnameLabel(url, hostname);
  if (fromHost) return fromHost;

  const fromTitle = parseTitleBrand(title);
  if (fromTitle) return trimToLength(fromTitle, 48);

  return "Untitled page";
}

export async function getActiveTabMeta() {
  const tab = await getTargetTab();
  return {
    title: tab?.title || "",
    siteName: "",
    hostname: tab?.url ? new URL(tab.url).hostname.replace(/^www\./i, "") : "",
    url: tab?.url || ""
  };
}

export async function readPageMetaFromTab(tab) {
  if (!tab?.id) {
    return { title: "", siteName: "", hostname: "", url: tab?.url || "" };
  }

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        title: document.title?.trim() || "",
        siteName:
          document.querySelector('meta[property="og:site_name"]')?.content?.trim() ||
          document.querySelector('meta[name="application-name"]')?.content?.trim() ||
          "",
        hostname: location.hostname.replace(/^www\./i, "")
      })
    });
    return { ...result, url: tab.url || "" };
  } catch {
    return {
      title: tab.title || "",
      siteName: "",
      hostname: tab.url ? new URL(tab.url).hostname.replace(/^www\./i, "") : "",
      url: tab.url || ""
    };
  }
}

export async function renderPalettePng(swatches, pageMeta = {}) {
  await ensureGoogleSansLoaded();

  const width = 1200;
  const height = 720;
  const columns = 4;
  const rows = 2;
  const padding = 48;
  const gap = 24;
  const tileRadius = 12;
  const labelBandHeight = 74;
  const labelPaddingX = 14;
  const labelPaddingTop = 14;
  const labelLineGap = 10;
  const hexFont = '600 22px "Google Sans", sans-serif';
  const roleFont = '400 16px "Google Sans", sans-serif';

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.font = '700 34px "Google Sans", sans-serif';
  const heading = truncateText(ctx, formatExportTitle(pageMeta), width - padding * 2);

  const titleMetrics = ctx.measureText(heading);
  const titleHeight = Math.ceil(
    (titleMetrics.fontBoundingBoxAscent ?? titleMetrics.actualBoundingBoxAscent ?? 28) +
      (titleMetrics.fontBoundingBoxDescent ?? titleMetrics.actualBoundingBoxDescent ?? 8)
  );

  ctx.fillStyle = "#111111";
  ctx.textBaseline = "top";
  ctx.fillText(heading, padding, padding);

  const gridStartY = padding + titleHeight + gap;
  const gridEndY = height - padding;
  const gridHeight = gridEndY - gridStartY;
  const tileWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
  const cardHeight = (gridHeight - gap * (rows - 1)) / rows;

  swatches.slice(0, 8).forEach((swatch, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = padding + col * (tileWidth + gap);
    const y = gridStartY + row * (cardHeight + gap);
    const colorHeight = Math.max(0, cardHeight - labelBandHeight);

    ctx.fillStyle = "#f7f8fb";
    fillRoundRect(ctx, x, y, tileWidth, cardHeight, tileRadius);

    ctx.save();
    roundRectPath(ctx, x, y, tileWidth, cardHeight, tileRadius);
    ctx.clip();
    ctx.fillStyle = swatch.hex;
    ctx.fillRect(x, y, tileWidth, colorHeight);
    ctx.restore();

    const labelTop = y + colorHeight + labelPaddingTop;

    ctx.textBaseline = "top";
    ctx.fillStyle = "#16171b";
    ctx.font = hexFont;
    ctx.fillText(swatch.hex.toUpperCase(), x + labelPaddingX, labelTop);

    ctx.fillStyle = "#5c6478";
    ctx.font = roleFont;
    ctx.fillText(roleTitle(swatch.role), x + labelPaddingX, labelTop + 22 + labelLineGap);

    if (isLightSwatch(swatch.hex)) {
      ctx.strokeStyle = "#e4e7ee";
      ctx.lineWidth = 2;
      strokeRoundRect(ctx, x, y, tileWidth, cardHeight, tileRadius);
    }
  });

  return canvas;
}

export async function copyPaletteImage(swatches, pageMeta) {
  const meta = pageMeta || (await getActiveTabMeta());
  const canvas = await renderPalettePng(swatches, meta);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not render PNG.");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
