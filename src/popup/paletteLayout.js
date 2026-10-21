import { USAGE_ROLE_LABELS, USAGE_ROLE_ORDER } from "../core/usageRoles.js";

/**
 * Shared palette layout logic.
 * Both the popup UI (renderSwatches) and the exported PNG (renderPalettePng)
 * use this so the copied image matches exactly what the user sees on screen.
 */

// Geometry mirrored from styles.css (.app padding, .swatches/.bento-row gap,
// .swatch border-radius, .swatch-light edge).
export const APP_PADDING = 16;
export const CONTENT_WIDTH = 348; // 380px panel − 16px padding on each side
export const BENTO_GAP = 6;
export const TILE_RADIUS = 6;
export const TILE_COLUMNS = 4;
export const TILE_SIZE = (CONTENT_WIDTH - BENTO_GAP * (TILE_COLUMNS - 1)) / TILE_COLUMNS;
export const ROLE_SECTION_GAP = 16;
export const ROLE_TITLE_GAP = 8;
export const ROLE_TITLE_SIZE = 13;
export const LIGHT_BORDER_COLOR = "#e4e7ee";
export const DARK_INK = "#1a1d26";
export const LIGHT_INK = "#ffffff";

function hexChannels(hex) {
  const value = String(hex || "").replace("#", "");
  if (value.length !== 6) return null;
  const channels = [0, 2, 4].map((start) => parseInt(value.slice(start, start + 2), 16));
  if (!channels.every((n) => Number.isFinite(n))) return null;
  return channels;
}

/** Perceived lightness, 0 (black) to 1 (white). */
function perceivedLightness(hex) {
  const channels = hexChannels(hex);
  if (!channels) return 0;
  const [r, g, b] = channels;
  return (r * 299 + g * 587 + b * 114) / 1000 / 255;
}

/**
 * Dark tiles use white labels. Light tiles use dark labels.
 * The split follows how light the tile looks, so the label stays readable.
 */
export function prefersDarkInk(hex) {
  return perceivedLightness(hex) >= 0.5;
}

export function onSwatchInk(hex) {
  return prefersDarkInk(hex) ? DARK_INK : LIGHT_INK;
}

export function isLightSwatch(hex) {
  const channels = hexChannels(hex);
  if (!channels) return false;
  const [r, g, b] = channels.map((channel) => channel / 255);
  // Near-white tiles disappear on the #fefefe panel; edge them for contrast.
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance >= 0.9;
}

/** True when a swatch is dark enough that light chrome needs a visible edge. */
export function isDarkSwatch(hex) {
  const channels = hexChannels(hex);
  if (!channels) return false;
  const [r, g, b] = channels.map((channel) => channel / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.28;
}

/** How many tiles sit in each row so every row fills the width. */
export function rowPattern(count) {
  if (count <= 0) return [];
  if (count <= 4) return [count];
  if (count === 5) return [3, 2];
  if (count === 6) return [3, 3];
  if (count === 7) return [4, 3];
  const rows = [];
  let remaining = count;
  while (remaining > 0) {
    const size = Math.min(TILE_COLUMNS, remaining);
    rows.push(size);
    remaining -= size;
  }
  return rows;
}

/** Every tile is the same square. A short row stays left-aligned instead of stretching. */
export function buildFilledRows(tiles) {
  const list = Array.isArray(tiles) ? tiles : [];
  const rows = [];
  let index = 0;
  for (const count of rowPattern(list.length)) {
    rows.push({
      tiles: list.slice(index, index + count),
      height: TILE_SIZE,
      tileSize: TILE_SIZE
    });
    index += count;
  }
  return rows;
}

/**
 * Group swatches under role titles: Background, then Text, then Accent.
 * A color with more than one role is listed under each of those titles.
 * Colors with no measured role stay visible after the titled groups.
 */
export function buildRoleSections(swatches) {
  const list = Array.isArray(swatches) ? swatches : [];
  const sections = [];

  for (const role of USAGE_ROLE_ORDER) {
    const tiles = list.filter((swatch) => (swatch.usageRoles || []).includes(role));
    if (!tiles.length) continue;
    sections.push({
      role,
      label: USAGE_ROLE_LABELS[role],
      rows: buildFilledRows(tiles)
    });
  }

  const unlabeled = list.filter((swatch) => !(swatch.usageRoles || []).length);
  if (unlabeled.length) {
    sections.push({ role: "", label: "", rows: buildFilledRows(unlabeled) });
  }

  return sections;
}
