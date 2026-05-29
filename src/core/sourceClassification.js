/** Source categories and brand weights for design-system palette extraction. */

export const SOURCE_WEIGHT = {
  hero_cta: 10,
  primary_button: 9,
  navigation: 8,
  global_background: 8,
  hero_background: 8,
  logo: 8,
  repeated_section_bg: 7,
  major_container: 6,
  illustration: 5,
  card: 4,
  promo_content: 2,
  blog_card: 2,
  marketing_banner: 2,
  dynamic_content: 2,
  success_state: 1,
  warning_state: 1,
  error_state: 1,
  alert: 1,
  notification: 1,
  status_chip: 1,
  chart: 1,
  syntax_highlight: 0.5,
  demo_navigation: 1,
  demo_sidebar: 1,
  demo_status: 1,
  demo_illustration: 2,
  default: 3
};

export const UTILITY_SOURCES = new Set([
  "success_state",
  "warning_state",
  "error_state",
  "alert",
  "notification",
  "status_chip",
  "chart",
  "syntax_highlight",
  "demo_navigation",
  "demo_sidebar",
  "demo_status"
]);

export const DEMO_SOURCES = new Set([
  "demo_navigation",
  "demo_sidebar",
  "demo_status",
  "demo_illustration"
]);

export const BRAND_SOURCES = new Set([
  "hero_cta",
  "primary_button",
  "navigation",
  "global_background",
  "hero_background",
  "repeated_section_bg",
  "major_container",
  "illustration",
  "logo"
]);

const PRODUCT_DEMO_SELECTOR = [
  '[class*="IssueView" i]',
  '[class*="SlackIssue" i]',
  '[class*="Plan_" i]',
  '[class*="Monitor_" i]',
  '[class*="Build_cmdk" i]',
  '[class*="Build_blink" i]',
  '[class*="page_panel" i]',
  '[class*="Sidebar_navItem" i]',
  '[class*="Sidebar_navItems" i]',
  '[class*="Sidebar_sidebar" i]',
  '[class*="mock" i]',
  '[class*="preview" i]',
  '[class*="screenshot" i]',
  '[class*="product-demo" i]',
  '[class*="browser-window" i]',
  '[class*="device-frame" i]',
  '[class*="kanban" i]',
  '[class*="timelineContent" i]',
  '[class*="chatBox" i]',
  '[class*="agentChart" i]',
  '[class*="initiativesBox" i]'
].join(", ");

export function isInsideProductDemo(el) {
  if (!el?.closest) return false;
  return !!el.closest(PRODUCT_DEMO_SELECTOR);
}

/** @returns {"website_chrome"|"product_demo"|"page_content"} */
export function detectContentZone(el) {
  if (isInsideProductDemo(el)) return "product_demo";

  const siteHeader = el.closest("header");
  if (siteHeader && !isInsideProductDemo(siteHeader)) return "website_chrome";

  const siteNav = el.closest('nav, [role="navigation"]');
  if (siteNav && !isInsideProductDemo(siteNav)) return "website_chrome";

  if (el.closest("footer") && !isInsideProductDemo(el.closest("footer"))) return "website_chrome";

  const marketingHero = el.closest('[class*="Hero_" i], [id*="hero" i]');
  if (marketingHero && !isInsideProductDemo(marketingHero)) return "website_chrome";

  return "page_content";
}

export function weightForSource(source) {
  return SOURCE_WEIGHT[source] || SOURCE_WEIGHT.default;
}

export function isUtilitySource(source) {
  return UTILITY_SOURCES.has(source);
}

export function isDemoSource(source) {
  return DEMO_SOURCES.has(source);
}

export function isBrandSource(source) {
  return BRAND_SOURCES.has(source);
}

export function isWebsiteChromeNav(source) {
  return source === "navigation";
}

