/**
 * Before/after comparison for foundation, SVG, and browser-link fixes.
 * Usage: node scripts/generate-fix-comparison.mjs
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { curatePalette } from "../src/core/scoreAndCluster.js";
import { assignRoles } from "../src/core/assignRoles.js";
import { contributesFoundationArea } from "../src/core/paletteSafeguards.js";

const BEFORE_DIR = new URL("./benchmark-extractions-before-fixes/", import.meta.url);
const AFTER_DIR = new URL("./benchmark-extractions/", import.meta.url);
const BEFORE_REPORT = new URL("./benchmark-report-before-fixes.json", import.meta.url);
const AFTER_REPORT = new URL("./benchmark-report.json", import.meta.url);

const SITES = [
  "linear",
  "stripe",
  "spotify",
  "vercel",
  "notion",
  "framer",
  "apple",
  "netflix",
  "slack"
];

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function paletteMap(report) {
  const map = new Map();
  for (const r of report.reports || []) {
    const roles = {};
    for (const s of r.finalPalette || []) roles[s.role] = s.hex;
    map.set(r.site.toLowerCase().replace(/\s+/g, "-"), {
      name: r.site,
      roles,
      palette: r.finalPalette || [],
      stats: r.extractionStats
    });
  }
  return map;
}

function analyzeExtraction(dir, siteFile) {
  const path = new URL(siteFile, dir);
  if (!existsSync(path)) return null;
  const raw = loadJson(path);
  if (raw.error) return { error: raw.error };
  const curated = curatePalette(raw);
  const assigned = assignRoles(curated);
  const roles = {};
  for (const s of assigned.swatches || []) roles[s.role] = s.hex;

  const samples = raw.samples || [];
  const totalArea = samples.reduce((s, x) => s + (x.area || 0), 0) || 1;
  const svgArea = samples
    .filter((s) => (s.areaSourceType || "").startsWith("SVG"))
    .reduce((s, x) => s + (x.area || 0), 0);
  const foundationArea = samples
    .filter(contributesFoundationArea)
    .reduce((s, x) => s + (x.area || 0), 0);

  const topByArea = [...samples]
    .sort((a, b) => (b.area || 0) - (a.area || 0))
    .slice(0, 5)
    .map((s) => ({
      hex: s.hex,
      area: s.area,
      areaPct: +(((s.area || 0) / totalArea) * 100).toFixed(1),
      source: s.sourceCategory,
      areaSourceType: s.areaSourceType
    }));

  return {
    roles,
    swatches: assigned.swatches,
    svgAreaPct: +((svgArea / totalArea) * 100).toFixed(1),
    foundationAreaPct: +((foundationArea / totalArea) * 100).toFixed(1),
    topByArea,
    totalFoundationArea: curated.totalFoundationArea,
    samples: samples.length
  };
}

function roleDelta(before, after, role) {
  const b = before?.roles?.[role] || null;
  const a = after?.roles?.[role] || null;
  if (b === a) return null;
  return { before: b, after: a };
}

const beforeReport = existsSync(BEFORE_REPORT) ? loadJson(BEFORE_REPORT) : null;
const afterReport = existsSync(AFTER_REPORT) ? loadJson(AFTER_REPORT) : null;
const beforeMap = beforeReport ? paletteMap(beforeReport) : new Map();
const afterMap = afterReport ? paletteMap(afterReport) : new Map();

const fix1 = [];
const fix2 = [];
const fix3 = [];
const improved = [];
const regressed = [];

for (const slug of SITES) {
  const file = `${slug}.json`;
  const beforeExt = analyzeExtraction(BEFORE_DIR, file);
  const afterExt = analyzeExtraction(AFTER_DIR, file);
  const beforeRep = beforeMap.get(slug);
  const afterRep = afterMap.get(slug);
  const name = beforeRep?.name || afterRep?.name || slug;

  if (beforeRep && afterExt) {
    const oldFoundation = beforeRep.roles.foundation;
    const newFoundationOnOldData = beforeExt?.roles?.foundation;
    const newFoundation = afterExt?.roles?.foundation || afterRep?.roles?.foundation;
    fix1.push({
      site: name,
      beforeFoundation: oldFoundation,
      afterFoundation: newFoundation,
      foundationOnOldExtractionOnly: newFoundationOnOldData,
      oldFoundationAreaShare: beforeRep.palette?.find((p) => p.role === "foundation")?.areaShare
    });
  }

  if (beforeExt && afterExt && !beforeExt.error && !afterExt.error) {
    fix2.push({
      site: name,
      svgAreaPctBefore: beforeExt.svgAreaPct,
      svgAreaPctAfter: afterExt.svgAreaPct,
      svgReduction: +(beforeExt.svgAreaPct - afterExt.svgAreaPct).toFixed(1),
      foundationBefore: beforeExt.roles.foundation,
      foundationAfter: afterExt.roles.foundation
    });
  }

  const browserBlues = ["#0000ee", "#0000ff"];
  const beforePrimary = beforeRep?.roles?.primary;
  const afterPrimary = afterRep?.roles?.primary || afterExt?.roles?.primary;
  const beforeHadLinkBlue = browserBlues.includes((beforePrimary || "").toLowerCase());
  const afterHasLinkBlue = browserBlues.includes((afterPrimary || "").toLowerCase());
  if (beforeHadLinkBlue || afterHasLinkBlue) {
    fix3.push({
      site: name,
      beforePrimary,
      afterPrimary,
      fixed: beforeHadLinkBlue && !afterHasLinkBlue
    });
  }

  if (beforeRep && afterRep) {
    const score = (rep) => {
      let s = 0;
      const f = rep.roles.foundation;
      if (f === "#000000" && ["linear", "vercel", "apple"].includes(slug)) s -= 2;
      if (browserBlues.includes((rep.roles.primary || "").toLowerCase())) s -= 3;
      if (f && f !== "#000000") s += 1;
      if (rep.roles.primary && !browserBlues.includes(rep.roles.primary.toLowerCase())) s += 1;
      return s;
    };
    const bScore = score(beforeRep);
    const aScore = score(afterRep);
    if (aScore > bScore) improved.push(name);
    else if (aScore < bScore) regressed.push(name);
  }
}

const output = {
  generatedAt: new Date().toISOString(),
  fix1_foundationFromBackgrounds: fix1,
  fix2_svgAreaReduction: fix2,
  fix3_browserDefaultLinks: fix3,
  summary: {
    improved,
    regressed,
    unchanged: SITES.map((s) => beforeMap.get(s)?.name).filter(
      (n) => n && !improved.includes(n) && !regressed.includes(n)
    )
  },
  finalPalettes: SITES.map((slug) => {
    const rep = afterMap.get(slug);
    const ext = analyzeExtraction(AFTER_DIR, `${slug}.json`);
    return {
      site: rep?.name || slug,
      palette: rep?.roles || ext?.roles || {},
      extraction: rep?.stats || null
    };
  }),
  remainingFailurePatterns: afterReport?.failurePatterns || []
};

writeFileSync(new URL("./fix-comparison-report.json", import.meta.url), JSON.stringify(output, null, 2));

let md = `# Fix Comparison Report\n\nGenerated: ${output.generatedAt}\n\n`;

md += `## FIX 1: Foundation from background surfaces\n\n`;
md += `| Site | Before | After (new extractions) | On old extraction (FIX 1 only) |\n`;
md += `|------|--------|-------------------------|--------------------------------|\n`;
for (const row of fix1) {
  md += `| ${row.site} | ${row.beforeFoundation || "—"} | ${row.afterFoundation || "—"} | ${row.foundationOnOldExtractionOnly || "—"} |\n`;
}

md += `\n## FIX 2: SVG area influence\n\n`;
md += `| Site | SVG % before | SVG % after | Reduction | Foundation before → after |\n`;
md += `|------|--------------|-------------|-----------|-------------------------|\n`;
for (const row of fix2) {
  md += `| ${row.site} | ${row.svgAreaPctBefore}% | ${row.svgAreaPctAfter}% | ${row.svgReduction}pp | ${row.foundationBefore || "—"} → ${row.foundationAfter || "—"} |\n`;
}

md += `\n## FIX 3: Browser default link colors\n\n`;
if (fix3.length === 0) md += `No sites had browser default link blue in primary.\n`;
else {
  md += `| Site | Before primary | After primary | Fixed? |\n`;
  md += `|------|----------------|---------------|--------|\n`;
  for (const row of fix3) {
    md += `| ${row.site} | ${row.beforePrimary} | ${row.afterPrimary} | ${row.fixed ? "yes" : "no"} |\n`;
  }
}

md += `\n## Summary\n\n`;
md += `- **Improved:** ${improved.length ? improved.join(", ") : "none"}\n`;
md += `- **Regressed:** ${regressed.length ? regressed.join(", ") : "none"}\n`;
md += `- **Unchanged:** ${output.summary.unchanged.join(", ") || "none"}\n\n`;

md += `## Final palettes\n\n`;
for (const fp of output.finalPalettes) {
  md += `### ${fp.site}\n`;
  for (const [role, hex] of Object.entries(fp.palette)) md += `- **${role}**: ${hex}\n`;
  md += `\n`;
}

md += `## Remaining failure patterns\n\n`;
for (const p of output.remainingFailurePatterns) {
  md += `- **${p.pattern}**: ${JSON.stringify(p.sites)} — ${p.note}\n`;
}

writeFileSync(new URL("./fix-comparison-report.md", import.meta.url), md);
console.log("Wrote scripts/fix-comparison-report.json and .md");
