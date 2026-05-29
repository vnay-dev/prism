/**
 * Rerun Linear diagnosis after area-fix only (no scoring/ranking changes).
 */
import { readFileSync, writeFileSync } from "fs";
import { curatePalette } from "../src/core/scoreAndCluster.js";
import { assignRoles } from "../src/core/assignRoles.js";
import {
  brandConfidence,
  isUtilityColor,
  isUtilitySource
} from "../src/core/sourceClassification.js";
import { rgbToLab, deltaE, rgbToHsl, isNeutralHsl } from "../src/core/colorLab.js";

const BEFORE = JSON.parse(readFileSync(new URL("./linear-prism-extraction.json", import.meta.url), "utf8"));
const AFTER = JSON.parse(readFileSync(new URL("./linear-prism-extraction-fixed.json", import.meta.url), "utf8"));

function hueFamilyName(h, s, l) {
  if (s <= 18 || l <= 12 || l >= 90) return "neutral";
  if (h >= 230 && h <= 259) return "indigo";
  if (h >= 260 && h <= 274) return "blue-violet";
  if (h >= 275 && h <= 289) return "violet";
  if (h >= 290 && h <= 320) return "purple";
  return "other-chroma";
}

function aggregateByHex(samples) {
  const byHex = new Map();
  for (const s of samples) {
    const hsl = s.hsl || rgbToHsl(s.rgb);
    const cur = byHex.get(s.hex) || {
      hex: s.hex,
      hsl,
      hueFamily: hueFamilyName(hsl.h, hsl.s, hsl.l),
      totalArea: 0,
      occurrences: 0,
      sections: new Set(),
      bySource: {}
    };
    cur.totalArea += s.area;
    cur.occurrences += 1;
    cur.sections.add(s.sectionId);
    const src = s.areaSourceType || "Unknown";
    cur.bySource[src] = (cur.bySource[src] || 0) + Math.round(s.area);
    byHex.set(s.hex, cur);
  }
  return [...byHex.values()]
    .sort((a, b) => b.totalArea - a.totalArea)
    .map((c) => ({
      hex: c.hex,
      hsl: c.hsl,
      hueFamily: c.hueFamily,
      totalArea: Math.round(c.totalArea),
      occurrences: c.occurrences,
      sectionCount: c.sections.size,
      bySource: c.bySource
    }));
}