function isStatusLike(blob, context) {
  if (
    /success|positive|complete|verified|passed|done/.test(blob) &&
    /badge|tag|chip|pill|status|toast|alert|banner|label|dot/.test(blob)
  ) {
    return true;
  }
  if (
    /warning|caution|pending|attention|at risk|risk/.test(blob) &&
    /badge|tag|chip|pill|status|toast|alert|banner|label|dot/.test(blob)
  ) {
    return true;
  }
  if (
    /error|danger|fail|invalid|destructive/.test(blob) &&
    /badge|tag|chip|pill|status|toast|alert|banner|label|dot/.test(blob)
  ) {
    return true;
  }
  if (/labeldot|status|badge|chip|pill/.test(blob)) return true;
  if (context === "icon" && /sidebar|navitem|nav-item/.test(blob)) return true;
  return false;
}

export function aggregateSourceStats(samples) {
  const counts = {};
  let brandWeighted = 0;
  let utilityWeighted = 0;
  let totalWeighted = 0;
  let hasHero = false;
  let hasCta = false;
  let hasNav = false;

  for (const s of samples) {
    const src = s.sourceCategory || "default";
    counts[src] = (counts[src] || 0) + 1;
    const w = weightForSource(src);
    const contribution = (s.importance || 1) * w;
    brandWeighted += contribution;
    totalWeighted += contribution;
    if (isUtilitySource(src) || isDemoSource(src)) utilityWeighted += contribution;
    if (src === "hero_background" || src === "hero_cta") hasHero = true;
    if (src === "hero_cta" || src === "primary_button") hasCta = true;
    if (isWebsiteChromeNav(src)) hasNav = true;
  }

  return {
    sourceCounts: counts,
    brandWeightedImportance: brandWeighted,
    utilityRatio: totalWeighted > 0 ? utilityWeighted / totalWeighted : 0,
    hasHero,
    hasCta,
    hasNav
  };
}

export function isUtilityColor(sourceCounts, utilityRatio) {
  if (utilityRatio >= 0.55) return true;
  const utilityOccurrences = Object.entries(sourceCounts || {}).reduce(
    (sum, [src, n]) => sum + (isUtilitySource(src) || isDemoSource(src) ? n : 0),
    0
  );
  const total = Object.values(sourceCounts || {}).reduce((a, b) => a + b, 0);
  return total > 0 && utilityOccurrences / total >= 0.6;
}

/** Minimum brandConfidence to exempt a cluster from utility classification. */
export const BRAND_EVIDENCE_UTILITY_OVERRIDE_CONFIDENCE = 0.15;

export function hasStrongBrandEvidence(cluster, sectionCount) {
  if (cluster.hasHero) return true;
  if (cluster.hasNav) return true;
  if ((cluster.sourceCounts?.logo || 0) > 0) return true;
  if (brandConfidence(cluster, sectionCount) > BRAND_EVIDENCE_UTILITY_OVERRIDE_CONFIDENCE) {
    return true;
  }
  return false;
}

export function classifyClusterUtility(cluster, sectionCount) {
  if (hasStrongBrandEvidence(cluster, sectionCount)) return false;
  return isUtilityColor(cluster.sourceCounts, cluster.utilityRatio);
}

export function brandConfidence(cluster, sectionCount) {
  const sectionCoverage = (cluster.sectionIds?.size || 0) / Math.max(sectionCount, 1);
  const contextDiversity = (cluster.contexts?.size || 0) / 6;
  const hero = cluster.hasHero ? 1 : 0;
  const cta = cluster.hasCta ? 1 : 0;
  const nav = cluster.hasNav ? 1 : 0;

  return hero * 0.25 + cta * 0.25 + nav * 0.2 + sectionCoverage * 0.2 + contextDiversity * 0.1;
}

