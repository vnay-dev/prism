/**
 * Shared palette layout logic.
 * Both the popup UI (renderSwatches) and the exported PNG (renderPalettePng)
 * use this so the copied image matches exactly what the user sees on screen.
 */

export const ROLE_ORDER = ["foundation", "primary", "secondary", "accent", "neutral"];

export const HERO_HEIGHT = 100;
export const ROW_HEIGHT = HERO_HEIGHT / 2;

// Geometry mirrored from styles.css (.app padding, .swatches/.bento-row gap,
// .swatch border-radius, .swatch-light edge).
export const APP_PADDING = 16;
export const CONTENT_WIDTH = 348; // 380px panel − 16px padding on each side
export const BENTO_GAP = 6;
export const TILE_RADIUS = 6;
export const LIGHT_BORDER_COLOR = "#e4e7ee";

export function isLightSwatch(hex) {
  const value = String(hex || "").replace("#", "");
  if (value.length !== 6) return false;
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  if (![r, g, b].every((n) => Number.isFinite(n))) return false;
  // Near-white tiles disappear on the #fefefe panel; edge them for contrast.
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance >= 0.9;
}

/** True when a swatch is dark enough that light chrome needs a visible edge. */
export function isDarkSwatch(hex) {
  const value = String(hex || "").replace("#", "");
  if (value.length !== 6) return false;
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 0.28;
}

export function buildBentoRows(swatches) {
  const byRole = {};
  for (const role of ROLE_ORDER) byRole[role] = swatches.filter((s) => s.role === role);

  const rows = [];

  if (byRole.foundation.length) {
    rows.push({ tiles: byRole.foundation, height: HERO_HEIGHT });
  }

  if (byRole.primary.length) {
    rows.push({ tiles: byRole.primary, height: HERO_HEIGHT });
  }

  const loneTiles = [];
  for (const role of ROLE_ORDER.filter((r) => r !== "foundation" && r !== "primary")) {
    const tiles = byRole[role];
    if (tiles.length >= 2) {
      rows.push({ tiles, height: ROW_HEIGHT });
    } else if (tiles.length === 1) {
      loneTiles.push(tiles[0]);
    }
  }

  for (let i = 0; i < loneTiles.length; i += 4) {
    rows.push({ tiles: loneTiles.slice(i, i + 4), height: ROW_HEIGHT });
  }

  return rows;
}