function clusterAndScoreAll(samples, sectionCount) {
  const clusters = [];
  for (const sample of samples) {
    const hsl = sample.hsl || rgbToHsl(sample.rgb);
    const lab = rgbToLab(sample.rgb);
    const isNeutral = isNeutralHsl(hsl);
    const threshold = isNeutral ? 5 : 8;
    let best = null;
    let bestDist = threshold;
    for (const c of clusters) {
      const dist = deltaE(lab, c.lab);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    if (best) {
      best.totalArea += sample.area;
      best.brandWeightedImportance += sample.importance || 0;
      best.contrastSum += sample.contrast || 0;
      best.occurrences += 1;
      best.sectionIds.add(sample.sectionId);
      best.contexts.add(sample.context);
      const src = sample.sourceCategory || "default";
      best.sourceCounts[src] = (best.sourceCounts[src] || 0) + 1;
      if (src === "hero_background" || src === "hero_cta") best.hasHero = true;
      if (src === "hero_cta" || src === "primary_button") best.hasCta = true;
      if (src === "navigation") best.hasNav = true;
    } else {
      const src = sample.sourceCategory || "default";
      clusters.push({
        lab,
        hex: sample.hex,
        hsl,
        isNeutral,
        totalArea: sample.area,
        brandWeightedImportance: sample.importance || 0,
        contrastSum: sample.contrast || 0,
        occurrences: 1,
        sectionIds: new Set([sample.sectionId]),
        contexts: new Set([sample.context]),
        sourceCounts: { [src]: 1 },
        hasHero: src === "hero_background" || src === "hero_cta",
        hasCta: src === "hero_cta" || src === "primary_button",
        hasNav: src === "navigation"
      });
    }
  }

  const maxima = {
    area: Math.max(...clusters.map((c) => c.totalArea), 1),
    brandImportance: Math.max(...clusters.map((c) => c.brandWeightedImportance), 1),
    contrast: Math.max(...clusters.map((c) => c.contrastSum / c.occurrences), 0.01)
  };

  return clusters
    .map((c) => {
      const utilityWeighted = Object.entries(c.sourceCounts).reduce(
        (sum, [src, n]) => sum + (isUtilitySource(src) ? n : 0),
        0
      );
      const total = Object.values(c.sourceCounts).reduce((a, b) => a + b, 0);
      c.utilityRatio = total > 0 ? utilityWeighted / total : 0;
      c.isUtility = isUtilityColor(c.sourceCounts, c.utilityRatio);
      const confidence = brandConfidence(c, sectionCount);
      const sectionCoverageNorm = c.sectionIds.size / Math.max(sectionCount, 1);
      const areaNorm = c.totalArea / maxima.area;
      const brandSignal = c.brandWeightedImportance / maxima.brandImportance;
      const contrastNorm = c.contrastSum / c.occurrences / maxima.contrast;
      const utilityPenalty = c.isUtility ? 0.15 : c.utilityRatio > 0.35 ? 0.5 : 1;
      const finalScore =
        (confidence * 0.45 + brandSignal * 0.35 + sectionCoverageNorm * 0.12 + areaNorm * 0.08) *
        utilityPenalty;
      return {
        hex: c.hex,
        hsl: c.hsl,
        hueFamily: hueFamilyName(c.hsl.h, c.hsl.s, c.hsl.l),
        isNeutral: c.isNeutral,
        totalArea: Math.round(c.totalArea),
        scores: {
          areaScore: Number(areaNorm.toFixed(4)),
          sectionCoverage: Number(sectionCoverageNorm.toFixed(4)),
          interactionScore: Number(brandSignal.toFixed(4)),
          contrastScore: Number(contrastNorm.toFixed(4)),
          utilityPenalty,
          finalScore: Number(finalScore.toFixed(4))
        }
      };
    })
    .sort((a, b) => b.scores.finalScore - a.scores.finalScore);
}

function runPipeline(extraction) {
  const curated = curatePalette(extraction);
  const assigned = assignRoles(curated);
  const topColors = aggregateByHex(extraction.samples).slice(0, 20);
  const scored = clusterAndScoreAll(extraction.samples, extraction.sectionCount).slice(0, 20);
  return { topColors, scored, finalPalette: assigned.swatches, curated, assigned };
}

const beforeAgg = aggregateByHex(BEFORE.samples);
const afterAgg = aggregateByHex(AFTER.samples);
const beforeRun = runPipeline(BEFORE);
const afterRun = runPipeline(AFTER);

const report = {
  note: "Area attribution fix only — scoring, ranking, curation, classification unchanged.",
  sampleCount: { before: BEFORE.sampleCount, after: AFTER.sampleCount },
  areaContributions: AFTER.areaContributions?.slice(0, 40) || [],
  comparison: {
    f7f8f8: {
      before: beforeAgg.find((c) => c.hex === "#f7f8f8")?.totalArea,
      after: afterAgg.find((c) => c.hex === "#f7f8f8")?.totalArea
    },
    "08090a": {
      before: beforeAgg.find((c) => c.hex === "#08090a")?.totalArea,
      after: afterAgg.find((c) => c.hex === "#08090a")?.totalArea
    },
    "5e6ad2": {
      before: beforeAgg.find((c) => c.hex === "#5e6ad2")?.totalArea,
      after: afterAgg.find((c) => c.hex === "#5e6ad2")?.totalArea
    }
  },
  top20Colors: afterRun.topColors,
  updatedScores: afterRun.scored,
  finalPalette: afterRun.finalPalette,
  beforeFinalPalette: beforeRun.finalPalette,
  paletteChanged:
    beforeRun.finalPalette.map((s) => `${s.role}:${s.hex}`).join("|") !==
    afterRun.finalPalette.map((s) => `${s.role}:${s.hex}`).join("|")
};

writeFileSync(new URL("./linear-area-fix-report.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
