import { rgbToLab, deltaE, rgbToHsl, isNeutralHsl, isPureBlackOrWhite } from "./colorLab.js";
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

// Shuffle variety: how many top-ranked candidates each role is allowed to
// draw from when a seeded rng is supplied. A pool size of 1 (the default,
// rng-less path) always collapses back to the original deterministic pick.
const SHUFFLE_POOL_SIZES = {
  hueFamily: 6,
  primary: 8,
  secondary: 10,
  accent: 6,
  neutral: 16
};

/** Deterministic seeded PRNG (mulberry32) so a given seed always reproduces the same palette. */
function createSeededRng(seed) {
  let state = seed >>> 0 || 1;
  return function rng() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeAvoidHexes(avoidHexes) {
  if (!avoidHexes?.length) return new Set();
  return new Set(avoidHexes.map((hex) => String(hex || "").toLowerCase()));
}

/**
 * Uniform pick among the pool. Prefer candidates whose hex is not in
 * `avoid`, so shuffle can force a different combination than the last palette.
 * Falls back to the full pool when every candidate is avoided.
 */
function pickIndex(pool, rng, avoid) {
  if (pool.length <= 1) return 0;
  const preferred = [];
  for (let i = 0; i < pool.length; i++) {
    if (!avoid.has(String(pool[i].hex || "").toLowerCase())) preferred.push(i);
  }
  const choices = preferred.length ? preferred : pool.map((_, i) => i);
  return choices[Math.floor(rng() * choices.length)];
}

/**
 * Display options for a cluster during shuffle: only real sampled website
 * hexes from the cluster (no invented lighter/darker shades).
 */
function buildDisplayOptions(entry) {
  const bases = entry?.memberHexes?.length
    ? entry.memberHexes
    : [{ hex: entry.hex, rgb: entry.rgb, hsl: entry.hsl }];

  const options = [];
  const seen = new Set();
  for (const base of bases) {
    if (!base?.hex || isPureBlackOrWhite(base.hex)) continue;
    const key = String(base.hex).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      hex: base.hex,
      rgb: base.rgb,
      hsl: base.hsl || rgbToHsl(base.rgb)
    });
  }
  return options;
}

/**
 * Picks what hex to show for a selected cluster during shuffle.
 * Draws only from real website colors in the cluster, preferring options not
 * already on screen (`avoid`). Without an rng this is a no-op.
 */
function pickDisplayHex(entry, rng, avoid = new Set()) {
  if (!rng) return entry;
  const options = buildDisplayOptions(entry);
  if (!options.length) return entry;
  const idx = pickIndex(options, rng, avoid);
  const chosen = options[idx];
  return { ...entry, hex: chosen.hex, rgb: chosen.rgb, hsl: chosen.hsl };
}

/**
 * Picks `count` items from `candidates` without replacement.
 * Without an rng, this always returns the top `count` items in their given
 * order (identical to the previous hard-coded `.slice(0, count)` calls).
 * With an rng, it draws uniformly from the top `poolSize` candidates, preferring
 * colors not listed in `avoidHexes`.
 */
function sampleWithoutReplacement(candidates, count, poolSize, rng, avoid = new Set()) {
  const pool = candidates.slice(0, Math.max(poolSize, count));
  if (!rng) return pool.slice(0, count);

  const remaining = [...pool];
  const picked = [];
  while (picked.length < count && remaining.length) {
    const idx = pickIndex(remaining, rng, avoid);
    picked.push(remaining[idx]);
    remaining.splice(idx, 1);
  }
  return picked;
}

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

  if (!cluster.memberHexes[sample.hex]) {
    cluster.memberHexes[sample.hex] = { hex: sample.hex, rgb: sample.rgb, hsl: sample.hsl };
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
      : {},
    // Every distinct real hex absorbed into this cluster, keyed by hex. Lets
    // shuffle rotate the *displayed* swatch among visually-similar sampled
    // colors instead of always the single peak-importance representative,
    // which matters most on low-diversity pages where clusters are few.
    memberHexes: { [sample.hex]: { hex: sample.hex, rgb: sample.rgb, hsl: sample.hsl } }
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
    foundationSurfaceHsl: foundationSurface?.hsl,
    memberHexes: Object.values(cluster.memberHexes || {})
  };
}

function hueFamily(hsl) {
  return Math.floor((hsl.h % 360) / 30);
}

function dedupeHueFamilies(chromatics, rng, avoid) {
  const sorted = [...chromatics].sort((a, b) => b.designSystemScore - a.designSystemScore);
  const families = new Map();
  for (const c of sorted) {
    const fam = hueFamily(c.hsl);
    if (!families.has(fam)) families.set(fam, []);
    families.get(fam).push(c);
  }

  const kept = [];
  for (const familyMembers of families.values()) {
    const [pick] = sampleWithoutReplacement(
      familyMembers,
      1,
      rng ? SHUFFLE_POOL_SIZES.hueFamily : 1,
      rng,
      avoid
    );
    if (pick) kept.push(pick);
  }
  return kept;
}

