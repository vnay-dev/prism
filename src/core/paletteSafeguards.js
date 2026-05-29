import { isNeutralHsl, rgbToHsl } from "./colorLab.js";

export const FOUNDATION_SURFACE_SOURCES = new Set([
  "global_background",
  "hero_background",
  "repeated_section_bg",
  "major_container"
]);

export const BROWSER_DEFAULT_LINK_COLORS = new Set(["#0000ee", "#0000ff"]);

const BRAND_EVIDENCE_SOURCES = new Set([
  "hero_cta",
  "primary_button",
  "hero_background",
  "global_background",
  "logo"
]);

export function contributesFoundationArea(sample) {
  const src = sample.sourceCategory || "default";
  if (!FOUNDATION_SURFACE_SOURCES.has(src)) return false;
  if (sample.areaSourceType === "Background") return true;
  if (!sample.areaSourceType && sample.context === "surface") return true;
  return false;
}

export function isSvgAreaSample(sample) {
  const type = sample.areaSourceType || "";
  return type === "SVG Fill" || type === "SVG Stroke";
}

export function isBrowserDefaultLinkColor(entry) {
  const hex = (entry?.hex || "").toLowerCase();
  if (!BROWSER_DEFAULT_LINK_COLORS.has(hex)) return false;
  return !hasExplicitBrandEvidence(entry);
}

export function hasExplicitBrandEvidence(entry) {
  const counts = entry?.sourceCounts || {};
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  if (!total) return false;

  const brandHits = Object.entries(counts).reduce(
    (sum, [src, n]) => sum + (BRAND_EVIDENCE_SOURCES.has(src) ? n : 0),
    0
  );
  if (brandHits / total >= 0.35) return true;
  if ((entry.sectionCoverage || 0) >= 4 && brandHits >= 3) return true;
  if (entry.hasCta && brandHits >= 2) return true;
  return false;
}

export function stripBrowserDefaultLinks(entries) {
  return entries.filter((entry) => !isBrowserDefaultLinkColor(entry));
}

export function attachFoundationAreaShare(entries, totalFoundationArea) {
  const denom = Math.max(totalFoundationArea, 1);
  return entries.map((entry) => ({
    ...entry,
    foundationAreaShare: (entry.foundationArea || 0) / denom
  }));
}

export function inferLegacySampleFields(sample, index) {
  const hsl = sample.hsl || rgbToHsl(sample.rgb);
  const context = sample.context || "surface";
  const isSurface = context === "surface";
  let sourceCategory = sample.sourceCategory;
  if (!sourceCategory) {
    if (isSurface && isNeutralHsl(hsl)) {
      sourceCategory = index === 0 ? "global_background" : "repeated_section_bg";
    } else {
      sourceCategory = index < 2 ? "hero_cta" : index < 4 ? "repeated_section_bg" : "default";
    }
  }
  const areaSourceType =
    sample.areaSourceType ||
    (isSurface ? "Background" : context === "text" ? "Text" : context === "border" ? "Border" : "Background");
  return { ...sample, hsl, sourceCategory, context, areaSourceType };
}
