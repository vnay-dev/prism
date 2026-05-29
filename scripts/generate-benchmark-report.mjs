/**
 * Benchmark report generator — analysis only, does not modify src/.
 * Usage: node scripts/generate-benchmark-report.mjs
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { curatePalette } from "../src/core/scoreAndCluster.js";
import { assignRoles } from "../src/core/assignRoles.js";
import { rgbToLab, deltaE, rgbToHsl, isNeutralHsl } from "../src/core/colorLab.js";
import {
  brandConfidence,
  designSystemScore,
  isUtilityColor,
  isUtilitySource,
  weightForSource
} from "../src/core/sourceClassification.js";

const BENCHMARK_DIR = new URL("./benchmark-extractions/", import.meta.url);
const NEUTRAL_MERGE_DE = 5;
const CHROMA_MERGE_DE = 8;

const SITE_META = {
  "linear.json": { name: "Linear", url: "https://linear.app/" },
  "stripe.json": { name: "Stripe", url: "https://stripe.com/" },
  "spotify.json": { name: "Spotify", url: "https://www.spotify.com/" },
  "vercel.json": { name: "Vercel", url: "https://vercel.com/" },
  "notion.json": { name: "Notion", url: "https://www.notion.so/" },
  "framer.json": { name: "Framer", url: "https://www.framer.com/" },
  "air-india.json": { name: "Air India", url: "https://www.airindia.com/" },
  "apple.json": { name: "Apple", url: "https://www.apple.com/" },
  "netflix.json": { name: "Netflix", url: "https://www.netflix.com/" },
  "slack.json": { name: "Slack", url: "https://slack.com/" }
};

function mergeClusterStats(cluster, sample) {
  cluster.totalArea += sample.area;
  cluster.occurrences += 1;
  cluster.sectionIds.add(sample.sectionId);
  cluster.contexts.add(sample.context);
  cluster.brandWeightedImportance += sample.importance || 0;
  const src = sample.sourceCategory || "default";
  cluster.sourceCounts[src] = (cluster.sourceCounts[src] || 0) + 1;
  if (src === "hero_background" || src === "hero_cta") cluster.hasHero = true;
  if (src === "hero_cta" || src === "primary_button") cluster.hasCta = true;
  if (src === "navigation") cluster.hasNav = true;
}

function newCluster(sample, lab) {
  const src = sample.sourceCategory || "default";
  return {
    lab,
    hex: sample.hex,
    rgb: sample.rgb,
    hsl: sample.hsl,
    totalArea: sample.area,
    brandWeightedImportance: sample.importance || 0,
    occurrences: 1,
    sectionIds: new Set([sample.sectionId]),
    contexts: new Set([sample.context]),
    sourceCounts: { [src]: 1 },
    hasHero: src === "hero_background" || src === "hero_cta",
    hasCta: src === "hero_cta" || src === "primary_button",
    hasNav: src === "navigation",
    isNeutral: isNeutralHsl(sample.hsl)
  };
}

function clusterSamples(samples, threshold) {
  const clusters = [];
  for (const sample of samples) {
    const hsl = sample.hsl || rgbToHsl(sample.rgb);
    const lab = rgbToLab(sample.rgb);
    let best = null;
    let bestDist = threshold;
    for (const cluster of clusters) {
      const dist = deltaE(lab, cluster.lab);
      if (dist < bestDist) {
        bestDist = dist;
        best = cluster;
      }
    }
    if (best) {
      mergeClusterStats(best, { ...sample, hsl });
    } else {
      clusters.push(newCluster({ ...sample, hsl }, lab));
    }
  }
  return clusters;
}

function finalizeAllClusters(clusters, maxima, sectionCount, totalArea) {
  return clusters.map((cluster) => {
    const utilityWeighted = Object.entries(cluster.sourceCounts).reduce(
      (sum, [src, n]) => sum + (isUtilitySource(src) ? n * weightForSource(src) : 0),
      0
    );
    const totalSourceWeight = Object.entries(cluster.sourceCounts).reduce(
      (sum, [src, n]) => sum + n * weightForSource(src),
      0
    );
    const utilityRatio = totalSourceWeight > 0 ? utilityWeighted / totalSourceWeight : 0;
    const isUtility = isUtilityColor(cluster.sourceCounts, utilityRatio);
    const brandConf = brandConfidence(cluster, sectionCount);
    const dsScore = designSystemScore(cluster, maxima, sectionCount);
    return {
      hex: cluster.hex,
      hsl: cluster.hsl,
      designSystemScore: dsScore,
      brandConfidence: brandConf,
      totalArea: cluster.totalArea,
      areaShare: cluster.totalArea / totalArea,
      occurrences: cluster.occurrences,
      sectionCoverage: cluster.sectionIds.size,
      isNeutral: cluster.isNeutral,
      isUtility,
      utilityRatio,
      hasHero: cluster.hasHero,
      hasCta: cluster.hasCta,
      hasNav: cluster.hasNav,
      sourceCounts: cluster.sourceCounts,
      contexts: [...cluster.contexts]
    };
  });
}

function topRawColors(samples, n = 10) {
  const byHex = new Map();
  for (const s of samples) {
    const cur = byHex.get(s.hex) || {
      hex: s.hex,
      hsl: s.hsl,
      totalArea: 0,
      hits: 0,
      sources: {},
      zones: {}
    };
    cur.totalArea += s.area || 0;
    cur.hits += 1;
    const src = s.sourceCategory || "default";
    cur.sources[src] = (cur.sources[src] || 0) + 1;
    const z = s.contentZone || "unknown";
    cur.zones[z] = (cur.zones[z] || 0) + 1;
    byHex.set(s.hex, cur);
  }
  return [...byHex.values()]
    .sort((a, b) => b.totalArea - a.totalArea)
    .slice(0, n)
    .map((c) => ({
      hex: c.hex,
      hsl: c.hsl,
      totalArea: Math.round(c.totalArea),
      hits: c.hits,
      topSources: Object.entries(c.sources)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([k, v]) => `${k}(${v})`)
    }));
}

function topSourcesLabel(sourceCounts, limit = 3) {
  return Object.entries(sourceCounts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k, v]) => `${k}×${v}`)
    .join(", ");
}

function explainSelection(swatch, curated, assigned) {
  const entry = curated.selected.find((c) => c.hex === swatch.hex) ||
    curated.allNeutrals?.find((c) => c.hex === swatch.hex) || {};
  const reasons = [];

  if (swatch.role === "foundation") {
    reasons.push(
      `Dominant neutral surface (${swatch.areaShare}% area share, ${entry.sectionCoverage || swatch.source?.sectionCoverage || 0} sections)`
    );
  }
  if (swatch.role === "primary") {
    reasons.push("Highest brand-confidence chromatic in curated set");
    if (entry.hasHero) reasons.push("Appears in hero region");
    if (entry.hasCta) reasons.push("Linked to CTA/button context");
    if (entry.hasNav) reasons.push("Present in website navigation");
  }
  if (swatch.role === "secondary") {
    reasons.push("Additional chromatic hue family after primary deduplication");
  }
  if (swatch.role === "accent") {
    if (swatch.isUtility) reasons.push("Utility/status color capped as accent");
    else reasons.push("CTA or high-confidence chromatic accent candidate");
  }
  if (swatch.role === "neutral") {
    reasons.push(`Neutral cluster ranked by area (${swatch.areaShare}%) and design-system score`);
  }

  const src = topSourcesLabel(entry.sourceCounts || swatch.source?.sourceCounts);
  if (src) reasons.push(`Sources: ${src}`);

  if (entry.isUtility || swatch.isUtility) {
    reasons.push(`Utility-heavy (${Math.round((entry.utilityRatio || 0) * 100)}% utility sources)`);
  }

  if (entry.roleHint) reasons.push(`Curator hint: ${entry.roleHint}`);

  reasons.push(`designSystemScore=${swatch.score}, brandConfidence=${swatch.brandConfidence}`);

  return reasons;
}

function analyzeSite(fileName, extraction) {
  const meta = SITE_META[fileName] || { name: fileName, url: "unknown" };
  const samples = extraction.samples || [];
  const sectionCount = extraction.sectionCount || extraction.sections?.length || 1;
  const totalArea = samples.reduce((s, x) => s + (x.area || 0), 0) || 1;

  const enriched = samples.map((s) => ({
    ...s,
    hsl: s.hsl || rgbToHsl(s.rgb),
    importance: s.importance ?? (s.rawImportance || 1) * weightForSource(s.sourceCategory || "default")
  }));

  const neutrals = enriched.filter((s) => isNeutralHsl(s.hsl));
  const chromatics = enriched.filter((s) => !isNeutralHsl(s.hsl));
  const neutralClusters = clusterSamples(neutrals, NEUTRAL_MERGE_DE);
  const chromaClusters = clusterSamples(chromatics, CHROMA_MERGE_DE);
  const allClusters = [...neutralClusters, ...chromaClusters];

  const maxima = {
    area: Math.max(...allClusters.map((c) => c.totalArea), 1),
    brandImportance: Math.max(...allClusters.map((c) => c.brandWeightedImportance), 1),
    contrast: 1,
    occurrences: Math.max(...allClusters.map((c) => c.occurrences), 1)
  };

  const scored = finalizeAllClusters(allClusters, maxima, sectionCount, totalArea)
    .sort((a, b) => b.designSystemScore - a.designSystemScore);

  const curated = curatePalette(extraction);
  const assigned = assignRoles(curated);

  const finalPalette = assigned.swatches.map((s) => ({
    hex: s.hex,
    role: s.role,
    hsl: s.hsl,
    score: s.score,
    brandConfidence: s.brandConfidence,
    areaShare: s.areaShare,
    isUtility: s.isUtility,
    whySelected: explainSelection(s, curated, assigned)
  }));

  return {
    site: meta.name,
    url: meta.url,
    extractionStats: {
      samples: samples.length,
      sections: sectionCount,
      totalArea: Math.round(totalArea),
      productDemoShare: samples.filter((s) => s.contentZone === "product_demo").length / Math.max(samples.length, 1)
    },
    finalPalette,
    paletteMode: assigned.paletteMode,
    top10RawColors: topRawColors(samples),
    top10ScoredColors: scored.slice(0, 10).map((c) => ({
      hex: c.hex,
      designSystemScore: Number(c.designSystemScore.toFixed(4)),
      brandConfidence: Number(c.brandConfidence.toFixed(4)),
      areaShare: Number((c.areaShare * 100).toFixed(2)),
      isNeutral: c.isNeutral,
      isUtility: c.isUtility,
      hasHero: c.hasHero,
      hasCta: c.hasCta,
      hasNav: c.hasNav,
      topSources: topSourcesLabel(c.sourceCounts)
    }))
  };
}

function detectFailurePatterns(reports) {
  const patterns = [];

  const wrongFoundation = reports.filter((r) => {
    const f = r.finalPalette.find((s) => s.role === "foundation");
    const topRaw = r.top10RawColors[0];
    if (!f || !topRaw) return false;
    return f.hex !== topRaw.hex && topRaw.totalArea > f.areaShare * r.extractionStats.totalArea * 0.01;
  });
  if (wrongFoundation.length) {
    patterns.push({
      pattern: "foundation_not_dominant_raw_color",
      sites: wrongFoundation.map((r) => r.site),
      note: "Foundation role assigned to a neutral that is not the largest raw area color (often #000000 from SVG fills)"
    });
  }

  const noBrandPrimary = reports.filter((r) => r.paletteMode === "foundation");
  if (noBrandPrimary.length) {
    patterns.push({
      pattern: "no_chromatic_primary",
      sites: noBrandPrimary.map((r) => r.site),
      note: "No chromatic color received primary role — brand color may be missing from palette"
    });
  }

  const utilityAsSecondary = reports.filter((r) =>
    r.finalPalette.some((s) => s.role === "secondary" && s.isUtility)
  );
  if (utilityAsSecondary.length) {
    patterns.push({
      pattern: "utility_in_secondary",
      sites: utilityAsSecondary.map((r) => r.site),
      note: "Status/utility colors still reaching secondary role"
    });
  }

  const brandMissingFromPalette = reports.filter((r) => {
    const topScoredChroma = r.top10ScoredColors.find((c) => !c.isNeutral && !c.isUtility);
    if (!topScoredChroma) return false;
    return !r.finalPalette.some((s) => s.hex === topScoredChroma.hex);
  });
  if (brandMissingFromPalette.length) {
    patterns.push({
      pattern: "top_scored_chroma_excluded",
      sites: brandMissingFromPalette.map((r) => r.site),
      note: "Highest-scored chromatic cluster not in final 8-color palette"
    });
  }

  const highDemoShare = reports.filter((r) => r.extractionStats.productDemoShare > 0.35);
  if (highDemoShare.length) {
    patterns.push({
      pattern: "heavy_product_demo_pages",
      sites: highDemoShare.map((r) => ({
        site: r.site,
        demoShare: Number((r.extractionStats.productDemoShare * 100).toFixed(1))
      })),
      note: "Marketing pages with large embedded product UI — demo detection heavily influences scoring"
    });
  }

  return patterns;
}

const files = readdirSync(BENCHMARK_DIR).filter((f) => f.endsWith(".json"));
const reports = [];
const missing = [];

for (const [expectedFile, meta] of Object.entries(SITE_META)) {
  if (!files.includes(expectedFile)) missing.push(meta.name);
}

for (const file of files.sort()) {
  if (!SITE_META[file]) continue;
  const extraction = JSON.parse(readFileSync(new URL(file, BENCHMARK_DIR), "utf8"));
  reports.push(analyzeSite(file, extraction));
}

const output = {
  generatedAt: new Date().toISOString(),
  sitesAnalyzed: reports.length,
  missingSites: missing,
  failurePatterns: detectFailurePatterns(reports),
  reports
};

writeFileSync(new URL("./benchmark-report.json", import.meta.url), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ sitesAnalyzed: reports.length, missing, failurePatterns: output.failurePatterns }, null, 2));
