import {
  dominantFontWeight,
  formatFontRole,
  formatWeightsList,
  isEmojiFont,
  isGenericFamily,
  isSystemFont,
  normalizeFontKey,
  normalizeFontWeight,
  resolvePrimaryFont,
  snapFontWeight
} from "./fontUtils.js";

const CONTEXT_WEIGHT = {
  heading: 1.4,
  button: 1.2,
  link: 1.05,
  text: 1,
  other: 0.85
};

const ZONE_WEIGHT = {
  website_chrome: 1.25,
  page_content: 1,
  product_demo: 0.35
};

const HEADING_LEVEL_WEIGHT = {
  1: 1.5,
  2: 1.35,
  3: 1.15,
  4: 1.05,
  5: 1,
  6: 0.95
};

const HEADING_SOURCES = new Set(["hero_cta", "hero_background", "navigation", "logo", "primary_button"]);
const UI_SOURCES = new Set(["navigation", "primary_button", "hero_cta"]);

// A page commonly uses more than three distinct fonts (e.g. a display heading,
// body, a mono/code face, and an accent). Cap the surfaced set generously and
// keep any family that holds a meaningful share of on-page text so distinct
// fonts aren't silently dropped.
const MAX_FONTS = 6;
const MIN_AREA_SHARE = 0.01;
const MIN_SCORE_SHARE = 0.02;

function sampleScore(sample) {
  const contextWeight = CONTEXT_WEIGHT[sample.context] || CONTEXT_WEIGHT.other;
  const zoneWeight = ZONE_WEIGHT[sample.contentZone] || ZONE_WEIGHT.page_content;
  const brandWeight = sample.brandWeight || 1;
  const importance = sample.importance || sample.rawImportance || 1;
  const area = sample.area || 0;
  const fontSize = sample.fontSize || 16;
  const visibility = sample.viewportVisible === false ? 0.5 : 1;
  const headingBoost = sample.headingLevel
    ? HEADING_LEVEL_WEIGHT[sample.headingLevel] || 1
    : sample.context === "heading"
      ? 1.2
      : 1;
  const systemPenalty = isSystemFont(sample.family) ? 0.35 : 1;

  return (
    area *
    importance *
    brandWeight *
    contextWeight *
    zoneWeight *
    headingBoost *
    visibility *
    (fontSize / 16) *
    systemPenalty
  );
}

function weightBucketScore(sample) {
  const base = sampleScore(sample);
  const textLengthBoost = Math.min(1.35, 1 + (sample.textLength || 0) / 400);
  return base * textLengthBoost;
}

function createWeightBucket() {
  return {
    score: 0,
    frequency: 0,
    headingScore: 0,
    sectionIds: new Set(),
    prominence: 0
  };
}

