export const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "inherit",
  "initial",
  "unset"
]);

export const STANDARD_FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

export const SYSTEM_FONTS = new Set([
  "arial",
  "helvetica",
  "helvetica neue",
  "times",
  "times new roman",
  "courier",
  "courier new",
  "georgia",
  "verdana",
  "tahoma",
  "trebuchet ms",
  "-apple-system",
  "blinkmacsystemfont",
  "segoe ui",
  "roboto",
  "oxygen",
  "ubuntu",
  "cantarell",
  "fira sans",
  "droid sans",
  "noto sans",
  "noto serif",
  "sans-serif",
  "apple color emoji",
  "segoe ui emoji",
  "segoe ui symbol"
]);

export function parseFontStack(fontFamily) {
  if (!fontFamily || typeof fontFamily !== "string") return [];
  return fontFamily
    .split(",")
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}

export function normalizeFontKey(family) {
  return (family || "").trim().toLowerCase();
}

export function isSystemFont(family) {
  return SYSTEM_FONTS.has(normalizeFontKey(family));
}

export function isGenericFamily(family) {
  return GENERIC_FAMILIES.has(normalizeFontKey(family));
}

export function isEmojiFont(family) {
  const key = normalizeFontKey(family);
  return /emoji/.test(key) || key === "apple color emoji" || key === "segoe ui emoji";
}

/**
 * Metric stand-ins (Framer "Inter Placeholder", next/font "Fredoka Fallback")
 * are not the design face — skip them when resolving / highlighting.
 */
export function isMetricPlaceholderFont(family) {
  const key = normalizeFontKey(family);
  return key.endsWith(" placeholder") || key.endsWith(" fallback");
}

export function resolvePrimaryFont(families) {
  if (!families.length) return "";
  for (const family of families) {
    if (isGenericFamily(family) || isMetricPlaceholderFont(family)) continue;
    return family;
  }
  for (const family of families) {
    if (!isGenericFamily(family)) return family;
  }
  return families[0];
}

/**
 * Resolve which face extraction/highlight should treat as "the" family for a
 * stack, given an availability predicate (canvas / fonts.check / test double).
 */
export function resolveRenderedFont(families, isFontAvailable) {
  if (!Array.isArray(families) || !families.length) return "";
  const available = typeof isFontAvailable === "function" ? isFontAvailable : () => true;
  for (const family of families) {
    if (isGenericFamily(family) || isMetricPlaceholderFont(family)) continue;
    if (available(family)) return family;
  }
  return resolvePrimaryFont(families);
}

/**
 * Whether a computed font stack should highlight for `targetKey`.
 * Keep in sync with `fontMatchesTarget` in `src/content/highlightFont.js`
 * (that file is injected standalone and cannot import this module).
 *
 * Matching rules:
 * - First available non-generic, non-placeholder face wins (same as resolveRenderedFont).
 * - An unavailable selected face matches only when no later design face
 *   is available — extraction's primary-fallback case (e.g. Helvetica Neue
 *   with no installed fallbacks). Mid-stack unavailable names must not match
 *   when a later face paints. Metric placeholders never count as the painter.
 */
export function fontStackMatchesTarget(stack, targetKey, isFontAvailable) {
  if (!Array.isArray(stack) || !stack.length || !targetKey) return false;
  const available = typeof isFontAvailable === "function" ? isFontAvailable : () => true;

  for (let i = 0; i < stack.length; i += 1) {
    const family = stack[i];
    if (isGenericFamily(family) || isMetricPlaceholderFont(family)) continue;
    const key = normalizeFontKey(family);
    if (available(family)) return key === targetKey;
    if (key === targetKey) {
      let laterAvailable = false;
      for (let j = i + 1; j < stack.length; j += 1) {
        const later = stack[j];
        if (isGenericFamily(later) || isMetricPlaceholderFont(later)) continue;
        if (available(later)) {
          laterAvailable = true;
          break;
        }
      }
      if (!laterAvailable) return true;
    }
  }

  return normalizeFontKey(resolveRenderedFont(stack, available)) === targetKey;
}

export function normalizeFontWeight(weight) {
  if (weight == null || weight === "") return 400;
  if (typeof weight === "number" && Number.isFinite(weight)) return weight;
  const value = String(weight).trim().toLowerCase();
  if (value === "normal") return 400;
  if (value === "bold") return 700;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 400;
}

export function snapFontWeight(weight) {
  const normalized = normalizeFontWeight(weight);
  let closest = 400;
  let minDistance = Infinity;

  for (const standard of STANDARD_FONT_WEIGHTS) {
    const distance = Math.abs(normalized - standard);
    if (distance < minDistance) {
      minDistance = distance;
      closest = standard;
    }
  }

  return closest;
}

export function formatWeightsList(weights) {
  if (!Array.isArray(weights) || !weights.length) return "";
  return [...weights].sort((a, b) => a - b).join(", ");
}

export function dominantFontWeight(weights) {
  if (!Array.isArray(weights) || !weights.length) return 400;
  return weights[Math.floor(weights.length / 2)];
}

/** Preview face weight: Medium (500) when present, else the lightest detected weight. */
export function previewFontWeight(weights, fallback = 400) {
  const list = Array.isArray(weights)
    ? weights.map((w) => normalizeFontWeight(w)).filter((w) => Number.isFinite(w))
    : [];
  if (!list.length) return normalizeFontWeight(fallback);
  if (list.includes(500)) return 500;
  return Math.min(...list);
}

export function formatFontWeight(weight) {
  const value = normalizeFontWeight(weight);
  if (value <= 350) return "Light";
  if (value <= 450) return "Regular";
  if (value <= 550) return "Medium";
  if (value <= 650) return "Semibold";
  return "Bold";
}

export function formatFontRole(role) {
  if (role === "primary") return "Primary";
  if (role === "secondary") return "Secondary";
  if (role === "tertiary") return "Tertiary";
  return role;
}
