/**
 * Linear PRODUCT_DEMO audit — run extraction in browser, then:
 *   node scripts/linear-product-demo-audit.mjs scripts/linear-product-demo-extraction.json
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { curatePalette } from "../src/core/scoreAndCluster.js";
import { assignRoles } from "../src/core/assignRoles.js";
import { weightForSource } from "../src/core/sourceClassification.js";

const TARGETS = ["#5e6ad2", "#eb5757", "#00b8cc", "#08090a", "#d0d6e0"];
const inputPath = process.argv[2] || new URL("./linear-product-demo-extraction.json", import.meta.url);

if (!existsSync(inputPath)) {
  console.error(`Missing extraction file: ${inputPath}`);
  console.error("Run browser extraction first (see scripts/linear-product-demo-audit-browser.js)");
  process.exit(1);
}

const extraction = JSON.parse(readFileSync(inputPath, "utf8"));
const { samples } = extraction;

function summarizeByHex(samples, filterFn = () => true) {
  const byHex = new Map();
  for (const s of samples.filter(filterFn)) {
    const cur = byHex.get(s.hex) || {
      hex: s.hex,
      hits: 0,
      weightedImportance: 0,
      rawImportanceSum: 0,
      sources: {},
      contentZones: {},
      navHits: 0,
      demoHits: 0
    };
    cur.hits += 1;
    cur.weightedImportance += s.importance || 0;
    cur.rawImportanceSum += s.rawImportance || 0;
    cur.sources[s.sourceCategory] = (cur.sources[s.sourceCategory] || 0) + 1;
    if (s.contentZone) cur.contentZones[s.contentZone] = (cur.contentZones[s.contentZone] || 0) + 1;
    if (s.sourceCategory === "navigation") cur.navHits += 1;
    if (s.sourceCategory?.startsWith("demo_")) cur.demoHits += 1;
    byHex.set(s.hex, cur);
  }
  return byHex;
}

const productDemoSamples = samples.filter((s) => s.contentZone === "product_demo");
const demoRoots = new Map();
for (const s of productDemoSamples) {
  const key = s.sourceCategory || "default";
  demoRoots.set(key, (demoRoots.get(key) || 0) + 1);
}

const navBefore = samples.filter((s) => s.sourceCategory === "navigation");
const navLost = samples.filter((s) =>
  ["demo_navigation", "demo_sidebar", "demo_status"].includes(s.sourceCategory)
);

const targetSummary = {};
for (const hex of TARGETS) {
  const hits = samples.filter((s) => s.hex === hex);
  const navWeighted = hits
    .filter((s) => s.sourceCategory === "navigation")
    .reduce((a, s) => a + (s.importance || 0), 0);
  const demoWeighted = hits
    .filter((s) => s.sourceCategory?.startsWith("demo_"))
    .reduce((a, s) => a + (s.importance || 0), 0);
  const totalWeighted = hits.reduce((a, s) => a + (s.importance || 0), 0);
  targetSummary[hex] = {
    hits: hits.length,
    sourceBreakdown: hits.reduce((acc, s) => {
      acc[s.sourceCategory] = (acc[s.sourceCategory] || 0) + 1;
      return acc;
    }, {}),
    contentZones: hits.reduce((acc, s) => {
      const z = s.contentZone || "unknown";
      acc[z] = (acc[z] || 0) + 1;
      return acc;
    }, {}),
    totalWeightedImportance: totalWeighted,
    navigationWeighted: navWeighted,
    demoWeighted,
    avgWeightedPerHit: hits.length ? totalWeighted / hits.length : 0
  };
}

const curated = curatePalette(extraction);
const assigned = assignRoles(curated);

const paletteHexes = assigned.swatches.map((s) => ({
  hex: s.hex,
  role: s.role,
  score: s.designSystemScore,
  isUtility: s.isUtility
}));

const report = {
  generatedAt: new Date().toISOString(),
  site: "linear.app",
  fix: "PRODUCT_DEMO detection",
  extractionStats: {
    totalSamples: samples.length,
    productDemoSamples: productDemoSamples.length,
    productDemoShare: productDemoSamples.length / samples.length,
    websiteChromeSamples: samples.filter((s) => s.contentZone === "website_chrome").length,
    pageContentSamples: samples.filter((s) => s.contentZone === "page_content").length
  },
  productDemoSourceBreakdown: Object.fromEntries([...demoRoots.entries()].sort((a, b) => b[1] - a[1])),
  navigationDemotion: {
    remainingNavigationHits: navBefore.length,
    demotedToDemoHits: navLost.length,
    demotedColors: [...new Set(navLost.map((s) => s.hex))].sort()
  },
  targetColors: targetSummary,
  recomputedPalette: {
    mode: assigned.paletteMode,
    swatches: paletteHexes
  },
  verification: {
    indigoInPalette: paletteHexes.some((s) => s.hex === "#5e6ad2"),
    indigoRole: paletteHexes.find((s) => s.hex === "#5e6ad2")?.role || null,
    statusRedInSecondary: paletteHexes.some((s) => s.hex === "#eb5757" && s.role === "secondary"),
    statusCyanInSecondary: paletteHexes.some((s) => s.hex === "#00b8cc" && s.role === "secondary"),
    indigoWeightedVsBefore: {
      current: targetSummary["#5e6ad2"]?.totalWeightedImportance,
      note: "Compare to pre-fix navigation-weighted status colors"
    }
  },
  topClusters: curated.selected.slice(0, 12).map((c) => ({
    hex: c.hex,
    designSystemScore: c.designSystemScore,
    brandConfidence: c.brandConfidence,
    isUtility: c.isUtility,
    sourceCounts: c.sourceCounts,
    hasNav: c.hasNav
  }))
};

const outPath = new URL("./linear-product-demo-audit.json", import.meta.url);
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
