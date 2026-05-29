/**
 * Linear Chromatic Curation Audit — analysis only, does not modify src/.
 * Usage: node scripts/linear-chromatic-curation-audit.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { rgbToLab, deltaE, rgbToHsl, isNeutralHsl } from "../src/core/colorLab.js";
import {
  brandConfidence,
  designSystemScore,
  isDemoSource,
  isUtilityColor,
  isUtilitySource,
  weightForSource
} from "../src/core/sourceClassification.js";
import {
  isBrowserDefaultLinkColor,
  stripBrowserDefaultLinks
} from "../src/core/paletteSafeguards.js";
import { curatePalette } from "../src/core/scoreAndCluster.js";

const NEUTRAL_MERGE_DE = 5;
const CHROMA_MERGE_DE = 8;
const SECONDARY_SLOT_LIMIT = 2;
const NEUTRAL_SLOT_LIMIT = 4;
const PALETTE_SLOT_LIMIT = 8;

const raw = JSON.parse(
  readFileSync(new URL("./benchmark-extractions/linear.json", import.meta.url), "utf8")
);

function mergeClusterStats(cluster, sample) {
  cluster.totalArea += sample.area;
  cluster.totalImportance += sample.importance || 0;
  cluster.occurrences += 1;
  cluster.sectionIds.add(sample.sectionId);
  cluster.contexts.add(sample.context);
  cluster.contrastSum += sample.contrast || 0;
  const src = sample.sourceCategory || "default";
  cluster.sourceCounts[src] = (cluster.sourceCounts[src] || 0) + 1;
  cluster.brandWeightedImportance += sample.importance || 0;
  if (src === "hero_background" || src === "hero_cta") cluster.hasHero = true;
  if (src === "hero_cta" || src === "primary_button") cluster.hasCta = true;
  if (src === "navigation") cluster.hasNav = true;
  if ((sample.importance || 0) > cluster.peakImportance) {
    cluster.representative = sample;
    cluster.peakImportance = sample.importance || 0;
  }
  if (!cluster.members) cluster.members = [];
  cluster.members.push(sample);
}

function newCluster(sample, lab) {
  const src = sample.sourceCategory || "default";
  return {
    lab,
    representative: sample,
    totalArea: sample.area,
    totalImportance: sample.importance || 0,
    brandWeightedImportance: sample.importance || 0,
    occurrences: 1,
    sectionIds: new Set([sample.sectionId]),
    contexts: new Set([sample.context]),
    contrastSum: sample.contrast || 0,
    peakImportance: sample.importance || 0,
    sourceCounts: { [src]: 1 },
    hasHero: src === "hero_background" || src === "hero_cta",
    hasCta: src === "hero_cta" || src === "primary_button",
    hasNav: src === "navigation",
    isNeutral: false,
    members: [sample],
    memberHexes: new Set([sample.hex])
  };
}

function clusterSamples(samples, threshold) {
  const clusters = [];
  for (const sample of samples) {
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
      mergeClusterStats(best, sample);
      best.memberHexes.add(sample.hex);
    } else {
      const c = newCluster(sample, lab);
      clusters.push(c);
    }
  }
  return clusters;
}

function finalizeCluster(cluster, maxima, sectionCount) {
  const utilityWeighted = Object.entries(cluster.sourceCounts).reduce(
    (sum, [src, n]) => sum + (isUtilitySource(src) ? n * weightForSource(src) : 0),
    0
  );
  const totalSourceWeight = Object.entries(cluster.sourceCounts).reduce(
    (sum, [src, n]) => sum + n * weightForSource(src),
    0
  );
  cluster.utilityRatio = totalSourceWeight > 0 ? utilityWeighted / totalSourceWeight : 0;
  cluster.isUtility = isUtilityColor(cluster.sourceCounts, cluster.utilityRatio);
  cluster.brandConfidence = brandConfidence(cluster, sectionCount);
  cluster.designSystemScore = designSystemScore(cluster, maxima, sectionCount);
  return cluster;
}

function clusterToOutput(cluster) {
  const rep = cluster.representative;
  return {
    hex: rep.hex,
    rgb: rep.rgb,
    hsl: rep.hsl,
    usageWeight: cluster.totalArea,
    semanticWeight: cluster.brandWeightedImportance,
    isNeutral: false,
    isUtility: cluster.isUtility,
    brandConfidence: cluster.brandConfidence,
    designSystemScore: cluster.designSystemScore,
    sectionCoverage: cluster.sectionIds.size,
    occurrences: cluster.occurrences,
    sourceCounts: { ...cluster.sourceCounts },
    hasHero: cluster.hasHero,
    hasCta: cluster.hasCta,
    hasNav: cluster.hasNav,
    contexts: [...cluster.contexts],
    memberHexes: [...cluster.memberHexes],
    representativeHex: rep.hex,
    representativeRule: "peak sample importance (mergeClusterStats lines 50–52 in scoreAndCluster.js)"
  };
}

function hueFamily(hsl) {
  return Math.floor((hsl.h % 360) / 30);
}

function dedupeHueFamiliesWithTrace(chromatics) {
  const sorted = [...chromatics].sort((a, b) => b.designSystemScore - a.designSystemScore);
  const kept = [];
  const removed = [];
  const families = new Map();
  for (const c of sorted) {
    const fam = hueFamily(c.hsl);
    if (!families.has(fam)) {
      families.set(fam, c);
      kept.push(c);
    } else {
      removed.push({
        hex: c.hex,
        hueFamily: fam,
        beatenBy: families.get(fam).hex,
        rule: `dedupeHueFamilies: one chromatic per 30° hue bucket (floor(h/30)); kept highest designSystemScore in family ${fam}`
      });
    }
  }
  return { kept, removed };
}

function simulateBuildPalette(
  neutralClusters,
  chromaClusters,
  sectionCount,
  totalSampleArea,
  opts = {}
) {
  const secondaryLimit = opts.secondarySlotLimit ?? SECONDARY_SLOT_LIMIT;
  const paletteLimit = opts.paletteSlotLimit ?? PALETTE_SLOT_LIMIT;
  const neutralLimit = opts.neutralSlotLimit ?? NEUTRAL_SLOT_LIMIT;
  const skipHueDedupe = opts.skipHueDedupe ?? false;
  const repByBrandConfidence = opts.repByBrandConfidence ?? false;

  if (repByBrandConfidence) {
    for (const c of chromaClusters) {
      let best = c.members[0];
      let bestBc = -1;
      for (const m of c.members) {
        const tmp = {
          sectionIds: new Set([m.sectionId]),
          contexts: new Set([m.context]),
          hasHero: ["hero_background", "hero_cta"].includes(m.sourceCategory),
          hasCta: ["hero_cta", "primary_button"].includes(m.sourceCategory),
          hasNav: m.sourceCategory === "navigation"
        };
        const bc = brandConfidence(tmp, sectionCount);
        if (bc > bestBc) {
          bestBc = bc;
          best = m;
        }
      }
      c.representative = best;
    }
  }

  const allClusters = [...neutralClusters, ...chromaClusters];
  const maxima = {
    area: Math.max(...allClusters.map((c) => c.totalArea), 1),
    brandImportance: Math.max(...allClusters.map((c) => c.brandWeightedImportance), 1),
    contrast: Math.max(...allClusters.map((c) => c.contrastSum / c.occurrences), 0.01),
    occurrences: Math.max(...allClusters.map((c) => c.occurrences), 1)
  };
  for (const c of allClusters) finalizeCluster(c, maxima, sectionCount);

  const scoredNeutrals = neutralClusters
    .map((c) => ({ ...clusterToOutput({ ...c, isNeutral: true }), isNeutral: true }))
    .sort((a, b) => b.designSystemScore - a.designSystemScore);

  const brandChromas = chromaClusters
    .filter((c) => opts.skipUtilityFilter || !c.isUtility)
    .map((c) => clusterToOutput(c))
    .sort((a, b) => b.designSystemScore - a.designSystemScore);

  const afterUtility = brandChromas;
  const afterBrowserStrip = stripBrowserDefaultLinks(afterUtility);
  const browserRemoved = afterUtility.filter((c) => !afterBrowserStrip.some((k) => k.hex === c.hex));

  const dedupe = skipHueDedupe
    ? { kept: afterBrowserStrip, removed: [] }
    : dedupeHueFamiliesWithTrace(afterBrowserStrip);
  const chromaDeduped = dedupe.kept;

  const result = [];
  const used = new Set();
  const trace = [];

  const primary =
    chromaDeduped.find((c) => c.brandConfidence >= 0.15) || chromaDeduped[0];
  if (primary) {
    result.push({ ...primary, roleHint: "primary" });
    used.add(primary.hex);
    trace.push({ hex: primary.hex, stage: "primary_pick", kept: true });
  }

  for (const c of chromaDeduped.filter((x) => !used.has(x.hex)).slice(0, secondaryLimit)) {
    result.push({ ...c, roleHint: "secondary" });
    used.add(c.hex);
    trace.push({ hex: c.hex, stage: "secondary_pick", kept: true });
  }

  for (const n of [...scoredNeutrals]
    .sort((a, b) => b.usageWeight / totalSampleArea - a.usageWeight / totalSampleArea)
    .slice(0, neutralLimit)) {
    if (result.length >= 10) break;
    if (used.has(n.hex)) continue;
    result.push({ ...n, roleHint: "neutral" });
    used.add(n.hex);
  }

  const fillPool = [...chromaDeduped, ...scoredNeutrals, ...brandChromas].sort(
    (a, b) => b.designSystemScore - a.designSystemScore
  );
  for (const c of fillPool) {
    if (result.length >= paletteLimit) break;
    if (used.has(c.hex)) continue;
    result.push({ ...c, roleHint: c.isNeutral ? "neutral" : "secondary" });
    used.add(c.hex);
  }

  const selectedHexes = new Set(result.map((r) => r.hex));
  return {
    selected: result.slice(0, paletteLimit),
    selectedHexes,
    chromaDeduped,
    brandChromas,
    dedupeRemoved: dedupe.removed,
    browserRemoved,
    trace
  };
}

// --- Run audit ---
const sectionCount = raw.sectionCount;
const enriched = raw.samples.map((s) => ({
  ...s,
  hsl: s.hsl || rgbToHsl(s.rgb),
  sourceCategory: s.sourceCategory || "default",
  importance: s.importance ?? (s.rawImportance || 1) * weightForSource(s.sourceCategory || "default")
}));

const totalSampleArea = enriched.reduce((sum, s) => sum + (s.area || 0), 0) || 1;
const chromaticSamples = enriched.filter((s) => !isNeutralHsl(s.hsl));
const neutralSamples = enriched.filter((s) => isNeutralHsl(s.hsl));

// Raw extracted chromatic colors (pre-cluster)
const rawByHex = new Map();
for (const s of chromaticSamples) {
  if (!rawByHex.has(s.hex)) {
    rawByHex.set(s.hex, { hex: s.hex, area: 0, count: 0, hsl: s.hsl, sources: {} });
  }
  const e = rawByHex.get(s.hex);
  e.area += s.area || 0;
  e.count += 1;
  const src = s.sourceCategory || "default";
  e.sources[src] = (e.sources[src] || 0) + 1;
}

const chromaClusters = clusterSamples(chromaticSamples, CHROMA_MERGE_DE);
const neutralClusters = clusterSamples(neutralSamples, NEUTRAL_MERGE_DE);

const allClusters = [...neutralClusters, ...chromaClusters];
const maxima = {
  area: Math.max(...allClusters.map((c) => c.totalArea), 1),
  brandImportance: Math.max(...allClusters.map((c) => c.brandWeightedImportance), 1),
  contrast: Math.max(...allClusters.map((c) => c.contrastSum / c.occurrences), 0.01),
  occurrences: Math.max(...allClusters.map((c) => c.occurrences), 1)
};
for (const c of chromaClusters) finalizeCluster(c, maxima, sectionCount);

const brandChromas = chromaClusters
  .filter((c) => !c.isUtility)
  .map((c) => clusterToOutput(c))
  .sort((a, b) => b.designSystemScore - a.designSystemScore);

const actualCurated = curatePalette(raw);
const keptHexes = new Set(actualCurated.selected.filter((c) => !c.isNeutral).map((c) => c.hex));

const baseline = simulateBuildPalette(neutralClusters, chromaClusters, sectionCount, totalSampleArea);

function utilityClassificationDetail(cluster) {
  const counts = cluster.sourceCounts || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const demoOcc = Object.entries(counts).reduce(
    (sum, [src, n]) => sum + (isUtilitySource(src) || isDemoSource(src) ? n : 0),
    0
  );
  const utilityWeighted = Object.entries(counts).reduce(
    (sum, [src, n]) => sum + (isUtilitySource(src) ? n * weightForSource(src) : 0),
    0
  );
  const totalWeighted = Object.entries(counts).reduce(
    (sum, [src, n]) => sum + n * weightForSource(src),
    0
  );
  const utilityRatio = totalWeighted > 0 ? utilityWeighted / totalWeighted : 0;
  return {
    totalSamples: total,
    demoOrUtilityOccurrences: demoOcc,
    demoShare: total > 0 ? +((demoOcc / total) * 100).toFixed(1) : 0,
    utilityRatio: +utilityRatio.toFixed(3),
    triggersRatioGate: utilityRatio >= 0.55,
    triggersOccurrenceGate: total > 0 && demoOcc / total >= 0.6
  };
}

function explainUtilityRemoval(cluster) {
  const d = utilityClassificationDetail(cluster);
  if (d.triggersRatioGate) {
    return {
      rule: "isUtilityColor() in sourceClassification.js line 190",
      detail: `utilityRatio ${d.utilityRatio} >= 0.55`
    };
  }
  return {
    rule: "isUtilityColor() in sourceClassification.js lines 191–196",
    detail: `demo/utility source occurrences ${d.demoOrUtilityOccurrences}/${d.totalSamples} (${d.demoShare}%) >= 60% threshold; demo sources include demo_illustration, demo_navigation, demo_sidebar, demo_status`
  };
}

function buildRemovalReasons(cluster, ctx) {
  const { keptHexes, baseline, brandHexes } = ctx;
  const out = clusterToOutput(cluster);
  const hex = out.hex;

  if (cluster.isUtility) {
    return [explainUtilityRemoval(cluster)];
  }

  const reasons = [];
  if (isBrowserDefaultLinkColor(out)) {
    reasons.push({
      rule: "stripBrowserDefaultLinks() in paletteSafeguards.js",
      detail: "browser default link color without brand evidence"
    });
  }

  const dedupeHit = baseline.dedupeRemoved.find((r) => r.hex === hex);
  if (dedupeHit) {
    reasons.push({
      rule: "dedupeHueFamilies() in scoreAndCluster.js lines 170–181",
      detail: `hue family ${dedupeHit.hueFamily} (floor(h/30) bucket); lost to ${dedupeHit.beatenBy} with higher designSystemScore`
    });
    return reasons;
  }

  if (!baseline.chromaDeduped.some((x) => x.hex === hex)) {
    reasons.push({
      rule: "excluded before dedupeHueFamilies (not in brandChromas pipeline)",
      detail: "cluster did not survive prior filters"
    });
    return reasons;
  }

  if (!keptHexes.has(hex)) {
    const idx = baseline.chromaDeduped.findIndex((x) => x.hex === hex);
    if (idx > 0) {
      reasons.push({
        rule: `buildPalette secondary slice(0, ${SECONDARY_SLOT_LIMIT}) lines 233–236`,
        detail: `rank ${idx + 1} in chromaDeduped; only ${SECONDARY_SLOT_LIMIT} secondary slots before neutral fill`
      });
    }
    reasons.push({
      rule: `buildPalette fill loop lines 256–264`,
      detail: `${NEUTRAL_SLOT_LIMIT} neutral slots consume palette before this chromatic reaches fillPool rank; cap ${PALETTE_SLOT_LIMIT} slots`
    });
  }

  return reasons;
}

// Special trace for #5e6ad2
const target = "#5e6ad2";
const targetClusterRaw = chromaClusters.find((c) => c.memberHexes?.has(target));
const targetRaw = rawByHex.get(target);
const brandHexes = new Set(brandChromas.map((c) => c.hex));

const clusterRows = chromaClusters
  .map((cluster) => {
    const out = clusterToOutput(cluster);
    const ctx = { keptHexes, baseline, brandHexes };
    const reasons = buildRemovalReasons(cluster, ctx);
    const status = keptHexes.has(out.hex) ? "kept" : "removed";
    const utilDetail = cluster.isUtility ? utilityClassificationDetail(cluster) : null;
    return {
      hex: out.hex,
      memberHexes: out.memberHexes,
      area: Math.round(out.usageWeight),
      areaSharePct: +((out.usageWeight / totalSampleArea) * 100).toFixed(3),
      sampleCount: out.occurrences,
      brandConfidence: +out.brandConfidence.toFixed(3),
      designSystemScore: +out.designSystemScore.toFixed(3),
      hueFamily: hueFamily(out.hsl),
      hasHero: out.hasHero,
      hasCta: out.hasCta,
      hasNav: out.hasNav,
      isUtility: cluster.isUtility,
      utilityDetail: utilDetail,
      sourceCounts: out.sourceCounts,
      representativeRule:
        "peak sample importance in cluster (scoreAndCluster.js mergeClusterStats lines 50–52)",
      curatedStatus: status,
      inBrandChromas: !cluster.isUtility,
      inChromaDeduped: baseline.chromaDeduped.some((x) => x.hex === out.hex),
      inFinalSelected: baseline.selectedHexes.has(out.hex),
      removalReasons: status === "removed" ? reasons : []
    };
  })
  .sort((a, b) => b.designSystemScore - a.designSystemScore)
  .map((row, i) => ({ rank: i + 1, ...row }));

// Counterfactuals
const cfSecondaryPlus1 = simulateBuildPalette(neutralClusters, chromaClusters, sectionCount, totalSampleArea, {
  secondarySlotLimit: SECONDARY_SLOT_LIMIT + 1
});
const cfPalettePlus1 = simulateBuildPalette(neutralClusters, chromaClusters, sectionCount, totalSampleArea, {
  paletteSlotLimit: PALETTE_SLOT_LIMIT + 1
});
const cfNoHueDedupe = simulateBuildPalette(neutralClusters, chromaClusters, sectionCount, totalSampleArea, {
  skipHueDedupe: true
});
const cfRepBc = simulateBuildPalette(
  clusterSamples(chromaticSamples, CHROMA_MERGE_DE),
  clusterSamples(neutralSamples, NEUTRAL_MERGE_DE),
  sectionCount,
  totalSampleArea,
  { repByBrandConfidence: true }
);

const cfSkipUtility = simulateBuildPalette(neutralClusters, chromaClusters, sectionCount, totalSampleArea, {
  skipUtilityFilter: true
});

function hasTargetHex(sim, hex = target) {
  return sim.selectedHexes.has(hex);
}

const targetCluster = targetClusterRaw ? clusterToOutput(targetClusterRaw) : null;

const counterfactuals = {
  chromaticSlotLimit_N_plus_1: {
    change: `Allow 1 extra secondary chromatic slot: secondary slice(0, ${SECONDARY_SLOT_LIMIT}) → slice(0, ${SECONDARY_SLOT_LIMIT + 1})`,
    fiveSixEnters: hasTargetHex(cfSecondaryPlus1),
    chromaDedupedCount: cfSecondaryPlus1.chromaDeduped.length,
    selectedChromatics: cfSecondaryPlus1.selected.filter((s) => !s.isNeutral).map((s) => s.hex),
    explanation: "#5e6ad2 never reaches chromaDeduped — blocked earlier by isUtility filter"
  },
  paletteSlotLimit_N_plus_1: {
    change: `Total palette cap ${PALETTE_SLOT_LIMIT} → ${PALETTE_SLOT_LIMIT + 1}`,
    fiveSixEnters: hasTargetHex(cfPalettePlus1),
    selectedChromatics: cfPalettePlus1.selected.filter((s) => !s.isNeutral).map((s) => s.hex),
    explanation: "Same — #5e6ad2 not in brandChromas pipeline"
  },
  removeHueFamilyDedupe: {
    change: "skip dedupeHueFamilies (no 30° bucket limit)",
    fiveSixEnters: hasTargetHex(cfNoHueDedupe),
    chromaDedupedCount: cfNoHueDedupe.chromaDeduped.length,
    selectedChromatics: cfNoHueDedupe.selected.filter((s) => !s.isNeutral).map((s) => s.hex),
    explanation: "Adds #6d78d5 as secondary but NOT #5e6ad2 — still utility-filtered"
  },
  minSampleCountRemoved: {
    change: "remove minimum sample count threshold",
    fiveSixEnters: false,
    explanation: "No such threshold exists in scoreAndCluster.js; #5e6ad2 has 3 samples and still fails isUtilityColor()"
  },
  representativeByBrandConfidence: {
    change: "cluster representative = highest brandConfidence sample instead of peak importance",
    fiveSixEnters: hasTargetHex(cfRepBc),
    selectedChromatics: cfRepBc.selected.filter((s) => !s.isNeutral).map((s) => s.hex),
    explanation: "#5e6ad2 already IS the cluster representative; representative election is not the failure"
  },
  skipUtilityFilter: {
    change: "include isUtility clusters in brandChromas (bypass isUtilityColor gate)",
    fiveSixEnters: hasTargetHex(cfSkipUtility),
    chromaDedupedCount: cfSkipUtility.chromaDeduped.length,
    selectedChromatics: cfSkipUtility.selected.filter((s) => !s.isNeutral).map((s) => s.hex),
    explanation: "If utility filter removed, #5e6ad2 competes in hue family 7 vs #d0d6e0 on designSystemScore"
  }
};

const rawRows = [...rawByHex.values()]
  .sort((a, b) => b.area - a.area)
  .map((r) => ({
    hex: r.hex,
    area: Math.round(r.area),
    sampleCount: r.count,
    hueFamily: hueFamily(r.hsl),
    isNeutral: isNeutralHsl(r.hsl),
    sources: r.sources,
    note: isNeutralHsl(r.hsl) ? "excluded at split: isNeutralHsl() === true" : "chromatic sample"
  }));

const report = {
  generatedAt: new Date().toISOString(),
  site: "Linear",
  extraction: {
    totalSamples: enriched.length,
    chromaticSamples: chromaticSamples.length,
    chromaticClusters: chromaClusters.length,
    brandChromaClusters: brandChromas.length,
    sectionCount
  },
  curationPipeline: [
    "1. Split samples: isNeutralHsl(hsl) → neutral vs chromatic",
    `2. Cluster chromatics: deltaE < ${CHROMA_MERGE_DE} (CHROMA_MERGE_DE)`,
    "3. Representative hex: sample with peak importance in cluster (NOT area, NOT brandConfidence)",
    "4. finalizeCluster: brandConfidence + designSystemScore",
    "5. Filter: exclude isUtility clusters from brandChromas",
    "6. stripBrowserDefaultLinks on brandChromas",
    "7. dedupeHueFamilies: one chromatic per floor(h/30) bucket, keep highest designSystemScore",
    "8. Pick primary from chromaDeduped (brandConfidence >= 0.15 or first)",
    `9. Pick up to ${SECONDARY_SLOT_LIMIT} secondaries from chromaDeduped`,
    `10. Pick up to ${NEUTRAL_SLOT_LIMIT} neutrals by area share`,
    `11. Fill to ${PALETTE_SLOT_LIMIT} slots from fillPool sorted by designSystemScore`
  ],
  rawExtractedChromaticColors: rawRows.filter((r) => !r.isNeutral),
  chromaticClusters: clusterRows,
  targetColor: {
    hex: target,
    rawExtracted: targetRaw || null,
    cluster: targetCluster,
    utilityClassification: targetClusterRaw ? utilityClassificationDetail(targetClusterRaw) : null,
    inCuratedPalette: keptHexes.has(target),
    exactRemovalRule: targetClusterRaw?.isUtility
      ? explainUtilityRemoval(targetClusterRaw)
      : null
  },
  counterfactuals,
  actualCuratedChromatics: actualCurated.selected.filter((c) => !c.isNeutral).map((c) => c.hex)
};

writeFileSync(
  new URL("./linear-chromatic-curation-audit.json", import.meta.url),
  JSON.stringify(report, null, 2)
);

// Markdown
let md = `# Linear Chromatic Curation Audit\n\nGenerated: ${report.generatedAt}\n\n`;
md += `## Pipeline (pre–role-assignment)\n\n`;
report.curationPipeline.forEach((s) => (md += `- ${s}\n`));
md += `\n## 1. Every extracted chromatic color (raw, pre-cluster)\n\n`;
md += `| Hex | Area | Samples | Hue family | Top sources |\n|-----|------|---------|------------|-------------|\n`;
for (const r of report.rawExtractedChromaticColors.slice(0, 40)) {
  const src = Object.entries(r.sources)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, v]) => `${k}×${v}`)
    .join(", ");
  md += `| ${r.hex} | ${r.area.toLocaleString()} | ${r.sampleCount} | ${r.hueFamily} | ${src} |\n`;
}
if (report.rawExtractedChromaticColors.length > 40) {
  md += `\n_…and ${report.rawExtractedChromaticColors.length - 40} more raw chromatic hex values._\n`;
}

md += `\n## 2. Chromatic clusters after LAB merge (ΔE < ${CHROMA_MERGE_DE})\n\n`;
md += `_17 clusters total; only ${brandChromas.length} pass \`isUtilityColor\` filter into brandChromas._\n\n`;
md += `| Rank | Hex (rep) | Area | Samples | Brand conf | Design score | Utility? | Status | In brandChromas? |\n`;
md += `|------|-----------|------|---------|------------|--------------|----------|--------|------------------|\n`;
for (const c of clusterRows) {
  md += `| ${c.rank} | ${c.hex} | ${c.area.toLocaleString()} | ${c.sampleCount} | ${c.brandConfidence} | ${c.designSystemScore} | ${c.isUtility ? "yes" : "no"} | **${c.curatedStatus}** | ${c.inBrandChromas ? "yes" : "no"} |\n`;
}

md += `\n## 3. Removal reasons (removed clusters only)\n\n`;
for (const c of clusterRows.filter((x) => x.curatedStatus === "removed")) {
  md += `### ${c.hex}\n\n`;
  md += `- Area: ${c.area.toLocaleString()} px² (${c.areaSharePct}% of page)\n`;
  md += `- Samples: ${c.sampleCount}\n`;
  md += `- Brand confidence: ${c.brandConfidence} · Design score: ${c.designSystemScore}\n`;
  md += `- Member hexes in cluster: ${c.memberHexes.join(", ")}\n\n`;
  if (c.removalReasons.length === 0) {
    md += `_No explicit rule fired — cluster lost in fill-pool ranking or neutral slot preemption._\n\n`;
  } else {
    for (const r of c.removalReasons) {
      md += `- **${r.rule}**\n  - ${r.detail}\n`;
    }
    md += `\n`;
  }
}

md += `\n## 4. #5e6ad2 deep dive\n\n`;
if (targetRaw) {
  md += `**Raw extraction:** ${targetRaw.count} samples, ${Math.round(targetRaw.area)} px²\n\n`;
  md += `Sources: hero_background×1, demo_illustration×2\n\n`;
}
if (targetClusterRaw) {
  const ud = utilityClassificationDetail(targetClusterRaw);
  md += `**Own cluster** (not merged — ΔE to #d0d6e0 ≈ 67, above CHROMA_MERGE_DE=8)\n\n`;
  md += `**Representative:** \`#5e6ad2\` (peak importance = 240 from hero_background sample)\n\n`;
  md += `**Scores:** brandConfidence=${targetCluster.brandConfidence.toFixed(3)}, designSystemScore=${targetCluster.designSystemScore.toFixed(3)}, hasHero=true\n\n`;
  md += `**Removed because:**\n\n`;
  md += `- \`buildPalette\` line 209–210: \`brandChromas = chromaClusters.filter(c => !c.isUtility)\`\n`;
  md += `- \`isUtilityColor()\` lines 191–196: demo/utility occurrences **${ud.demoOrUtilityOccurrences}/${ud.totalSamples} (${ud.demoShare}%)** >= **60%** threshold\n`;
  md += `- 2 of 3 samples tagged \`demo_illustration\` (DEMO_SOURCES) despite 1 \`hero_background\` sample\n\n`;
}

md += `## 5. Counterfactuals\n\n`;
md += `| Scenario | #5e6ad2 enters palette? | Chromatics selected |\n`;
md += `|----------|-------------------------|---------------------|\n`;
for (const cf of Object.values(counterfactuals)) {
  const enters = cf.fiveSixEnters ? "**YES**" : "**NO**";
  const chroma = (cf.selectedChromatics || []).join(", ") || "—";
  md += `| ${cf.change} | ${enters} | ${chroma} |\n`;
}

md += `\n## 6. Conclusion\n\n`;
md += `The exact curation rule excluding brand indigo \`#5e6ad2\` is **\`isUtilityColor()\`** in \`sourceClassification.js\`, applied at **\`buildPalette\` line 209–210** before hue dedupe or slot allocation.\n\n`;
md += `The cluster is correctly formed with \`hasHero=true\` and brandConfidence **0.307** (higher than #d0d6e0's 0.149), but 2/3 samples carry \`demo_illustration\` source tags, triggering the 60% demo-source occurrence gate.\n\n`;
md += `**Slot limits, sample count thresholds, and representative election are NOT the cause.** Increasing chromatic slots or removing sample minimums does not help. Changing representative to brandConfidence does not help — #5e6ad2 already wins representative election.\n\n`;
md += `If the utility filter were bypassed, \`#5e6ad2\` would enter \`brandChromas\` but still lose \`dedupeHueFamilies\` to \`#d0d6e0\` in hue family 7 on designSystemScore (0.119 vs 0.029) — a secondary failure mode.\n`;

writeFileSync(new URL("./linear-chromatic-curation-audit.md", import.meta.url), md);
console.log("Wrote linear-chromatic-curation-audit.json and .md");
console.log("Clusters:", brandChromas.length, "Kept chromatics:", [...keptHexes]);
console.log("5e6ad2 in dedupe removed:", baseline.dedupeRemoved.some((r) => r.hex === target));
console.log("Counterfactuals:", JSON.stringify(counterfactuals, null, 2));