function aggregateFamilies(fontSamples, sectionCount = 1) {
  const families = new Map();

  for (const sample of fontSamples) {
    const key = normalizeFontKey(sample.family);
    if (!key) continue;

    const entry = families.get(key) || {
      family: sample.family,
      totalArea: 0,
      totalScore: 0,
      headingScore: 0,
      textScore: 0,
      uiScore: 0,
      sectionIds: new Set(),
      weightBuckets: new Map(),
      hasHeroHeading: false,
      hasNav: false,
      sourceCategories: new Set(),
      sampleCount: 0
    };

    const score = sampleScore(sample);
    entry.totalArea += sample.area || 0;
    entry.totalScore += score;
    entry.sampleCount += 1;
    if (sample.sectionId) entry.sectionIds.add(sample.sectionId);

    const snappedWeight = snapFontWeight(sample.weight);
    const bucket = entry.weightBuckets.get(snappedWeight) || createWeightBucket();
    const bucketContribution = weightBucketScore(sample);

    bucket.score += bucketContribution;
    bucket.frequency += 1;
    bucket.prominence += bucketContribution;
    if (sample.sectionId) bucket.sectionIds.add(sample.sectionId);
    if (sample.context === "heading" || sample.headingLevel) {
      bucket.headingScore += bucketContribution;
      entry.headingScore += score;
      if (sample.rawImportance >= 60 || sample.contentZone === "website_chrome") {
        entry.hasHeroHeading = true;
      }
    } else if (sample.context === "text") {
      entry.textScore += score;
    } else if (sample.context === "button" || sample.context === "link") {
      entry.uiScore += score;
    }

    entry.weightBuckets.set(snappedWeight, bucket);

    if (UI_SOURCES.has(sample.sourceCategory)) entry.hasNav = true;
    if (HEADING_SOURCES.has(sample.sourceCategory)) entry.headingScore += score * 0.15;
    entry.sourceCategories.add(sample.sourceCategory);
    families.set(key, entry);
  }

  const maxSectionCoverage = Math.max(sectionCount, 1);

  return [...families.values()]
    .map((entry) => ({
      ...entry,
      sectionCoverage: entry.sectionIds.size / maxSectionCoverage,
      identityScore: computeIdentityScore(entry, maxSectionCoverage)
    }))
    .sort((a, b) => b.totalScore - a.totalScore);
}

function computeIdentityScore(entry, sectionCount) {
  const sectionSpread = entry.sectionIds.size / Math.max(sectionCount, 1);
  const headingSignal = entry.headingScore / Math.max(entry.totalScore, 1);
  const heroBoost = entry.hasHeroHeading ? 0.12 : 0;
  const navBoost = entry.hasNav ? 0.06 : 0;
  const raw = sectionSpread * 0.42 + headingSignal * 0.34 + heroBoost + navBoost;
  return Math.round(Math.min(1, raw) * 100);
}

function selectSignificantWeights(entry) {
  const buckets = [...entry.weightBuckets.entries()]
    .map(([weight, data]) => ({
      weight,
      score: data.score,
      frequency: data.frequency,
      sectionCoverage: data.sectionIds.size,
      headingScore: data.headingScore,
      prominence: data.prominence
    }))
    .sort((a, b) => a.weight - b.weight);

  if (!buckets.length) return [400];

  const totalWeightScore = buckets.reduce((sum, bucket) => sum + bucket.score, 0);
  const totalFrequency = buckets.reduce((sum, bucket) => sum + bucket.frequency, 0);
  const minScoreThreshold = totalWeightScore * 0.06;
  const minFrequency =
    totalFrequency <= 4 ? 1 : Math.max(2, Math.ceil(totalFrequency * 0.05));

  let significant = buckets.filter(
    (bucket) =>
      bucket.score >= minScoreThreshold ||
      bucket.frequency >= minFrequency ||
      bucket.headingScore >= totalWeightScore * 0.08
  );

  if (!significant.length) {
    significant = [buckets.sort((a, b) => b.score - a.score)[0]];
  }

  if (significant.length > 4) {
    significant = significant
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .sort((a, b) => a.weight - b.weight);
  }

  return significant.map((bucket) => bucket.weight);
}

function selectSignificantFamilies(aggregated) {
  if (!aggregated.length) return [];

  const totalArea = aggregated.reduce((sum, entry) => sum + (entry.totalArea || 0), 0) || 1;
  const topScore = aggregated.reduce((max, entry) => Math.max(max, entry.totalScore || 0), 0);

  const significant = aggregated.filter((entry) => {
    const areaShare = (entry.totalArea || 0) / totalArea;
    const scoreShare = topScore ? (entry.totalScore || 0) / topScore : 0;
    return areaShare >= MIN_AREA_SHARE || scoreShare >= MIN_SCORE_SHARE;
  });

  return significant.length ? significant : aggregated.slice(0, 1);
}

function pickDistinct(candidates, usedKeys, scoreFn) {
  for (const entry of [...candidates].sort((a, b) => scoreFn(b) - scoreFn(a))) {
    const key = normalizeFontKey(entry.family);
    if (usedKeys.has(key)) continue;
    return entry;
  }
  return null;
}

