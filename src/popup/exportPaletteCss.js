import { USAGE_ROLE_LABELS, USAGE_ROLE_ORDER, primaryUsageRole } from "../core/usageRoles.js";
import { formatExportTitle } from "./exportPaletteImage.js";

/**
 * Palette → CSS custom properties. Pure string output for preview + clipboard.
 * Names prefer usage roles (background / text / accent), then semantic roles.
 */

const SEMANTIC_ROLE_ORDER = ["foundation", "primary", "secondary", "accent", "neutral"];

const SEMANTIC_ROLE_LABELS = {
  foundation: "Foundation",
  primary: "Primary",
  secondary: "Secondary",
  accent: "Accent",
  neutral: "Neutral"
};

function normalizeHex(hex) {
  const raw = String(hex || "").trim();
  if (!/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) return "";
  if (raw.length === 4) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toUpperCase();
  }
  return raw.toUpperCase();
}

function slugToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function tokenBaseName(swatch) {
  const usage =
    swatch?.primaryUsageRole || primaryUsageRole(swatch?.usageRoles, swatch?.usage);
  if (usage && USAGE_ROLE_ORDER.includes(usage)) return usage;

  const role = slugToken(swatch?.role);
  if (role && SEMANTIC_ROLE_ORDER.includes(role)) return role;
  return "color";
}

function uniqueVarName(base, usedCounts) {
  const key = base || "color";
  const count = (usedCounts.get(key) || 0) + 1;
  usedCounts.set(key, count);
  return count === 1 ? `--color-${key}` : `--color-${key}-${count}`;
}

function commentForToken(base) {
  if (USAGE_ROLE_LABELS[base]) return USAGE_ROLE_LABELS[base];
  if (SEMANTIC_ROLE_LABELS[base]) return SEMANTIC_ROLE_LABELS[base];
  return null;
}

function uniqueSwatches(swatches) {
  const seen = new Set();
  const out = [];
  for (const swatch of Array.isArray(swatches) ? swatches : []) {
    const hex = normalizeHex(swatch?.hex);
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    out.push({ ...swatch, hex });
  }
  return out;
}

function sortSwatches(swatches) {
  return [...swatches].sort((a, b) => {
    const usageA =
      a.primaryUsageRole || primaryUsageRole(a.usageRoles, a.usage) || "";
    const usageB =
      b.primaryUsageRole || primaryUsageRole(b.usageRoles, b.usage) || "";
    const usageIdxA = USAGE_ROLE_ORDER.indexOf(usageA);
    const usageIdxB = USAGE_ROLE_ORDER.indexOf(usageB);
    const rankA = usageIdxA === -1 ? USAGE_ROLE_ORDER.length : usageIdxA;
    const rankB = usageIdxB === -1 ? USAGE_ROLE_ORDER.length : usageIdxB;
    if (rankA !== rankB) return rankA - rankB;

    const roleA = SEMANTIC_ROLE_ORDER.indexOf(slugToken(a.role));
    const roleB = SEMANTIC_ROLE_ORDER.indexOf(slugToken(b.role));
    const rA = roleA === -1 ? SEMANTIC_ROLE_ORDER.length : roleA;
    const rB = roleB === -1 ? SEMANTIC_ROLE_ORDER.length : roleB;
    if (rA !== rB) return rA - rB;
    return a.hex.localeCompare(b.hex);
  });
}

/** Prefer hostname (apple.com) so the file is clearly tied to the site. */
function cssSiteLabel(pageMeta = {}) {
  const hostname = String(pageMeta.hostname || "")
    .trim()
    .replace(/^www\./i, "");
  if (hostname) return hostname;
  const title = formatExportTitle(pageMeta);
  return title && title !== "Untitled page" ? title : "";
}

function buildCssFileHeader(pageMeta = {}) {
  const site = cssSiteLabel(pageMeta);
  const titleLine = site ? `/* CSS variables — ${site}` : "/* CSS variables";
  return [
    titleLine,
    " * Paste into your stylesheet to reuse this palette with var(--color-name).",
    " */"
  ];
}

/**
 * Build CSS custom-property block(s) for the palette.
 * @param {Array} swatches
 * @param {{ gradients?: Array<{ css?: string }>, pageMeta?: object }} [options]
 * @returns {string}
 */
export function buildPaletteCss(swatches, options = {}) {
  const palette = sortSwatches(uniqueSwatches(swatches));
  const gradients = (Array.isArray(options.gradients) ? options.gradients : []).filter(
    (g) => typeof g?.css === "string" && g.css.trim()
  );

  const lines = [...buildCssFileHeader(options.pageMeta || {}), "", ":root {"];
  const usedCounts = new Map();
  let lastComment = null;
  const rootStartIndex = lines.length - 1;

  for (const swatch of palette) {
    const base = tokenBaseName(swatch);
    const name = uniqueVarName(base, usedCounts);
    const comment = commentForToken(base);
    if (comment && comment !== lastComment) {
      if (lines.length > rootStartIndex + 1) lines.push("");
      lines.push(`  /* ${comment} */`);
      lastComment = comment;
    }
    lines.push(`  ${name}: ${swatch.hex};`);
  }

  if (gradients.length) {
    if (palette.length) lines.push("");
    lines.push("  /* Gradients */");
    gradients.forEach((gradient, index) => {
      const css = String(gradient.css).trim().replace(/\s+/g, " ");
      lines.push(`  --gradient-${index + 1}: ${css};`);
    });
  }

  if (lines.length === rootStartIndex + 1) {
    lines.push("  /* No colors yet */");
  }

  lines.push("}");
  return `${lines.join("\n")}\n`;
}

/**
 * Copy palette CSS to the clipboard.
 */
export async function copyPaletteCss(swatches, options = {}) {
  const css = buildPaletteCss(swatches, options);
  await navigator.clipboard.writeText(css);
  return css;
}
