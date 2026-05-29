import { readFileSync, writeFileSync } from "fs";
import { curatePalette } from "../src/core/scoreAndCluster.js";
import { assignRoles } from "../src/core/assignRoles.js";
import {
  brandConfidence,
  isUtilityColor,
  isUtilitySource,
  weightForSource
} from "../src/core/sourceClassification.js";
import { rgbToLab, deltaE, rgbToHsl, isNeutralHsl } from "../src/core/colorLab.js";

const raw = JSON.parse(readFileSync(new URL("./linear-raw-extraction.json", import.meta.url), "utf8"));
const prism = JSON.parse(readFileSync(new URL("./linear-prism-extraction.json", import.meta.url), "utf8"));

function hueFamilyName(h, s, l) {
  if (s <= 18 || l <= 12 || l >= 90) return "neutral";
  if (h >= 230 && h <= 259) return "indigo";
  if (h >= 260 && h <= 274) return "blue-violet";
  if (h >= 275 && h <= 289) return "violet";
  if (h >= 290 && h <= 320) return "purple";
  return "other-chroma";
}

const PROP_LABEL = {
  backgroundColor: "background-color",
  color: "text-color",
  borderTopColor: "border-color",
  fill: "svg-fill",
  stroke: "svg-stroke"
};

function aggregateRawPreClassification(samples) {
  const byHex = new Map();
  for (const s of samples) {
    const hsl = s.hsl || rgbToHsl(s.rgb);
    const cssProperty = PROP_LABEL[s.context === "surface" ? "backgroundColor" : s.context === "text" ? "color" : s.context === "border" ? "borderTopColor" : s.context === "icon" ? "fill" : "color"] || "unknown";
    const cur = byHex.get(s.hex) || {
      hex: s.hex,
      hsl,
      hueFamily: hueFamilyName(hsl.h, hsl.s, hsl.l),
      totalArea: 0,
      occurrences: 0,
      sections: new Set(),
      sources: {}
    };
    cur.totalArea += s.area;
    cur.occurrences += 1;
    cur.sections.add(s.sectionId);
    const prop = cssProperty;
    cur.sources[prop] = (cur.sources[prop] || 0) + 1;
    byHex.set(s.hex, cur);
  }
  return [...byHex.values()]
    .sort((a, b) => b.totalArea - a.totalArea)
    .slice(0, 50)
    .map((c) => ({
      hex: c.hex,
      hsl: c.hsl,
      hueFamily: c.hueFamily,
      totalArea: Math.round(c.totalArea),
      occurrences: c.occurrences,
      sectionCount: c.sections.size,
      sources: c.sources
    }));
}

