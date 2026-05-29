/**
 * Benchmark comparison after utility override — analysis only.
 * Usage: node scripts/utility-override-benchmark-comparison.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { curatePalette } from "../src/core/scoreAndCluster.js";
import { assignRoles } from "../src/core/assignRoles.js";
import { rgbToLab, deltaE, rgbToHsl, isNeutralHsl } from "../src/core/colorLab.js";
import {
  brandConfidence,
  classifyClusterUtility,
  isDemoSource,
  isUtilityColor,
  isUtilitySource,
  weightForSource
} from "../src/core/sourceClassification.js";

const SITES = [
  "linear",
  "stripe",
  "spotify",
  "vercel",
  "notion",
  "framer",
  "apple",
  "netflix",
  "slack"
];

const KNOWN_BRAND = {
  linear: { primary: "#5e6ad2", foundation: "#08090a" },
  stripe: { primary: "#533afd", foundation: "#ffffff" },
  spotify: { primary: "#1ed760", foundation: "#121212" },
  vercel: { primary: "#00dc82", foundation: "#fafafa" },
  notion: { primary: "#0075de", foundation: "#f6f5f4" },
  framer: { primary: "#0099ff", foundation: "#000000" },
  apple: { primary: "#0071e3", foundation: "#ffffff" },
  netflix: { primary: "#e50914", foundation: "#000000" },
  slack: { primary: "#611f69", foundation: "#f9edff" }
};

const BROWSER_LINK = new Set(["#0000ee", "#0000ff"]);

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function paletteFromReport(report, siteName) {
  const r = report.reports.find((x) => x.site.toLowerCase() === siteName.toLowerCase());
  if (!r) return null;
  const roles = {};
  for (const s of r.finalPalette || []) roles[s.role] = roles[s.role] ? [...(Array.isArray(roles[s.role]) ? roles[s.role] : [roles[s.role]]), s.hex] : s.hex;
  const secondaries = (r.finalPalette || []).filter((s) => s.role === "secondary").map((s) => s.hex);
  return {
    site: r.site,
    foundation: (r.finalPalette || []).find((s) => s.role === "foundation")?.hex,
    primary: (r.finalPalette || []).find((s) => s.role === "primary")?.hex,
    secondaries,
    full: (r.finalPalette || []).map((s) => ({ role: s.role, hex: s.hex, bc: s.brandConfidence, score: s.score }))
  };
}

function flattenSecondaries(sec) {
  return Array.isArray(sec) ? sec : sec ? [sec] : [];
}

function getChromaClusters(extraction) {
  const sectionCount = extraction.sectionCount || 1;
  const samples = extraction.samples.map((s) => ({
    ...s,
    hsl: s.hsl || rgbToHsl(s.rgb),
    importance: s.importance ?? (s.rawImportance || 1) * weightForSource(s.sourceCategory || "default")
  }));
  const chromatics = samples.filter((s) => !isNeutralHsl(s.hsl));
  const clusters = [];
  for (const sample of chromatics) {
    const lab = rgbToLab(sample.rgb);
    let best = null;
    let bestDist = 8;
    for (const cluster of clusters) {
      const dist = deltaE(lab, cluster.lab);
      if (dist < bestDist) {
        bestDist = dist;
        best = cluster;
      }
    }
    if (best) {
      best.totalArea += sample.area;
      best.occurrences += 1;
      best.sectionIds.add(sample.sectionId);
      best.contexts.add(sample.context);
      best.brandWeightedImportance += sample.importance || 0;
      const src = sample.sourceCategory || "default";
      best.sourceCounts[src] = (best.sourceCounts[src] || 0) + 1;
      if (src === "hero_background" || src === "hero_cta") best.hasHero = true;
      if (src === "hero_cta" || src === "primary_button") best.hasCta = true;
      if (src === "navigation") best.hasNav = true;
      best.memberHexes.add(sample.hex);
    } else {
      const src = sample.sourceCategory || "default";
      clusters.push({
        lab,
        representative: sample,
        totalArea: sample.area,
        brandWeightedImportance: sample.importance || 0,
        occurrences: 1,
        sectionIds: new Set([sample.sectionId]),
        contexts: new Set([sample.context]),
        sourceCounts: { [src]: 1 },
        hasHero: src === "hero_background" || src === "hero_cta",
        hasCta: src === "hero_cta" || src === "primary_button",
        hasNav: src === "navigation",
        memberHexes: new Set([sample.hex])
      });
    }
  }
  for (const c of clusters) {
    const utilityWeighted = Object.entries(c.sourceCounts).reduce(
      (sum, [src, n]) => sum + (isUtilitySource(src) ? n * weightForSource(src) : 0),
      0
    );
    const totalSourceWeight = Object.entries(c.sourceCounts).reduce(
      (sum, [src, n]) => sum + n * weightForSource(src),
      0
    );
    c.utilityRatio = totalSourceWeight > 0 ? utilityWeighted / totalSourceWeight : 0;
    c.wasUtility = isUtilityColor(c.sourceCounts, c.utilityRatio);
    c.isUtility = classifyClusterUtility(c, sectionCount);
    c.brandConfidence = brandConfidence(c, sectionCount);
    c.hex = c.representative.hex;
  }
  return clusters;
}

function detectUtilityPromotions(extraction, beforePalette, afterPalette) {
  const clusters = getChromaClusters(extraction);
  const newlyNonUtility = clusters.filter((c) => c.wasUtility && !c.isUtility);
  const beforeHexes = new Set((beforePalette?.full || []).map((s) => s.hex));
  const afterHexes = new Set((afterPalette?.full || []).map((s) => s.hex));

  const promoted = newlyNonUtility
    .filter((c) => afterHexes.has(c.hex) && !beforeHexes.has(c.hex))
    .map((c) => ({
      hex: c.hex,
      brandConfidence: +c.brandConfidence.toFixed(3),
      hasHero: c.hasHero,
      hasNav: c.hasNav,
      sourceCounts: c.sourceCounts,
      reason: c.hasHero
        ? "hasHero override"
        : c.hasNav
          ? "hasNav override"
          : (c.sourceCounts?.logo || 0) > 0
            ? "logo override"
            : "brandConfidence override"
    }));

  const incorrectlyPromoted = promoted.filter((c) => {
    const demoShare =
      Object.entries(c.sourceCounts).reduce(
        (sum, [src, n]) => sum + (isUtilitySource(src) || isDemoSource(src) ? n : 0),
        0
      ) / Object.values(c.sourceCounts).reduce((a, b) => a + b, 0);
    return demoShare >= 0.5 && !c.hasHero && c.brandConfidence < 0.2;
  });

  return { promoted, incorrectlyPromoted, newlyNonUtilityCount: newlyNonUtility.length };
}

function scoreSite(slug, palette) {
  const brand = KNOWN_BRAND[slug];
  let brandScore = 5;
  let usefulScore = 5;

  if (!palette.primary && brand.primary) {
    brandScore = 2;
    usefulScore = 3;
  } else {
    if (palette.foundation?.toLowerCase() === brand.foundation?.toLowerCase()) brandScore += 2;
    else if (palette.foundation === "#000000" && brand.foundation !== "#000000") brandScore -= 2;

    if (palette.primary?.toLowerCase() === brand.primary?.toLowerCase()) brandScore += 3;
    else if (BROWSER_LINK.has((palette.primary || "").toLowerCase())) brandScore -= 3;
    else if (palette.primary && brand.primary) brandScore += 0;

    const hasChroma = palette.full.some((s) => s.role === "primary" && s.hex);
    if (hasChroma) usefulScore += 2;
    if (palette.full.length >= 6) usefulScore += 1;
    if (palette.foundation) usefulScore += 1;
    if (BROWSER_LINK.has((palette.primary || "").toLowerCase())) usefulScore -= 2;
  }

  brandScore = Math.max(0, Math.min(10, brandScore));
  usefulScore = Math.max(0, Math.min(10, usefulScore));
  return { brandScore, usefulScore };
}

function compareSite(slug, before, after, promotions) {
  const beforeP = paletteFromReport(before, slug.charAt(0).toUpperCase() + slug.slice(1));
  const afterP = paletteFromReport(after, slug.charAt(0).toUpperCase() + slug.slice(1));
  const bScore = scoreSite(slug, beforeP);
  const aScore = scoreSite(slug, afterP);
  const delta = aScore.brandScore - bScore.brandScore + (aScore.usefulScore - bScore.usefulScore);

  let status = "unchanged";
  if (aScore.brandScore > bScore.brandScore || aScore.usefulScore > bScore.usefulScore) {
    if (aScore.brandScore < bScore.brandScore || aScore.usefulScore < bScore.usefulScore) status = "mixed";
    else status = "improved";
  } else if (aScore.brandScore < bScore.brandScore || aScore.usefulScore < bScore.usefulScore) {
    status = "regressed";
  }

  const primaryChanged = beforeP?.primary !== afterP?.primary;
  const foundationChanged = beforeP?.foundation !== afterP?.foundation;

  if (!primaryChanged && !foundationChanged && promotions.promoted.length === 0) {
    status = "unchanged";
  }

  return {
    site: afterP?.site || slug,
    before: beforeP,
    after: afterP,
    scores: { before: bScore, after: aScore },
    status,
    utilityPromotions: promotions
  };
}

const beforeReport = loadJson(new URL("./benchmark-report-pre-utility-override.json", import.meta.url));
const afterReport = loadJson(new URL("./benchmark-report.json", import.meta.url));

const siteReports = SITES.map((slug) => {
  const extraction = loadJson(new URL(`./benchmark-extractions/${slug}.json`, import.meta.url));
  const beforeP = paletteFromReport(beforeReport, slug.charAt(0).toUpperCase() + slug.slice(1));
  const afterP = paletteFromReport(afterReport, slug.charAt(0).toUpperCase() + slug.slice(1));
  const promotions = detectUtilityPromotions(extraction, beforeP, afterP);
  return compareSite(slug, beforeReport, afterReport, promotions);
});

const improved = siteReports.filter((s) => s.status === "improved").map((s) => s.site);
const unchanged = siteReports.filter((s) => s.status === "unchanged").map((s) => s.site);
const regressed = siteReports.filter((s) => s.status === "regressed" || s.status === "mixed").map((s) => s.site);

const avgBrandBefore =
  siteReports.reduce((sum, s) => sum + s.scores.before.brandScore, 0) / siteReports.length;
const avgBrandAfter =
  siteReports.reduce((sum, s) => sum + s.scores.after.brandScore, 0) / siteReports.length;
const avgUsefulBefore =
  siteReports.reduce((sum, s) => sum + s.scores.before.usefulScore, 0) / siteReports.length;
const avgUsefulAfter =
  siteReports.reduce((sum, s) => sum + s.scores.after.usefulScore, 0) / siteReports.length;

const output = {
  generatedAt: new Date().toISOString(),
  comparisonBaseline: "benchmark-report-pre-utility-override.json",
  summary: { improved, unchanged, regressed },
  averages: {
    brandAccuracy: { before: +avgBrandBefore.toFixed(1), after: +avgBrandAfter.toFixed(1), delta: +(avgBrandAfter - avgBrandBefore).toFixed(1) },
    designerUsefulness: { before: +avgUsefulBefore.toFixed(1), after: +avgUsefulAfter.toFixed(1), delta: +(avgUsefulAfter - avgUsefulBefore).toFixed(1) }
  },
  sites: siteReports
};

writeFileSync(new URL("./utility-override-benchmark-comparison.json", import.meta.url), JSON.stringify(output, null, 2));

let md = `# Utility Override Benchmark Comparison\n\nGenerated: ${output.generatedAt}\n\n`;
md += `Baseline: post-foundation-fix benchmark (pre utility override)\n\n`;

md += `## Summary\n\n`;
md += `- **Improved:** ${improved.length ? improved.join(", ") : "none"}\n`;
md += `- **Unchanged:** ${unchanged.length ? unchanged.join(", ") : "none"}\n`;
md += `- **Regressed:** ${regressed.length ? regressed.join(", ") : "none"}\n\n`;

md += `## Average scores\n\n`;
md += `| Metric | Before | After | Delta |\n|--------|--------|-------|-------|\n`;
md += `| Brand Accuracy | ${output.averages.brandAccuracy.before}/10 | ${output.averages.brandAccuracy.after}/10 | ${output.averages.brandAccuracy.delta >= 0 ? "+" : ""}${output.averages.brandAccuracy.delta} |\n`;
md += `| Designer Usefulness | ${output.averages.designerUsefulness.before}/10 | ${output.averages.designerUsefulness.after}/10 | ${output.averages.designerUsefulness.delta >= 0 ? "+" : ""}${output.averages.designerUsefulness.delta} |\n\n`;

for (const s of siteReports) {
  md += `## ${s.site} (${s.status})\n\n`;
  md += `| | Before | After |\n|---|--------|-------|\n`;
  md += `| Foundation | ${s.before?.foundation || "—"} | ${s.after?.foundation || "—"} |\n`;
  md += `| Primary | ${s.before?.primary || "—"} | ${s.after?.primary || "—"} |\n`;
  md += `| Secondary | ${flattenSecondaries(s.before?.secondaries).join(", ") || "—"} | ${flattenSecondaries(s.after?.secondaries).join(", ") || "—"} |\n`;
  md += `| Brand score | ${s.scores.before.brandScore}/10 | ${s.scores.after.brandScore}/10 |\n`;
  md += `| Usefulness | ${s.scores.before.usefulScore}/10 | ${s.scores.after.usefulScore}/10 |\n\n`;

  md += `**After palette:** ${s.after?.full.map((x) => `${x.role} ${x.hex}`).join(" · ") || "—"}\n\n`;

  if (s.utilityPromotions.promoted.length) {
    md += `**Promoted by utility override:**\n`;
    for (const p of s.utilityPromotions.promoted) {
      md += `- \`${p.hex}\` (${p.reason}, brandConfidence ${p.brandConfidence})\n`;
    }
    md += `\n`;
  } else if (s.utilityPromotions.newlyNonUtilityCount > 0) {
    md += `_Utility override freed ${s.utilityPromotions.newlyNonUtilityCount} cluster(s) but none newly entered the final 8._\n\n`;
  } else {
    md += `_No clusters affected by utility override on this site._\n\n`;
  }

  if (s.utilityPromotions.incorrectlyPromoted.length) {
    md += `**Incorrectly promoted:**\n`;
    for (const p of s.utilityPromotions.incorrectlyPromoted) {
      md += `- \`${p.hex}\`\n`;
    }
    md += `\n`;
  } else {
    md += `**Incorrectly promoted:** none detected\n\n`;
  }
}

writeFileSync(new URL("./utility-override-benchmark-comparison.md", import.meta.url), md);
console.log(JSON.stringify(output.summary, null, 2));
console.log("averages", output.averages);
