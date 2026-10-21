import { isDemoSource, isUtilitySource } from "./sourceClassification.js";

/** Usage labels shown on swatches. A color can carry more than one. */
export const USAGE_ROLE_ORDER = ["background", "text", "accent"];

export const USAGE_ROLE_LABELS = {
  background: "Background",
  text: "Text",
  accent: "Accent"
};

const PAGE_SURFACE_SOURCES = new Set([
  "global_background",
  "hero_background",
  "repeated_section_bg",
  "major_container",
  "navigation"
]);

const CTA_SOURCES = new Set(["hero_cta", "primary_button"]);

const BACKGROUND_SHARE = 0.22;
const TEXT_SHARE = 0.22;
const ACCENT_SHARE = 0.2;
const ACCENT_CTA_SHARE = 0.15;
const DOMINANT_SHARE = 0.5;
/** Share of all measured page/card surface area. Filters out tiny mislabeled patches. */
const SURFACE_PAGE_SHARE = 0.05;

function paintKind(sample) {
  const areaType = sample.areaSourceType || "";
  const context = sample.context || "";
  if (areaType === "Text") return "text";
  if (areaType === "Background") return "background";
  if (areaType === "Border" || areaType === "SVG Fill" || areaType === "SVG Stroke") return "other";
  if (context === "text" || context === "heading") return "text";
  if (context === "surface") return "background";
  if (context === "button" || context === "link") return "interactive";
  return "other";
}

/**
 * Which usage roles a single measured sample supports.
 * Signals come from where the color was painted (element role and CSS property),
 * never from hue, saturation, or lightness.
 */
export function usageSignals(sample) {
  const none = {
    background: false,
    backgroundPage: false,
    backgroundCard: false,
    text: false,
    accent: false,
    accentCta: false
  };
  if (!sample) return none;

  const src = sample.sourceCategory || "";
  if (isUtilitySource(src) || isDemoSource(src)) return none;

  const context = sample.context || "";
  const paint = paintKind(sample);
  const isButton = context === "button" || CTA_SOURCES.has(src);
  const isLink = context === "link";
  const signals = { ...none };

  if (paint === "text") signals.text = true;

  if (paint === "background" && !isButton && !isLink) {
    if (PAGE_SURFACE_SOURCES.has(src)) {
      signals.background = true;
      signals.backgroundPage = true;
    } else if (src === "card") {
      signals.background = true;
      signals.backgroundCard = true;
    }
  }

  if ((isButton || isLink) && (paint === "background" || paint === "text" || paint === "interactive")) {
    signals.accent = true;
    // Button and link labels that reuse the body text color are not accents.
    // Fills and otherwise unclassified interactive colors are.
    if ((isButton || CTA_SOURCES.has(src)) && paint !== "text") signals.accentCta = true;
  }

  return signals;
}

export function emptyUsage() {
  return {
    background: { area: 0, count: 0, pageCount: 0, cardCount: 0 },
    text: { area: 0, count: 0 },
    accent: { area: 0, count: 0, ctaCount: 0 },
    loose: { background: 0, text: 0, accent: 0 },
    total: { area: 0, count: 0 }
  };
}

export function snapshotUsage(usage) {
  const source = usage || emptyUsage();
  return {
    background: { ...emptyUsage().background, ...source.background },
    text: { ...emptyUsage().text, ...source.text },
    accent: { ...emptyUsage().accent, ...source.accent },
    loose: { ...emptyUsage().loose, ...source.loose },
    total: { ...emptyUsage().total, ...source.total }
  };
}

function hasObservedUsage(sample) {
  if (sample?.observedUsage === false) return false;
  return Boolean(sample?.context || sample?.sourceCategory || sample?.areaSourceType);
}

/**
 * Best single role for a color that did not clear the stronger evidence bar.
 * Still based on where the color was painted, including smaller or utility uses,
 * so a curated swatch is not left blank.
 */
function looseRole(sample) {
  const src = sample.sourceCategory || "";
  const context = sample.context || "";
  const paint = paintKind(sample);
  const isButton = context === "button" || CTA_SOURCES.has(src);
  const isLink = context === "link";
  const utility = isUtilitySource(src) || isDemoSource(src);

  if (utility) {
    return paint === "text" || context === "text" || context === "heading" ? "text" : "accent";
  }
  if (paint === "text" || context === "text" || context === "heading") return "text";
  if (isButton || isLink) return "accent";
  if (paint === "background" || context === "surface") return "background";
  if (context === "icon" || paint === "other") return "accent";
  return null;
}

/** Fold one sample into a cluster's usage totals. Selection scoring does not read this. */
export function addSampleUsage(usage, sample) {
  const area = Number(sample?.area) || 0;
  usage.total.area += area;
  usage.total.count += 1;
  if (!usage.loose) usage.loose = { background: 0, text: 0, accent: 0 };
  if (!hasObservedUsage(sample)) return usage;

  const loose = looseRole(sample);
  if (loose) usage.loose[loose] += area;

  const signals = usageSignals(sample);
  if (signals.background) {
    usage.background.area += area;
    usage.background.count += 1;
    if (signals.backgroundPage) usage.background.pageCount += 1;
    if (signals.backgroundCard) usage.background.cardCount += 1;
  }
  if (signals.text) {
    usage.text.area += area;
    usage.text.count += 1;
  }
  if (signals.accent) {
    usage.accent.area += area;
    usage.accent.count += 1;
    if (signals.accentCta) usage.accent.ctaCount += 1;
  }
  return usage;
}

/**
 * Labels with enough measured area to be worth showing.
 * Returns role ids in scan order: background, text, accent.
 */
export function labelsFromUsage(usage) {
  const total = usage?.total?.area || 0;
  if (total <= 0) return [];

  const share = (area) => (area || 0) / total;
  const labels = [];

  const backgroundShare = share(usage.background?.area);
  const pageCount = usage.background?.pageCount || 0;
  const cardCount = usage.background?.cardCount || 0;
  const pageShare = usage.background?.pageShare;
  const majorSurface = pageShare == null || pageShare >= SURFACE_PAGE_SHARE;
  if (backgroundShare >= BACKGROUND_SHARE && majorSurface && (pageCount >= 1 || cardCount >= 2)) {
    labels.push("background");
  }

  const textShare = share(usage.text?.area);
  const textCount = usage.text?.count || 0;
  if (textShare >= TEXT_SHARE && (textCount >= 2 || textShare >= DOMINANT_SHARE)) {
    labels.push("text");
  }

  const accentShare = share(usage.accent?.area);
  const accentCount = usage.accent?.count || 0;
  const ctaCount = usage.accent?.ctaCount || 0;
  const accentEvident =
    (ctaCount >= 1 && accentShare >= ACCENT_CTA_SHARE) ||
    (accentCount >= 2 && accentShare >= ACCENT_SHARE) ||
    (accentCount >= 1 && accentShare >= DOMINANT_SHARE);
  if (accentEvident) labels.push("accent");
  if (labels.length) return labels;

  const loose = usage.loose || {};
  const best = USAGE_ROLE_ORDER.map((role) => ({ role, area: loose[role] || 0 })).sort(
    (a, b) => b.area - a.area || USAGE_ROLE_ORDER.indexOf(a.role) - USAGE_ROLE_ORDER.indexOf(b.role)
  )[0];
  return best?.area > 0 ? [best.role] : [];
}

export function usageRoleLabels(roles) {
  const present = new Set(roles || []);
  return USAGE_ROLE_ORDER.filter((role) => present.has(role)).map((role) => USAGE_ROLE_LABELS[role]);
}
