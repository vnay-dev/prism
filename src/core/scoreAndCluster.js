import { rgbToLab, deltaE, rgbToHsl, isNeutralHsl } from "./colorLab.js";
import {
  brandConfidence,
  classifyClusterUtility,
  designSystemScore,
  isUtilitySource,
  weightForSource
} from "./sourceClassification.js";
import {
  attachFoundationAreaShare,
  contributesFoundationArea,
  inferLegacySampleFields,
  stripBrowserDefaultLinks
} from "./paletteSafeguards.js";

const NEUTRAL_MERGE_DE = 5;
const CHROMA_MERGE_DE = 8;

function mergeClusterStats(cluster, sample) {
  cluster.totalArea += sample.area;
  cluster.totalImportance += sample.importance || 0;
  cluster.occurrences += 1;
  cluster.sectionIds.add(sample.sectionId);
  cluster.contexts.add(sample.context);
  cluster.contrastSum += sample.contrast || 0;

  const src = sample.sourceCategory || "default";
  cluster.sourceCounts[src] = (cluster.sourceCounts[src] || 0) + 1;
  cluster.brandWeightedImportance += (sample.importance || 0);

  if (src === "hero_background" || src === "hero_cta") cluster.hasHero = true;
  if (src === "hero_cta" || src === "primary_button") cluster.hasCta = true;
  if (src === "navigation") cluster.hasNav = true;

  if (contributesFoundationArea(sample)) {
    cluster.foundationArea += sample.area || 0;
    if (!cluster.foundationSurfaceByHex) cluster.foundationSurfaceByHex = {};
    const key = sample.hex;
    if (!cluster.foundationSurfaceByHex[key]) {
      cluster.foundationSurfaceByHex[key] = {
        hex: sample.hex,
        rgb: sample.rgb,
        hsl: sample.hsl,
        area: 0
      };
    }
    cluster.foundationSurfaceByHex[key].area += sample.area || 0;
  }

  if ((sample.importance || 0) > cluster.peakImportance) {
    cluster.representative = sample;
    cluster.peakImportance = sample.importance || 0;
  }
}

function newCluster(sample, lab, isNeutral) {
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
    isNeutral,
    foundationArea: contributesFoundationArea(sample) ? sample.area || 0 : 0,
    foundationSurfaceByHex: contributesFoundationArea(sample)
      ? {
          [sample.hex]: {
            hex: sample.hex,
            rgb: sample.rgb,
            hsl: sample.hsl,
            area: sample.area || 0
          }
        }
      : {}
  };
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
  cluster.brandConfidence = brandConfidence(cluster, sectionCount);
  cluster.isUtility = classifyClusterUtility(cluster, sectionCount);
  cluster.designSystemScore = designSystemScore(cluster, maxima, sectionCount);
  return cluster;
}

function clusterSamples(samples, threshold, isNeutralFn) {
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
    } else {
      clusters.push(newCluster(sample, lab, isNeutralFn(sample.hsl)));
    }
  }
  return clusters;
}

function dominantFoundationSurface(cluster) {
  const entries = Object.values(cluster.foundationSurfaceByHex || {});
  if (!entries.length) return null;
  return entries.sort((a, b) => b.area - a.area)[0];
}

function clusterToOutput(cluster) {
  const rep = cluster.representative;
  const foundationSurface = dominantFoundationSurface(cluster);
  return {
    hex: rep.hex,
    rgb: rep.rgb,
    hsl: rep.hsl,
    usageWeight: cluster.totalArea,
    semanticWeight: cluster.brandWeightedImportance,
    surfaceWeight: cluster.totalArea,
    score: cluster.designSystemScore,
    isNeutral: cluster.isNeutral,
    isUtility: cluster.isUtility,
    utilityRatio: cluster.utilityRatio,
    brandConfidence: cluster.brandConfidence,
    sectionCoverage: cluster.sectionIds.size,
    contextDiversity: cluster.contexts.size,
    occurrences: cluster.occurrences,
    memoryScore: cluster.designSystemScore,
    designSystemScore: cluster.designSystemScore,
    sourceCounts: { ...cluster.sourceCounts },
    hasHero: cluster.hasHero,
    hasCta: cluster.hasCta,
    hasNav: cluster.hasNav,
    contexts: [...cluster.contexts],
    tokenWeight: 0,
    tokenHints: [],
    foundationArea: cluster.foundationArea || 0,
    foundationSurfaceHex: foundationSurface?.hex,
    foundationSurfaceRgb: foundationSurface?.rgb,
    foundationSurfaceHsl: foundationSurface?.hsl
  };
}

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

