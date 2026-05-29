/**
 * Linear validation for brand-evidence utility override — analysis only.
 * Usage: node scripts/linear-utility-override-validation.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { curatePalette } from "../src/core/scoreAndCluster.js";
import { assignRoles } from "../src/core/assignRoles.js";
import { rgbToLab, deltaE, rgbToHsl, isNeutralHsl } from "../src/core/colorLab.js";
import {
  brandConfidence,
  classifyClusterUtility,
  designSystemScore,
  isUtilitySource,
  weightForSource
} from "../src/core/sourceClassification.js";

const TARGET = "#5e6ad2";
const BEFORE = {
  foundation: "#08090a",
  primary: "#d0d6e0",
  chromaticCurated: ["#d0d6e0"],
  fiveSixIsUtility: true,
  fiveSixInBrandChromas: false,
  fiveSixInChromaDeduped: false
};

const raw = JSON.parse(
  readFileSync(new URL("./benchmark-extractions/linear.json", import.meta.url), "utf8")
);

function hueFamily(hsl) {
  return Math.floor((hsl.h % 360) / 30);
}

function dedupeHueFamilies(chromatics) {
  const sorted = [...chromatics].sort((a, b) => b.designSystemScore - a.designSystemScore);
  const kept = [];
  const families = new Map();
  for (const c of sorted) {
    const fam = hueFamily(c.hsl);
    if (!families.has(fam)) {
      families.set(fam, c);
      kept.push(c);
    }
  }
  return kept;
}

function traceChromaticPipeline(extraction) {
  const sectionCount = extraction.sectionCount;
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

  const neutrals = samples.filter((s) => isNeutralHsl(s.hsl));
  const neutralClusters = [];
  for (const sample of neutrals) {
    const lab = rgbToLab(sample.rgb);
    let best = null;
    let bestDist = 5;
    for (const cluster of neutralClusters) {
      const dist = deltaE(lab, cluster.lab);
      if (dist < bestDist) {
        bestDist = dist;
        best = cluster;
      }
    }
    if (best) {
      best.totalArea += sample.area;
      best.occurrences += 1;
    } else {
      neutralClusters.push({
        lab,
        totalArea: sample.area,
        brandWeightedImportance: sample.importance || 0,
        occurrences: 1,
        sectionIds: new Set([sample.sectionId]),
        contexts: new Set([sample.context]),
        sourceCounts: { [sample.sourceCategory || "default"]: 1 },
        hasHero: false,
        hasCta: false,
        hasNav: false
      });
    }
  }

  const allClusters = [...neutralClusters, ...clusters];
  const maxima = {
    area: Math.max(...allClusters.map((c) => c.totalArea), 1),
    brandImportance: Math.max(...allClusters.map((c) => c.brandWeightedImportance), 1),
    contrast: 0.01,
    occurrences: Math.max(...allClusters.map((c) => c.occurrences), 1)
  };

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
    c.brandConfidence = brandConfidence(c, sectionCount);
    c.isUtility = classifyClusterUtility(c, sectionCount);
    c.designSystemScore = designSystemScore(c, maxima, sectionCount);
  }

  const brandChromas = clusters
    .filter((c) => !c.isUtility)
    .map((c) => ({
      hex: c.representative.hex,
      hsl: c.representative.hsl,
      designSystemScore: c.designSystemScore,
      brandConfidence: c.brandConfidence,
      isUtility: c.isUtility
    }))
    .sort((a, b) => b.designSystemScore - a.designSystemScore);

  const chromaDeduped = dedupeHueFamilies(brandChromas);

  const targetCluster = clusters.find((c) => c.memberHexes.has(TARGET));

  return {
    targetCluster: targetCluster
      ? {
          hex: targetCluster.representative.hex,
          isUtility: targetCluster.isUtility,
          brandConfidence: targetCluster.brandConfidence,
          designSystemScore: targetCluster.designSystemScore,
          hasHero: targetCluster.hasHero,
          hasNav: targetCluster.hasNav,
          sourceCounts: targetCluster.sourceCounts
        }
      : null,
    brandChromaCount: brandChromas.length,
    brandChromaHexes: brandChromas.map((c) => c.hex),
    chromaDedupedHexes: chromaDeduped.map((c) => c.hex),
    targetInBrandChromas: brandChromas.some((c) => c.hex === TARGET),
    targetInChromaDeduped: chromaDeduped.some((c) => c.hex === TARGET)
  };
}

const curated = curatePalette(raw);
const assigned = assignRoles(curated);
const pipeline = traceChromaticPipeline(raw);

const chromaticSelected = curated.selected.filter((c) => !c.isNeutral);
const primary = assigned.swatches.find((s) => s.role === "primary");
const foundation = assigned.swatches.find((s) => s.role === "foundation");

const after = {
  foundation: foundation?.hex,
  primary: primary?.hex,
  fullPalette: assigned.swatches.map((s) => `${s.role} ${s.hex}`),
  chromaticCurated: chromaticSelected.map((c) => c.hex)
};

const report = {
  generatedAt: new Date().toISOString(),
  site: "Linear",
  validation: {
    q1_fiveSixRemainsNonUtility: pipeline.targetCluster?.isUtility === false,
    q2_survivesChromaticFiltering: pipeline.targetInBrandChromas === true,
    q3_entersCuratedChromaticSet: chromaticSelected.some((c) => c.hex === TARGET),
    q4_becomesPrimary: primary?.hex === TARGET
  },
  targetCluster: pipeline.targetCluster,
  pipeline: {
    brandChromaCount: pipeline.brandChromaCount,
    brandChromaHexes: pipeline.brandChromaHexes,
    chromaDedupedHexes: pipeline.chromaDedupedHexes,
    targetInBrandChromas: pipeline.targetInBrandChromas,
    targetInChromaDeduped: pipeline.targetInChromaDeduped
  },
  before: BEFORE,
  after,
  chromaticCuratedDetail: chromaticSelected.map((c) => ({
    hex: c.hex,
    brandConfidence: c.brandConfidence,
    designSystemScore: c.designSystemScore,
    roleHint: c.roleHint
  }))
};

writeFileSync(
  new URL("./linear-utility-override-validation.json", import.meta.url),
  JSON.stringify(report, null, 2)
);

let md = `# Linear Utility Override Validation\n\nGenerated: ${report.generatedAt}\n\n`;
md += `## Validation answers\n\n`;
md += `| # | Question | Result |\n|---|----------|--------|\n`;
md += `| 1 | Does \`#5e6ad2\` remain non-utility? | **${report.validation.q1_fiveSixRemainsNonUtility ? "YES" : "NO"}** |\n`;
md += `| 2 | Does it survive chromatic filtering (brandChromas)? | **${report.validation.q2_survivesChromaticFiltering ? "YES" : "NO"}** |\n`;
md += `| 3 | Does it enter the curated chromatic set? | **${report.validation.q3_entersCuratedChromaticSet ? "YES" : "NO"}** |\n`;
md += `| 4 | Does it become primary? | **${report.validation.q4_becomesPrimary ? "YES" : "NO"}** |\n\n`;

md += `## Target cluster (\`#5e6ad2\`)\n\n`;
if (pipeline.targetCluster) {
  md += `- isUtility: **${pipeline.targetCluster.isUtility}** (was \`true\`)\n`;
  md += `- brandConfidence: **${pipeline.targetCluster.brandConfidence.toFixed(3)}**\n`;
  md += `- designSystemScore: **${pipeline.targetCluster.designSystemScore.toFixed(3)}**\n`;
  md += `- hasHero: **${pipeline.targetCluster.hasHero}** (override trigger)\n`;
  md += `- sources: ${JSON.stringify(pipeline.targetCluster.sourceCounts)}\n\n`;
}

md += `## Pipeline trace\n\n`;
md += `- brandChromas count: ${pipeline.brandChromaCount} (was 2)\n`;
md += `- brandChromas: ${pipeline.brandChromaHexes.join(", ")}\n`;
md += `- chromaDeduped: ${pipeline.chromaDedupedHexes.join(", ")}\n`;
md += `- \`#5e6ad2\` in brandChromas: **${pipeline.targetInBrandChromas}**\n`;
md += `- \`#5e6ad2\` in chromaDeduped: **${pipeline.targetInChromaDeduped}**\n\n`;

md += `## Before vs after palette\n\n`;
md += `| Role | Before | After |\n|------|--------|-------|\n`;
md += `| foundation | ${BEFORE.foundation} | ${after.foundation} |\n`;
md += `| primary | ${BEFORE.primary} | ${after.primary} |\n\n`;
md += `**Before full palette:** foundation ${BEFORE.foundation} · primary ${BEFORE.primary}\n\n`;
md += `**After full palette:** ${after.fullPalette.join(" · ")}\n\n`;
md += `**Curated chromatics after:** ${after.chromaticCurated.join(", ") || "none"}\n`;

writeFileSync(new URL("./linear-utility-override-validation.md", import.meta.url), md);
console.log(JSON.stringify(report.validation, null, 2));
console.log("primary:", BEFORE.primary, "→", after.primary);