function clusterAndScoreAll(samples, sectionCount) {
  const NEUTRAL_DE = 5;
  const CHROMA_DE = 8;
  const clusters = [];

  for (const sample of samples) {
    const hsl = sample.hsl || rgbToHsl(sample.rgb);
    const lab = rgbToLab(sample.rgb);
    const isNeutral = isNeutralHsl(hsl);
    const threshold = isNeutral ? NEUTRAL_DE : CHROMA_DE;
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

  return clusters.map((c) => {
    const utilityWeighted = Object.entries(c.sourceCounts).reduce(
      (sum, [src, n]) => sum + (isUtilitySource(src) ? n * weightForSource(src) : 0),
      0
    );
    const totalSourceWeight = Object.entries(c.sourceCounts).reduce(
      (sum, [src, n]) => sum + n * weightForSource(src),
      0
    );
    c.utilityRatio = totalSourceWeight > 0 ? utilityWeighted / totalSourceWeight : 0;
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
      isUtility: c.isUtility,
      utilityRatio: Number(c.utilityRatio.toFixed(3)),
      brandConfidence: Number(confidence.toFixed(4)),
      sourceCounts: c.sourceCounts,
      hasHero: c.hasHero,
      hasCta: c.hasCta,
      hasNav: c.hasNav,
      sectionCount: c.sectionIds.size,
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
  });
}

const top50Raw = raw.top50Raw;
const curated = curatePalette(prism);
const assigned = assignRoles(curated);
const allScored = clusterAndScoreAll(prism.samples, prism.sectionCount).sort(
  (a, b) => b.scores.finalScore - a.scores.finalScore
);
const finalHexes = new Set(assigned.swatches.map((s) => s.hex));

const purpleFamilies = ["purple", "violet", "indigo", "blue-violet"];
const purpleFromRaw = raw.purpleFamily;
const purpleFromScored = allScored.filter((c) => purpleFamilies.includes(c.hueFamily));

function explainRejection(p, scored) {
  if (!scored) return "Color not present after LAB clustering merge.";
  const reasons = [];
  const dominantArea = top50Raw[0]?.totalArea || 1;
  const areaPct = ((p.totalArea || scored.totalArea) / dominantArea * 100).toFixed(3);
  if ((p.totalArea || scored.totalArea) < 100000) {
    reasons.push(`Tiny area footprint (${(p.totalArea || scored.totalArea).toLocaleString()} px², ~${areaPct}% of #f7f8f8 inflated text-color area)`);
  }
  if (scored.scores.areaScore < 0.01) reasons.push(`Area score ${scored.scores.areaScore} (8% weight in final)`);
  if (scored.brandConfidence < 0.25) {
    reasons.push(`Brand confidence ${scored.brandConfidence} — hero=${scored.hasHero} cta=${scored.hasCta} nav=${scored.hasNav}`);
  }
  if (scored.isUtility) reasons.push("Classified UTILITY_COLOR from source mix");
  const src = p.sources || {};
  if (src["svg-fill"] || src["svg-stroke"]) reasons.push("Often from SVG icon fills, not page-level brand surfaces");
  if (src["text-color"] && !src["background-color"]) reasons.push("Mostly text-color on elements, not background surfaces");
  const selected = curated.selected.map((c) => c.hex);
  if (!selected.includes(p.hex)) reasons.push("Not in curated top-8 after LAB merge + hue dedup + utility filter");
  else if (!finalHexes.has(p.hex)) reasons.push("In curated pool but lost role assignment to higher-ranked chromatics");
  const winners = assigned.swatches.map((s) => `${s.role}:${s.hex}`).join(", ");
  reasons.push(`Final palette: ${winners}`);
  return reasons.join("; ");
}

const report = {
  generatedAt: new Date().toISOString(),
  site: { url: raw.url, title: raw.title, viewport: raw.viewport },
  scan: {
    sectionsScanned: prism.sectionCount,
    rawSamples: prism.sampleCount,
    uniqueRawColors: raw.uniqueColors,
    gradientsSupported: false,
    gradientsSkippedOnLinear: raw.gradientSkipped
  },
  top50BeforeClassification: top50Raw,
  scoredClustersAll: allScored,
  purpleFamily: purpleFromRaw.map((p) => {
    const scored = allScored.find((c) => c.hex === p.hex);
    return {
      ...p,
      scored: scored?.scores,
      brandConfidence: scored?.brandConfidence,
      isUtility: scored?.isUtility,
      sourceCountsProduction: scored?.sourceCounts,
      inFinalPalette: finalHexes.has(p.hex),
      finalRole: assigned.swatches.find((s) => s.hex === p.hex)?.role || null,
      rejectionReason: finalHexes.has(p.hex) ? null : explainRejection(p, scored)
    };
  }),
  finalPalette: assigned.swatches,
  keyFindings: []
};

writeFileSync(new URL("./linear-diagnosis-report.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  finalPalette: assigned.swatches,
  purpleInFinal: report.purpleFamily.filter((p) => p.inFinalPalette),
  purpleRejected: report.purpleFamily.filter((p) => !p.inFinalPalette)
}, null, 2));