function pickBrandAccent(chromatics) {
  return chromatics
    .filter((c) => !c.isUtility && c.hasCta && (c.contexts || []).includes("button"))
    .sort((a, b) => b.designSystemScore - a.designSystemScore)[0];
}

function pickUtilityAccent(chromatics) {
  return chromatics.filter((c) => c.isUtility).sort((a, b) => b.designSystemScore - a.designSystemScore)[0];
}

function buildPalette(neutralClusters, chromaClusters, sectionCount, totalSampleArea) {
  const allClusters = [...neutralClusters, ...chromaClusters];
  const maxima = {
    area: Math.max(...allClusters.map((c) => c.totalArea), 1),
    brandImportance: Math.max(...allClusters.map((c) => c.brandWeightedImportance), 1),
    contrast: Math.max(...allClusters.map((c) => c.contrastSum / c.occurrences), 0.01),
    occurrences: Math.max(...allClusters.map((c) => c.occurrences), 1)
  };

  for (const c of allClusters) finalizeCluster(c, maxima, sectionCount);

  const scoredNeutrals = neutralClusters
    .map((c) => ({ ...clusterToOutput(c), isNeutral: true }))
    .sort((a, b) => b.designSystemScore - a.designSystemScore);

  const brandChromas = chromaClusters
    .filter((c) => !c.isUtility)
    .map((c) => ({ ...clusterToOutput(c), isNeutral: false }))
    .sort((a, b) => b.designSystemScore - a.designSystemScore);

  const utilityChromas = chromaClusters
    .filter((c) => c.isUtility)
    .map((c) => ({ ...clusterToOutput(c), isNeutral: false }))
    .sort((a, b) => b.designSystemScore - a.designSystemScore);

  const chromaDeduped = dedupeHueFamilies(stripBrowserDefaultLinks(brandChromas));
  const accentCandidate =
    pickBrandAccent(chromaDeduped) || pickBrandAccent(stripBrowserDefaultLinks(brandChromas));

  const result = [];
  const used = new Set();

  const primary =
    chromaDeduped.find((c) => c.brandConfidence >= 0.15) || chromaDeduped[0];
  if (primary) {
    result.push({ ...primary, roleHint: "primary" });
    used.add(primary.hex);
  }

  for (const c of chromaDeduped.filter((x) => !used.has(x.hex)).slice(0, 2)) {
    result.push({ ...c, roleHint: "secondary" });
    used.add(c.hex);
  }

  if (accentCandidate && !used.has(accentCandidate.hex)) {
    result.push({ ...accentCandidate, roleHint: "accent" });
    used.add(accentCandidate.hex);
  }

  const neutralsByIdentity = [...scoredNeutrals].sort((a, b) => {
    const aFoundation = a.usageWeight / Math.max(totalSampleArea, 1);
    const bFoundation = b.usageWeight / Math.max(totalSampleArea, 1);
    return bFoundation - aFoundation || b.designSystemScore - a.designSystemScore;
  });

  for (const n of neutralsByIdentity.slice(0, 4)) {
    if (result.length >= 10) break;
    if (used.has(n.hex)) continue;
    result.push({ ...n, roleHint: "neutral" });
    used.add(n.hex);
  }

  const fillPool = [...chromaDeduped, ...scoredNeutrals, ...brandChromas].sort(
    (a, b) => b.designSystemScore - a.designSystemScore
  );
  for (const c of fillPool) {
    if (result.length >= 8) break;
    if (used.has(c.hex)) continue;
    result.push({ ...c, roleHint: c.isNeutral ? "neutral" : "secondary" });
    used.add(c.hex);
  }

  const utilityInPalette = result.filter((c) => c.isUtility).length;
  if (utilityInPalette === 0 && result.length < 8) {
    const utilityAccent = pickUtilityAccent(utilityChromas);
    if (utilityAccent && !used.has(utilityAccent.hex)) {
      result.push({ ...utilityAccent, roleHint: "accent" });
    }
  }

  return {
    selected: result.slice(0, 8),
    neutralDominant: chromaDeduped.length === 0,
    chromaCount: chromaDeduped.length,
    totalSampleArea,
    allNeutrals: scoredNeutrals
  };
}