function buildFontResult(entry, role) {
  const weights = selectSignificantWeights(entry);
  const dominantWeight = dominantFontWeight(weights);

  return {
    role,
    family: entry.family,
    weights,
    weightsLabel: formatWeightsList(weights),
    sectionsUsed: entry.sectionIds.size,
    sectionCount: entry.sectionIds.size,
    identityScore: entry.identityScore,
    weight: dominantWeight,
    roleLabel: formatFontRole(role),
    score: entry.totalScore,
    areaShare: entry.totalArea
  };
}

export function curateFonts(extraction) {
  const rawSamples = Array.isArray(extraction?.fontSamples) ? extraction.fontSamples : [];
  const tokenHints = Array.isArray(extraction?.fontTokens) ? extraction.fontTokens : [];
  const sectionCount = extraction?.sectionCount || 1;

  const fontSamples = rawSamples
    .map((sample) => ({
      ...sample,
      family: sample.family || resolvePrimaryFont(parseFontStackFallback(sample.stack || sample.fontFamily)),
      weight: normalizeFontWeight(sample.weight)
    }))
    .filter(
      (sample) =>
        sample.family && !isEmojiFont(sample.family) && !isGenericFamily(sample.family)
    );

  if (!fontSamples.length && !tokenHints.length) {
    return { fonts: [], hasFonts: false };
  }

  const aggregated = aggregateFamilies(fontSamples, sectionCount);
  const significant = selectSignificantFamilies(aggregated);
  const usedKeys = new Set();
  const fonts = [];

  const primary =
    pickDistinct(significant, usedKeys, (entry) => entry.headingScore || entry.totalScore) ||
    pickDistinct(significant, usedKeys, (entry) => entry.totalScore);

  if (primary) {
    usedKeys.add(normalizeFontKey(primary.family));
    fonts.push(buildFontResult(primary, "primary"));
  }

  const secondary =
    pickDistinct(
      significant.filter((entry) => entry.textScore > 0),
      usedKeys,
      (entry) => entry.textScore
    ) || pickDistinct(significant, usedKeys, (entry) => entry.totalScore);

  if (secondary) {
    usedKeys.add(normalizeFontKey(secondary.family));
    fonts.push(buildFontResult(secondary, "secondary"));
  }

  const tertiary = pickDistinct(
    significant.filter((entry) => entry.uiScore > 0),
    usedKeys,
    (entry) => entry.uiScore
  );
  if (tertiary && tertiary.totalScore > 0) {
    usedKeys.add(normalizeFontKey(tertiary.family));
    fonts.push(buildFontResult(tertiary, "tertiary"));
  }

  // Include every remaining significant family so genuinely-used fonts (a code
  // face, a second display font, etc.) aren't dropped just because the first
  // three roles were already filled.
  for (const entry of [...significant].sort((a, b) => b.totalScore - a.totalScore)) {
    if (fonts.length >= MAX_FONTS) break;
    const key = normalizeFontKey(entry.family);
    if (usedKeys.has(key)) continue;
    usedKeys.add(key);
    fonts.push(buildFontResult(entry, "supporting"));
  }

  for (const token of tokenHints) {
    if (fonts.length >= MAX_FONTS) break;
    const key = normalizeFontKey(token.family);
    if (!key || usedKeys.has(key) || isGenericFamily(token.family)) continue;

    const match = aggregated.find((entry) => normalizeFontKey(entry.family) === key);
    if (!match || match.totalScore < 1) continue;

    usedKeys.add(key);
    fonts.push(buildFontResult(match, "supporting"));
  }

  return {
    fonts,
    hasFonts: fonts.length > 0
  };
}

function parseFontStackFallback(value) {
  if (!value || typeof value !== "string") return [];
  return value
    .split(",")
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
}
