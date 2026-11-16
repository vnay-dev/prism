import {
  APP_PADDING,
  BENTO_GAP,
  CONTENT_WIDTH,
  GRADIENT_BAR_HEIGHT,
  GRADIENT_SECTION_LABEL,
  LIGHT_BORDER_COLOR,
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
import { parseCssGradient } from "../core/paintGradient.js";
import { USAGE_ROLE_LABELS, primaryUsageRole } from "../core/usageRoles.js";
import {
  buildGradientPaintDef,
  escapeXmlAttr,
  formatExportTitle,
  getActiveTabMeta,
  loadImage,
  resolveGradientStops
} from "./exportPaletteImage.js";

/**
 * Palette → SVG markup. Figma turns pasted SVG into native, editable layers
 * (frames, rectangles with corner radius, gradient fills, text), so designers
 * can use the palette right away instead of dropping in a flat PNG.
 * Geometry is in the popup's logical px (1 unit = 1 Figma px).
 */

const LOGO_SIZE = 24;
const LOGO_GAP = 8;
const LOGO_RADIUS = 6;
const HEADER_GAP = 24;
const TITLE_FONT_SIZE = 20;
const TITLE_FONT_WEIGHT = 600;
const TITLE_COLOR = "#1c1c1c";
const SURFACE = "#fdfdfd";
const SURFACE_RADIUS = 8;
const FONT_FAMILY = "Google Sans, Inter, Arial, sans-serif";

const num = (value) => Number(value.toFixed(3));

function truncateApprox(text, maxWidth, fontSize) {
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * 0.55)));
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

function safeHex(hex) {
  return /^#[0-9a-f]{3,8}$/i.test(String(hex || "")) ? hex : "#000000";
}

function layerName(...parts) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
}

function swatchLayerName(swatch, index) {
  const hex = safeHex(swatch?.hex).toUpperCase();
  const usage =
    swatch?.primaryUsageRole || primaryUsageRole(swatch?.usageRoles, swatch?.usage);
  if (usage && USAGE_ROLE_LABELS[usage]) {
    return layerName(USAGE_ROLE_LABELS[usage], hex);
  }
  const role = String(swatch?.role || "").trim();
  if (role && role !== "neutral") {
    return layerName(role.charAt(0).toUpperCase() + role.slice(1), hex);
  }
  return layerName(`Color ${index + 1}`, hex);
}

function textNode(id, text, x, baselineY, size, weight) {
  return `<text id="${escapeXmlAttr(id)}" x="${num(x)}" y="${num(baselineY)}" font-family="${FONT_FAMILY}" font-size="${size}" font-weight="${weight}" fill="${TITLE_COLOR}">${escapeXmlAttr(text)}</text>`;
}

function swatchNode(swatch, index, x, y, width, height) {
  const hex = safeHex(swatch.hex);
  const light = isLightSwatch(hex);
  const inset = light ? 0.5 : 0;
  const stroke = light ? ` stroke="${LIGHT_BORDER_COLOR}" stroke-width="1"` : "";
  return `<rect id="${escapeXmlAttr(swatchLayerName(swatch, index))}" x="${num(x + inset)}" y="${num(y + inset)}" width="${num(width - inset * 2)}" height="${num(height - inset * 2)}" rx="${num(Math.max(0, TILE_RADIUS - inset))}" fill="${hex}"${stroke}/>`;
}

