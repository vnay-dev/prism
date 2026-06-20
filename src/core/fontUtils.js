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

export function resolvePrimaryFont(families) {
  if (!families.length) return "";
  for (const family of families) {
    if (!GENERIC_FAMILIES.has(family.toLowerCase())) return family;
  }
  return families[0];
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