function pickBrandAccent(chromatics, rng, poolSize = 1, avoid = new Set()) {
  const pool = chromatics
    .filter((c) => !c.isUtility && c.hasCta && (c.contexts || []).includes("button"))
    .sort((a, b) => b.designSystemScore - a.designSystemScore);
  return sampleWithoutReplacement(pool, 1, rng ? poolSize : 1, rng, avoid)[0];
}

function pickUtilityAccent(chromatics, rng, poolSize = 1, avoid = new Set()) {
  const pool = chromatics.filter((c) => c.isUtility).sort((a, b) => b.designSystemScore - a.designSystemScore);
  return sampleWithoutReplacement(pool, 1, rng ? poolSize : 1, rng, avoid)[0];
}

function buildPalette(neutralClusters, chromaClusters, sectionCount, totalSampleArea, rng, avoid) {
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

  const chromaDeduped = dedupeHueFamilies(stripBrowserDefaultLinks(brandChromas), rng, avoid);
  const accentCandidate =
    pickBrandAccent(chromaDeduped, rng, SHUFFLE_POOL_SIZES.accent, avoid) ||
    pickBrandAccent(stripBrowserDefaultLinks(brandChromas), rng, SHUFFLE_POOL_SIZES.accent, avoid);

  const result = [];
  const used = new Set();
  // Display hexes already shown in this palette — shade picks avoid these so
  // we don't end up with two identical-looking swatches.
  const usedDisplay = new Set([...avoid]);

  // When shuffling, consider every chromatic — not only high brandConfidence —
  // so alternate brand colors can become primary.
  const primaryPool = rng
    ? chromaDeduped
    : chromaDeduped.filter((c) => c.brandConfidence >= 0.15).length
      ? chromaDeduped.filter((c) => c.brandConfidence >= 0.15)
      : chromaDeduped;
  const [primary] = sampleWithoutReplacement(
    primaryPool,
    1,
    rng ? SHUFFLE_POOL_SIZES.primary : 1,
    rng,
    avoid
  );
  if (primary) {
    const shown = pickDisplayHex(primary, rng, usedDisplay);
    result.push({ ...shown, roleHint: "primary" });
    used.add(primary.hex);
    usedDisplay.add(String(shown.hex).toLowerCase());
  } else {
    // No brand chroma survived dedupe — still seed one chromatic (utility or a
    // soft/deep tinted neutral with visible saturation) so the palette is never
    // neutrals-only when the page has color.
    const softNeutralChromas = scoredNeutrals.filter(
      (c) => (c.hsl?.s || 0) > 18 && !isPureBlackOrWhite(c.hex)
    );
    const utilityPool = stripBrowserDefaultLinks([...utilityChromas, ...softNeutralChromas]);
    const [fallbackChroma] = sampleWithoutReplacement(
      utilityPool,
      1,
      rng ? SHUFFLE_POOL_SIZES.primary : 1,
      rng,
      avoid
    );
    if (fallbackChroma) {
      const shown = pickDisplayHex(fallbackChroma, rng, usedDisplay);
      result.push({ ...shown, roleHint: "primary" });
      used.add(fallbackChroma.hex);
      usedDisplay.add(String(shown.hex).toLowerCase());
    }
  }

  const secondaryPool = chromaDeduped.filter((x) => !used.has(x.hex));
  for (const c of sampleWithoutReplacement(
    secondaryPool,
    2,
    rng ? SHUFFLE_POOL_SIZES.secondary : 2,
    rng,
    avoid
  )) {
    const shown = pickDisplayHex(c, rng, usedDisplay);
    result.push({ ...shown, roleHint: "secondary" });
    used.add(c.hex);
    usedDisplay.add(String(shown.hex).toLowerCase());
  }

  if (accentCandidate && !used.has(accentCandidate.hex)) {
    const shown = pickDisplayHex(accentCandidate, rng, usedDisplay);
    result.push({ ...shown, roleHint: "accent" });
    used.add(accentCandidate.hex);
    usedDisplay.add(String(shown.hex).toLowerCase());
  }

  const neutralsByIdentity = [...scoredNeutrals].sort((a, b) => {
    const aFoundation = a.usageWeight / Math.max(totalSampleArea, 1);
    const bFoundation = b.usageWeight / Math.max(totalSampleArea, 1);
    return bFoundation - aFoundation || b.designSystemScore - a.designSystemScore;
  });

  const neutralPicks = sampleWithoutReplacement(
    neutralsByIdentity,
    4,
    rng ? SHUFFLE_POOL_SIZES.neutral : 4,
    rng,
    avoid
  );
  for (const n of neutralPicks) {
    if (result.length >= 10) break;
    if (used.has(n.hex)) continue;
    const shown = pickDisplayHex(n, rng, usedDisplay);
    result.push({ ...shown, roleHint: "neutral" });
    used.add(n.hex);
    usedDisplay.add(String(shown.hex).toLowerCase());
  }

  const fillPoolRanked = [...chromaDeduped, ...scoredNeutrals, ...brandChromas].sort(
    (a, b) => b.designSystemScore - a.designSystemScore
  );
  const fillPool = sampleWithoutReplacement(
    fillPoolRanked,
    fillPoolRanked.length,
    fillPoolRanked.length,
    rng,
    avoid
  );
  for (const c of fillPool) {
    if (result.length >= 8) break;
    if (used.has(c.hex)) continue;
    const shown = pickDisplayHex(c, rng, usedDisplay);
    result.push({ ...shown, roleHint: c.isNeutral ? "neutral" : "secondary" });
    used.add(c.hex);
    usedDisplay.add(String(shown.hex).toLowerCase());
  }

  const utilityInPalette = result.filter((c) => c.isUtility).length;
  if (utilityInPalette === 0 && result.length < 8) {
    const utilityAccent = pickUtilityAccent(utilityChromas, rng, SHUFFLE_POOL_SIZES.accent, avoid);
    if (utilityAccent && !used.has(utilityAccent.hex)) {
      const shown = pickDisplayHex(utilityAccent, rng, usedDisplay);
      result.push({ ...shown, roleHint: "accent" });
    }
  }

  return {
    selected: result.slice(0, 8),
    neutralDominant: chromaDeduped.length === 0 && utilityChromas.length === 0,
    chromaCount: chromaDeduped.length + utilityChromas.length,
    totalSampleArea,
    allNeutrals: scoredNeutrals,
    allChromas: [
      ...chromaDeduped,
      ...utilityChromas.map((c) => ({ ...c, isNeutral: false }))
    ]
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
    // Prefer any chromatic already selected (including utility); do not rebuild
    // from an empty non-utility filter.
    const topChroma = selected
      .filter((c) => !c.isNeutral)
      .sort((a, b) => b.designSystemScore - a.designSystemScore)
      .slice(0, 4);
    const topNeutral = neutrals.sort((a, b) => b.designSystemScore - a.designSystemScore).slice(0, 4);
    if (topChroma.length) {
      selected = [...topChroma, ...topNeutral].slice(0, 8);
    }
  }

  if (!selected.some((c) => c.roleHint === "accent") && chromaCount > 0) {
    const accent = pickBrandAccent(selected.filter((c) => !c.isNeutral && !c.isUtility));
    if (accent && !selected.some((s) => s.hex === accent.hex)) {
      selected = [{ ...accent, roleHint: "accent" }, ...selected].slice(0, 8);
    }
  }

  return { selected, neutralDominant, rankedCount: selected.length, allChromas: palette.allChromas || [] };
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

export function curatePalette(rawExtraction, options = {}) {
  const payload =
    rawExtraction?.samples?.length > 0 ? rawExtraction : legacyCandidatesToSamples(rawExtraction);
  const samples = payload.samples || [];
  const sectionCount = payload.sectionCount || payload.sections?.length || 1;

  if (!samples.length) {
    return { sampledElements: 0, selected: [], rankedCount: 0, neutralDominant: true, sectionCount };
  }

  const rng = options.seed != null ? createSeededRng(options.seed) : null;
  const avoid = normalizeAvoidHexes(options.avoidHexes);

  const enriched = samples
    .filter((s) => !isPureBlackOrWhite(s.hex))
    .map((s) => ({
      ...s,
      hsl: s.hsl || rgbToHsl(s.rgb),
      sourceCategory: s.sourceCategory || "default",
      importance: s.importance ?? (s.rawImportance || 1) * weightForSource(s.sourceCategory || "default")
    }));

  if (!enriched.length) {
    return { sampledElements: samples.length, selected: [], rankedCount: 0, neutralDominant: true, sectionCount };
  }

  const totalSampleArea = enriched.reduce((sum, s) => sum + (s.area || 0), 0) || 1;
  const totalFoundationArea =
    enriched.reduce((sum, s) => sum + (contributesFoundationArea(s) ? s.area || 0 : 0), 0) || 1;
  const neutrals = enriched.filter((s) => isNeutralHsl(s.hsl));
  const chromatics = enriched.filter((s) => !isNeutralHsl(s.hsl));

  const neutralClusters = clusterSamples(neutrals, NEUTRAL_MERGE_DE, () => true);
  const chromaClusters = clusterSamples(chromatics, CHROMA_MERGE_DE, () => false);

  const built = buildPalette(neutralClusters, chromaClusters, sectionCount, totalSampleArea, rng, avoid);
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
    ),
    allChromas: built.allChromas || adjusted.allChromas || []
  };
}