function gradientNode(gradient, index, x, y, width, height, defs) {
  const parsed = parseCssGradient(gradient?.css || "");
  const stops = resolveGradientStops(parsed, gradient?.stops || []);
  const n = index + 1;
  const paintId = `prism-gradient-${n}`;
  const groupName = layerName("Gradient", n);
  defs.push(buildGradientPaintDef(paintId, parsed, width, height, stops));
  const common = `x="${num(x)}" y="${num(y)}" width="${num(width)}" height="${num(height)}" rx="${TILE_RADIUS}"`;
  return (
    `<g id="${escapeXmlAttr(groupName)}">` +
    `<rect id="${escapeXmlAttr(layerName(groupName, "base"))}" ${common} fill="${SURFACE}"/>` +
    // Gradient defs use user-space endpoints relative to 0,0, so shift via transform.
    `<rect id="${escapeXmlAttr(layerName(groupName, "fill"))}" x="0" y="0" width="${num(width)}" height="${num(height)}" rx="${TILE_RADIUS}" fill="url(#${paintId})" transform="translate(${num(x)} ${num(y)})"/>` +
    `<rect id="${escapeXmlAttr(layerName(groupName, "border"))}" x="${num(x + 0.5)}" y="${num(y + 0.5)}" width="${num(width - 1)}" height="${num(height - 1)}" rx="${TILE_RADIUS - 0.5}" fill="none" stroke="${LIGHT_BORDER_COLOR}" stroke-width="1"/>` +
    `</g>`
  );
}

/**
 * Build the palette SVG. Pure string output (no DOM) apart from the optional
 * color resolution done inside `resolveGradientStops`.
 */
export function buildPaletteSvg(swatches, pageMeta = {}, options = {}) {
  const palette = Array.isArray(swatches) ? swatches : [];
  const gradients = Array.isArray(options.gradients) ? options.gradients : [];
  const useStack = normalizeColorViewMode(options.viewMode) === COLOR_VIEW_MODES.STACK;
  const siteTitle = formatExportTitle(pageMeta);
  // Figma uses the root SVG id as the top-level frame name on paste.
  const rootFrameName = layerName(siteTitle, "palette");

  const pad = APP_PADDING;
  const headerHeight = Math.max(LOGO_SIZE, TITLE_FONT_SIZE);
  const defs = [];
  const body = [];
  let gradientIndex = 0;

  let y = pad + headerHeight + HEADER_GAP;

  // Header: logo + site title.
  const header = [];
  let textX = pad;
  const icon = String(pageMeta.iconDataUrl || "");
  if (/^data:image\/(png|jpe?g|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon);/i.test(icon)) {
    const logoY = pad + (headerHeight - LOGO_SIZE) / 2;
    // Plain <image> with xlink:href: the most reliably imported form in Figma.
    // Rounding is baked into the PNG (see rasterizeLogo), so no clip-path needed.
    header.push(
      `<image id="${escapeXmlAttr(layerName(siteTitle, "logo"))}" xlink:href="${escapeXmlAttr(icon)}" x="${pad}" y="${logoY}" width="${LOGO_SIZE}" height="${LOGO_SIZE}"/>`
    );
    textX = pad + LOGO_SIZE + LOGO_GAP;
  }
  const heading = truncateApprox(siteTitle, CONTENT_WIDTH + pad - textX, TITLE_FONT_SIZE);
  header.push(
    textNode(
      layerName(siteTitle, "title"),
      heading,
      textX,
      pad + headerHeight / 2 + TITLE_FONT_SIZE * 0.35,
      TITLE_FONT_SIZE,
      TITLE_FONT_WEIGHT
    )
  );
  body.push(`<g id="${escapeXmlAttr(layerName(siteTitle, "header"))}">${header.join("")}</g>`);

  const sectionTitle = (label) =>
    textNode(
      layerName(label, "label"),
      truncateApprox(label, CONTENT_WIDTH, ROLE_TITLE_SIZE),
      pad,
      y + ROLE_TITLE_SIZE * 0.8,
      ROLE_TITLE_SIZE,
      600
    );

  if (useStack) {
    const bars = buildStackLayout(palette).map(({ swatch }, index) => {
      if (index > 0) y += STACK_GAP;
      const node = swatchNode(swatch, index, pad, y, CONTENT_WIDTH, STACK_BAR_HEIGHT);
      y += STACK_BAR_HEIGHT;
      return node;
    });
    body.push(`<g id="Colors">${bars.join("")}</g>`);

    const rows = buildGradientRows(gradients);
    if (rows.length) {
      y += ROLE_SECTION_GAP;
      const parts = [sectionTitle(GRADIENT_SECTION_LABEL)];
      y += ROLE_TITLE_SIZE + ROLE_TITLE_GAP;
      rows.forEach((row, rowIndex) => {
        if (rowIndex > 0) y += BENTO_GAP;
        parts.push(
          gradientNode(row.tiles[0], gradientIndex++, pad, y, CONTENT_WIDTH, GRADIENT_BAR_HEIGHT, defs)
        );
        y += GRADIENT_BAR_HEIGHT;
      });
      body.push(`<g id="${GRADIENT_SECTION_LABEL}">${parts.join("")}</g>`);
    }
  } else {
    const sections = buildRoleSections(palette, { gradients });
    let swatchIndex = 0;
    sections.forEach((section, sectionIndex) => {
      if (sectionIndex > 0) y += ROLE_SECTION_GAP;
      const parts = [];
      if (section.label) {
        parts.push(sectionTitle(section.label));
        y += ROLE_TITLE_SIZE + ROLE_TITLE_GAP;
      }
      section.rows.forEach((row, rowIndex) => {
        const rowHeight = row.height || TILE_SIZE;
        if (!row.tiles.length) return;
        if (rowIndex > 0) y += BENTO_GAP;
        row.tiles.forEach((tile, tileIndex) => {
          const x = pad + tileIndex * (row.tileSize + BENTO_GAP);
          parts.push(
            section.kind === "gradients"
              ? gradientNode(tile, gradientIndex++, x, y, row.tileSize, rowHeight, defs)
              : swatchNode(tile, swatchIndex++, x, y, row.tileSize, rowHeight)
          );
        });
        y += rowHeight;
      });
      const sectionName = section.label || (section.kind === "gradients" ? GRADIENT_SECTION_LABEL : "Colors");
      body.push(`<g id="${escapeXmlAttr(sectionName)}">${parts.join("")}</g>`);
    });
  }

  const width = CONTENT_WIDTH + pad * 2;
  const height = y + pad;
  const defsXml = defs.length ? `<defs>${defs.join("")}</defs>` : "";

  return (
    `<svg id="${escapeXmlAttr(rootFrameName)}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${num(height)}" viewBox="0 0 ${width} ${num(height)}">` +
    defsXml +
    `<rect id="${escapeXmlAttr(layerName(siteTitle, "surface"))}" width="${width}" height="${num(height)}" rx="${SURFACE_RADIUS}" fill="${SURFACE}"/>` +
    body.join("") +
    `</svg>`
  );
}