export function designSystemScore(cluster, maxima, sectionCount) {
  const confidence = brandConfidence(cluster, sectionCount);
  const brandSignal = maxima.brandImportance > 0 ? cluster.brandWeightedImportance / maxima.brandImportance : 0;
  const sectionCoverage = (cluster.sectionIds?.size || 0) / Math.max(sectionCount, 1);
  const area = maxima.area > 0 ? cluster.totalArea / maxima.area : 0;
  const utilityPenalty = cluster.isUtility ? 0.15 : cluster.utilityRatio > 0.35 ? 0.5 : 1;

  return (
    (confidence * 0.45 + brandSignal * 0.35 + sectionCoverage * 0.12 + area * 0.08) * utilityPenalty
  );
}

/** Classify from DOM-like signals (used in tests and mirrored in extractInPage.js). */
export function classifySourceFromSignals({
  tagName = "",
  classText = "",
  idText = "",
  ariaLabel = "",
  role = "",
  context = "",
  prop = "",
  sectionIndex = 0,
  inHero = false,
  inNav = false,
  inHeader = false,
  inFooter = false,
  isSyntax = false,
  isChart = false,
  contentZone = "page_content",
  text = ""
}) {
  const blob = `${classText} ${idText} ${ariaLabel} ${text}`.toLowerCase();
  const tag = tagName.toUpperCase();
  const chromeHero = contentZone === "website_chrome" && inHero;

  if (isSyntax) return "syntax_highlight";
  if (isChart || /chart|graph|recharts|d3|plot|visualization|sparkline/.test(blob)) return "chart";

  if (contentZone === "product_demo") {
    if (inNav || role === "navigation" || tag === "NAV" || /sidebar|navitem|nav-item/.test(blob)) {
      if (isStatusLike(blob, context)) return "demo_status";
      if (/sidebar/.test(blob)) return "demo_sidebar";
      return "demo_navigation";
    }
    if (isStatusLike(blob, context)) return "demo_status";
    if (context === "icon" || tag === "SVG") return "demo_illustration";
    if (prop === "backgroundColor" || context === "surface") return "demo_illustration";
    return "default";
  }

  if (/success|positive|complete|verified|passed|done/.test(blob) && /badge|tag|chip|pill|status|toast|alert|banner|label/.test(blob)) {
    return "success_state";
  }
  if (/warning|caution|pending|attention/.test(blob) && /badge|tag|chip|pill|status|toast|alert|banner|label/.test(blob)) {
    return "warning_state";
  }
  if (/error|danger|fail|invalid|destructive/.test(blob) && /badge|tag|chip|pill|status|toast|alert|banner|label/.test(blob)) {
    return "error_state";
  }
  if (/alert|toast|notification|snackbar/.test(blob)) return "alert";
  if (/badge|chip|pill|status|tag-label/.test(blob)) return "status_chip";

  if (/promo|promotion|offer|sale|campaign|advert/.test(blob)) return "promo_content";
  if (/blog|article|post-card|newsletter/.test(blob)) return "blog_card";
  if (/banner|billboard|hero-ad/.test(blob)) return "marketing_banner";

  if (inNav || role === "navigation" || tag === "NAV") return "navigation";
  if (/logo|brand-mark|wordmark/.test(blob) || (tag === "SVG" && inHeader)) return "logo";

  if (chromeHero) {
    if (context === "button" || tag === "BUTTON" || role === "button") return "hero_cta";
    if (prop === "backgroundColor" || context === "surface") return "hero_background";
  }

  if (context === "button" || tag === "BUTTON" || role === "button") return "primary_button";
  if (inHeader && (prop === "backgroundColor" || context === "surface")) return "global_background";
  if (sectionIndex === 0 && (prop === "backgroundColor" || context === "surface") && /body|html|main|app|root|page/.test(blob)) {
    return "global_background";
  }
  if (prop === "backgroundColor" || context === "surface") {
    if (/section|container|wrapper|layout|shell|page/.test(blob)) return "repeated_section_bg";
    if (tag === "MAIN" || tag === "SECTION" || tag === "ARTICLE") return "repeated_section_bg";
    return "major_container";
  }

  if (context === "icon" || tag === "SVG") return "illustration";
  if (/card|tile|feature/.test(blob)) return "card";

  return "default";
}