function qualityAdjust(palette, sectionCount) {
  let { selected, neutralDominant, chromaCount } = palette;
  const brandChroma = selected.filter((c) => !c.isNeutral && !c.isUtility);
  const neutrals = selected.filter((c) => c.isNeutral);
  const utilities = selected.filter((c) => c.isUtility);

  if (utilities.length > 1) {
    const keep = utilities.sort((a, b) => b.designSystemScore - a.designSystemScore)[0];
    selected = selected.filter((c) => !c.isUtility || c.hex === keep.hex);
  }

  if (selected.some((c) => c.roleHint === "primary" && c.isUtility)) {
    selected = selected.map((c) =>
      c.roleHint === "primary" && c.isUtility ? { ...c, roleHint: "accent" } : c
    );
  }

  if (brandChroma.length === 0 && chromaCount > 0) {
    const topChroma = selected.filter((c) => !c.isNeutral && !c.isUtility).slice(0, 4);
    const topNeutral = neutrals.sort((a, b) => b.designSystemScore - a.designSystemScore).slice(0, 4);
    selected = [...topChroma, ...topNeutral].slice(0, 8);
  }

  if (!selected.some((c) => c.roleHint === "accent") && chromaCount > 0) {
    const accent = pickBrandAccent(selected.filter((c) => !c.isNeutral && !c.isUtility));
    if (accent && !selected.some((s) => s.hex === accent.hex)) {
      selected = [{ ...accent, roleHint: "accent" }, ...selected].slice(0, 8);
    }
  }

  return { selected, neutralDominant, rankedCount: selected.length };
}

function legacyCandidatesToSamples(rawExtraction) {
  const candidates = rawExtraction?.candidates || [];
  return {
    samples: candidates.map((c, i) => {
      const inferred = inferLegacySampleFields(
        {
          hex: c.hex,
          rgb: c.rgb,
          hsl: c.hsl,
          area: c.surfaceWeight || c.usageWeight || 100,
          importance: (c.semanticWeight || 50) * weightForSource(c.sourceCategory || "default"),
          rawImportance: c.semanticWeight || 50,
          brandWeight: weightForSource(c.sourceCategory || "default"),
          sourceCategory: c.sourceCategory,
          sectionId: `section-${i % 3}`,
          context: c.context || "surface",
          contrast: 0.4,
          areaSourceType: c.areaSourceType
        },
        i
      );
      const brandWeight = weightForSource(inferred.sourceCategory);
      const rawImportance = c.semanticWeight || 50;
      return {
        ...inferred,
        importance: rawImportance * brandWeight,
        rawImportance,
        brandWeight
      };
    }),
    sectionCount: rawExtraction?.sectionCount || 3,
    sampledElements: rawExtraction?.sampledElements || candidates.length
  };
}

export function curatePalette(rawExtraction) {
  const payload =
    rawExtraction?.samples?.length > 0 ? rawExtraction : legacyCandidatesToSamples(rawExtraction);
  const samples = payload.samples || [];
  const sectionCount = payload.sectionCount || payload.sections?.length || 1;

  if (!samples.length) {
    return { sampledElements: 0, selected: [], rankedCount: 0, neutralDominant: true, sectionCount };
  }

  const enriched = samples.map((s) => ({
    ...s,
    hsl: s.hsl || rgbToHsl(s.rgb),
    sourceCategory: s.sourceCategory || "default",
    importance: s.importance ?? (s.rawImportance || 1) * weightForSource(s.sourceCategory || "default")
  }));

  const totalSampleArea = enriched.reduce((sum, s) => sum + (s.area || 0), 0) || 1;
  const totalFoundationArea =
    enriched.reduce((sum, s) => sum + (contributesFoundationArea(s) ? s.area || 0 : 0), 0) || 1;
  const neutrals = enriched.filter((s) => isNeutralHsl(s.hsl));
  const chromatics = enriched.filter((s) => !isNeutralHsl(s.hsl));

  const neutralClusters = clusterSamples(neutrals, NEUTRAL_MERGE_DE, () => true);
  const chromaClusters = clusterSamples(chromatics, CHROMA_MERGE_DE, () => false);

  const built = buildPalette(neutralClusters, chromaClusters, sectionCount, totalSampleArea);
  const adjusted = qualityAdjust(built, sectionCount);

  const selected = attachFoundationAreaShare(
    adjusted.selected.map((c) => ({
      ...c,
      areaShare: (c.usageWeight || 0) / totalSampleArea
    })),
    totalFoundationArea
  );

  return {
    sampledElements: payload.sampledElements || samples.length,
    selected,
    rankedCount: neutralClusters.length + chromaClusters.length,
    neutralDominant: built.neutralDominant,
    sectionCount,
    totalArea: totalSampleArea,
    totalFoundationArea,
    allNeutrals: attachFoundationAreaShare(
      built.allNeutrals?.map((c) => ({
        ...c,
        areaShare: (c.usageWeight || 0) / totalSampleArea
      })) || [],
      totalFoundationArea
    )
  };
}
