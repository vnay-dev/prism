import { hexToRgb, isNeutralHsl, rgbToHsl } from "../core/colorLab.js";
import { normalizeUsageHex } from "../core/usageRoles.js";

/** Color results layout modes (toolbar segmented control). */
export const COLOR_VIEW_MODES = Object.freeze({
  ROLES: "roles",
  STACK: "stack"
});

export const COLOR_VIEW_ORDER = Object.freeze([
  COLOR_VIEW_MODES.ROLES,
  COLOR_VIEW_MODES.STACK
]);

export const COLOR_VIEW_META = Object.freeze({
  [COLOR_VIEW_MODES.ROLES]: {
    label: "Organized",
    title: "Organized by role",
    icon: "grid_view"
  },
  [COLOR_VIEW_MODES.STACK]: {
    label: "Stack",
    title: "Stack view",
    icon: "view_agenda"
  }
});

/** Hue-family size for tonal ramps inside the color wheel. */
const HUE_FAMILY_DEG = 45;

export function normalizeColorViewMode(value) {
  const mode = String(value || "").toLowerCase();
  return COLOR_VIEW_ORDER.includes(mode) ? mode : COLOR_VIEW_MODES.ROLES;
}

function swatchColorKey(swatch) {
  return (
    normalizeUsageHex(swatch?.hex) ||
    normalizeUsageHex(swatch?.rgb) ||
    String(swatch?.hex || "").toLowerCase()
  );
}

/** Unique colors in curated order — no role grouping. */
export function flattenUniqueSwatches(swatches) {
  const list = Array.isArray(swatches) ? swatches : [];
  const seen = new Set();
  const out = [];
  for (const swatch of list) {
    const key = swatchColorKey(swatch);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(swatch);
  }
  return out;
}

function swatchHsl(swatch) {
  if (swatch?.hsl && Number.isFinite(swatch.hsl.h)) return swatch.hsl;
  const rgb = swatch?.rgb || hexToRgb(swatch?.hex);
  return rgb ? rgbToHsl(rgb) : { h: 0, s: 0, l: 50 };
}

/** Near-greys must not puncture the hue spectrum in stack order. */
function isStackNeutral(hsl) {
  if (!hsl) return true;
  if (isNeutralHsl(hsl)) return true;
  return (hsl.s || 0) <= 24;
}

function hueFamily(h) {
  const hue = ((Number(h) || 0) % 360 + 360) % 360;
  return Math.floor(hue / HUE_FAMILY_DEG);
}

/**
 * Palette-style progression for stack view:
 * 1. Chromatic colors around the wheel (hue families ascending)
 * 2. Within each family, light → dark tonal ramp
 * 3. Neutrals after the spectrum, light → dark
 */
export function sortSwatchesByColorWheel(swatches) {
  const list = Array.isArray(swatches) ? [...swatches] : [];
  return list.sort((a, b) => {
    const aHsl = swatchHsl(a);
    const bHsl = swatchHsl(b);
    const aNeutral = isStackNeutral(aHsl);
    const bNeutral = isStackNeutral(bHsl);

    if (aNeutral !== bNeutral) return aNeutral ? 1 : -1;

    if (!aNeutral && !bNeutral) {
      const aFamily = hueFamily(aHsl.h);
      const bFamily = hueFamily(bHsl.h);
      if (aFamily !== bFamily) return aFamily - bFamily;
      // Clear lightness steps → tonal ramp; close lightness → keep wheel hue order.
      if (Math.abs(aHsl.l - bHsl.l) > 8) return bHsl.l - aHsl.l;
      if (aHsl.h !== bHsl.h) return aHsl.h - bHsl.h;
      if (aHsl.l !== bHsl.l) return bHsl.l - aHsl.l;
      if (aHsl.s !== bHsl.s) return bHsl.s - aHsl.s;
      return String(a.hex || "").localeCompare(String(b.hex || ""));
    }

    if (aHsl.l !== bHsl.l) return bHsl.l - aHsl.l;
    return String(a.hex || "").localeCompare(String(b.hex || ""));
  });
}

/**
 * Stack view: full-width bars in a color-wheel / tonal progression.
 */
export function buildStackLayout(swatches) {
  return sortSwatchesByColorWheel(flattenUniqueSwatches(swatches)).map((swatch) => ({
    swatch,
    flexGrow: 1
  }));
}