/**
 * Re-encode the favicon (ico/svg/webp/…) as a rounded, cover-fit PNG so Figma
 * can always decode it. Returns "" when it can't be decoded.
 */
async function rasterizeLogo(dataUrl) {
  const img = await loadImage(dataUrl);
  if (!img?.width || !img?.height) return "";
  try {
    const size = LOGO_SIZE * 4;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, LOGO_RADIUS * 4);
    ctx.clip();
    const scale = Math.max(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    return canvas.toDataURL("image/png");
  } catch {
    return "";
  }
}

/**
 * Build SVG markup for clipboard export (resolves logo rasterization).
 */
async function buildPaletteSvgForCopy(swatches, pageMeta, options = {}) {
  const meta = pageMeta && typeof pageMeta === "object" ? pageMeta : await getActiveTabMeta();
  const iconDataUrl = await rasterizeLogo(meta.iconDataUrl);
  return buildPaletteSvg(swatches, { ...meta, iconDataUrl }, options);
}

/**
 * Copy the palette as SVG text. Pasting on the Figma canvas creates native,
 * editable layers rather than a bitmap.
 *
 * Written with plain `writeText`, the same path other copy-to-Figma tools use.
 */
export async function copyPaletteSvg(swatches, pageMeta, options = {}) {
  const svg = await buildPaletteSvgForCopy(swatches, pageMeta, options);
  await navigator.clipboard.writeText(svg);
}
