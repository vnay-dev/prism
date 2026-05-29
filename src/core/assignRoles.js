import { isNeutralHsl } from "./colorLab.js";
import { isBrowserDefaultLinkColor, stripBrowserDefaultLinks } from "./paletteSafeguards.js";

const FOUNDATION_AREA_THRESHOLD = 0.3;
const FOUNDATION_SECTION_RATIO = 0.5;

function foundationShare(entry) {
  return entry.foundationAreaShare ?? 0;
}

function isFoundationCandidate(entry, sectionCount) {
  if (!entry.isNeutral && !isNeutralHsl(entry.hsl)) return false;
  if (foundationShare(entry) <= 0) return false;
  const minSections = Math.max(2, Math.ceil(sectionCount * FOUNDATION_SECTION_RATIO));
  return foundationShare(entry) >= FOUNDATION_AREA_THRESHOLD && (entry.sectionCoverage || 0) >= minSections;
}

function pickFoundation(candidates, sectionCount) {
  return [...candidates]
    .filter((e) => isFoundationCandidate(e, sectionCount))
    .sort((a, b) => foundationShare(b) - foundationShare(a))[0];
}

function demoteBrowserDefaultRole(roleMap, selected) {
  for (const [hex, role] of [...roleMap.entries()]) {
    if (!["primary", "secondary", "accent"].includes(role)) continue;
    const entry = selected.find((e) => e.hex === hex);
    if (entry && isBrowserDefaultLinkColor(entry)) {
      roleMap.set(hex, "neutral");
    }
  }
}

export function assignRoles(curated) {
  const selected = [...(curated?.selected || [])];
  const sectionCount = curated?.sectionCount || 1;
  const roleMap = new Map();

  const foundationPool = [
    ...(curated?.allNeutrals || []),
    ...selected.filter((e) => e.isNeutral || isNeutralHsl(e.hsl))
  ];
  const seenFoundation = new Set();
  const uniqueFoundationPool = foundationPool.filter((e) => {
    if (seenFoundation.has(e.hex)) return false;
    seenFoundation.add(e.hex);
    return true;
  });

  const foundation = pickFoundation(uniqueFoundationPool, sectionCount);
  if (foundation) {
    const foundationHex = foundation.foundationSurfaceHex || foundation.hex;
    roleMap.set(foundationHex, "foundation");
  }

  const brandChromatics = stripBrowserDefaultLinks(
    selected.filter((e) => !e.isNeutral && !isNeutralHsl(e.hsl) && !e.isUtility)
  ).sort((a, b) => (b.brandConfidence || b.designSystemScore || 0) - (a.brandConfidence || a.designSystemScore || 0));

  const utilityChromatics = selected
    .filter((e) => !e.isNeutral && !isNeutralHsl(e.hsl) && e.isUtility)
    .sort((a, b) => (b.designSystemScore || 0) - (a.designSystemScore || 0));

  if (brandChromatics[0]) roleMap.set(brandChromatics[0].hex, "primary");
  for (const c of brandChromatics.slice(1, 3)) {
    if (!roleMap.has(c.hex)) roleMap.set(c.hex, "secondary");
  }

  const accentHint = selected.find(
    (e) => e.roleHint === "accent" && !roleMap.has(e.hex) && !isNeutralHsl(e.hsl) && !e.isUtility
  );
  if (accentHint) {
    roleMap.set(accentHint.hex, "accent");
  } else {
    const accentCandidate = brandChromatics.find((c) => {
      if (roleMap.has(c.hex)) return false;
      return c.hasCta || (c.brandConfidence || 0) >= 0.2;
    });
    if (accentCandidate) roleMap.set(accentCandidate.hex, "accent");
  }

  if (![...roleMap.values()].includes("accent") && utilityChromatics[0]) {
    roleMap.set(utilityChromatics[0].hex, "accent");
  }

  const neutrals = selected
    .filter((e) => (e.isNeutral || isNeutralHsl(e.hsl)) && !roleMap.has(e.hex))
    .sort((a, b) => (b.designSystemScore || 0) - (a.designSystemScore || 0));
  for (const n of neutrals.slice(0, 4)) {
    roleMap.set(n.hex, "neutral");
  }

  for (const entry of selected) {
    if (!roleMap.has(entry.hex)) {
      if (entry.isUtility) roleMap.set(entry.hex, "accent");
      else roleMap.set(entry.hex, entry.isNeutral ? "neutral" : "secondary");
    }
  }

  for (const [hex, role] of [...roleMap.entries()]) {
    const entry = selected.find((e) => e.hex === hex);
    if (!entry) continue;
    if (entry.isUtility && (role === "primary" || role === "secondary")) {
      roleMap.set(hex, "accent");
    }
  }

  demoteBrowserDefaultRole(roleMap, selected);

  const rolePriority = {
    foundation: 0,
    primary: 1,
    secondary: 2,
    accent: 3,
    neutral: 4
  };

  const foundationDisplay = foundation
    ? {
        ...foundation,
        hex: foundation.foundationSurfaceHex || foundation.hex,
        rgb: foundation.foundationSurfaceRgb || foundation.rgb,
        hsl: foundation.foundationSurfaceHsl || foundation.hsl
      }
    : null;

  const swatchEntries =
    foundationDisplay && !selected.some((e) => e.hex === foundationDisplay.hex)
      ? [
          foundationDisplay,
          ...selected.filter(
            (e) => e.hex !== foundationDisplay.hex && e.hex !== foundation.hex
          )
        ]
      : selected;

  const swatches = swatchEntries
    .map((entry) => ({
      hex: entry.hex,
      role: roleMap.get(entry.hex) || "neutral",
      score: Number((entry.designSystemScore || entry.memoryScore || entry.score || 0).toFixed(3)),
      brandConfidence: Number((entry.brandConfidence || 0).toFixed(3)),
      hsl: entry.hsl,
      areaShare: Number(((entry.areaShare || 0) * 100).toFixed(1)),
      isUtility: !!entry.isUtility,
      source: {
        usageWeight: Number((entry.usageWeight || 0).toFixed(0)),
        semanticWeight: Number((entry.semanticWeight || 0).toFixed(0)),
        sectionCoverage: entry.sectionCoverage || 0,
        sourceCounts: entry.sourceCounts || {}
      }
    }))
    .sort((a, b) => rolePriority[a.role] - rolePriority[b.role] || b.score - a.score)
    .slice(0, 8);

  const chromatics = swatches.filter((s) => !isNeutralHsl(s.hsl));

  return {
    sampledElements: curated?.sampledElements || 0,
    rankedCount: curated?.rankedCount || selected.length,
    sectionCount,
    paletteMode: chromatics.some((s) => s.role === "primary") ? "brand" : "foundation",
    swatches
  };
}
