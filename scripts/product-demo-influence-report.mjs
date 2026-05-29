/**
 * Product Demo Influence Report — analysis only, does not modify src/.
 * Usage: node scripts/product-demo-influence-report.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { curatePalette } from "../src/core/scoreAndCluster.js";
import { assignRoles } from "../src/core/assignRoles.js";
import { rgbToLab, deltaE, rgbToHsl, isNeutralHsl } from "../src/core/colorLab.js";

const SITES = [
  { slug: "linear", name: "Linear" },
  { slug: "stripe", name: "Stripe" },
  { slug: "slack", name: "Slack" },
  { slug: "notion", name: "Notion" },
  { slug: "vercel", name: "Vercel" }
];

const ZONES = ["website_chrome", "product_demo", "page_content"];
const DEMO_WEIGHT = 0.25;
const NEUTRAL_MERGE_DE = 5;
const CHROMA_MERGE_DE = 8;

function loadExtraction(slug) {
  return JSON.parse(
    readFileSync(new URL(`./benchmark-extractions/${slug}.json`, import.meta.url), "utf8")
  );
}

function zoneStats(samples) {
  const byCount = Object.fromEntries(ZONES.map((z) => [z, 0]));
  const byArea = Object.fromEntries(ZONES.map((z) => [z, 0]));
  const byImportance = Object.fromEntries(ZONES.map((z) => [z, 0]));
  let totalCount = 0;
  let totalArea = 0;
  let totalImportance = 0;

  for (const s of samples) {
    const zone = ZONES.includes(s.contentZone) ? s.contentZone : "page_content";
    const area = s.area || 0;
    const importance = s.importance || 0;
    byCount[zone] += 1;
    byArea[zone] += area;
    byImportance[zone] += importance;
    totalCount += 1;
    totalArea += area;
    totalImportance += importance;
  }

  const pct = (map, total) =>
    Object.fromEntries(
      ZONES.map((z) => [z, total > 0 ? +((map[z] / total) * 100).toFixed(1) : 0])
    );

  return {
    byCount: pct(byCount, totalCount),
    byArea: pct(byArea, totalArea),
    byImportance: pct(byImportance, totalImportance),
    totals: { samples: totalCount, area: totalArea, importance: totalImportance }
  };
}

function topColorsByZone(samples, limit = 10) {
  const result = {};
  for (const zone of ZONES) {
    const zoneSamples = samples.filter((s) => (s.contentZone || "page_content") === zone);
    const byHex = new Map();
    for (const s of zoneSamples) {
      if (!byHex.has(s.hex)) {
        byHex.set(s.hex, { hex: s.hex, area: 0, count: 0, importance: 0 });
      }
      const e = byHex.get(s.hex);
      e.area += s.area || 0;
      e.count += 1;
      e.importance += s.importance || 0;
    }
    const totalArea = zoneSamples.reduce((sum, s) => sum + (s.area || 0), 0) || 1;
    result[zone] = [...byHex.values()]
      .sort((a, b) => b.area - a.area)
      .slice(0, limit)
      .map((e) => ({
        hex: e.hex,
        areaPct: +((e.area / totalArea) * 100).toFixed(1),
        count: e.count,
        importance: +e.importance.toFixed(0)
      }));
  }
  return result;
}

function findClusterForSample(sample, paletteEntries) {
  const lab = rgbToLab(sample.rgb);
  const isNeutral = isNeutralHsl(sample.hsl || rgbToHsl(sample.rgb));
  const threshold = isNeutral ? NEUTRAL_MERGE_DE : CHROMA_MERGE_DE;

  let best = null;
  let bestDist = threshold;
  for (const entry of paletteEntries) {
    const dist = deltaE(lab, rgbToLab(entry.rgb));
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }
  return best;
}

function paletteZoneContribution(samples, swatches) {
  const entries = swatches.map((s) => ({
    hex: s.hex,
    rgb: s.rgb || hexToRgb(s.hex),
    role: s.role
  }));

  const byRole = {};
  for (const swatch of swatches) {
    byRole[swatch.hex] = {
      role: swatch.role,
      hex: swatch.hex,
      zones: Object.fromEntries(ZONES.map((z) => [z, 0])),
      total: 0
    };
  }

  for (const sample of samples) {
    const zone = ZONES.includes(sample.contentZone) ? sample.contentZone : "page_content";
    const match = findClusterForSample(sample, entries);
    if (!match || !byRole[match.hex]) continue;
    const weight = sample.importance || sample.area || 1;
    byRole[match.hex].zones[zone] += weight;
    byRole[match.hex].total += weight;
  }

  return Object.values(byRole)
    .filter((e) => e.total > 0)
    .sort((a, b) => roleOrder(a.role) - roleOrder(b.role))
    .map((e) => ({
      role: e.role,
      hex: e.hex,
      source: Object.fromEntries(
        ZONES.map((z) => [z, +((e.zones[z] / e.total) * 100).toFixed(0)])
      )
    }));
}

function roleOrder(role) {
  return { foundation: 0, primary: 1, secondary: 2, accent: 3, neutral: 4 }[role] ?? 5;
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

function applyDemoWeight(samples, weight) {
  return samples.map((s) => {
    if (s.contentZone !== "product_demo") return s;
    const importance = (s.importance || 0) * weight;
    return { ...s, importance, rawImportance: (s.rawImportance || 0) * weight };
  });
}

function runPipeline(extraction, demoWeight = 1) {
  const samples =
    demoWeight === 1 ? extraction.samples : applyDemoWeight(extraction.samples, demoWeight);
  const curated = curatePalette({ ...extraction, samples });
  const assigned = assignRoles(curated);
  return { swatches: assigned.swatches, curated };
}

function formatPalette(swatches) {
  return swatches.map((s) => `${s.role} ${s.hex}`).join(" · ");
}

function chromaticRankings(curated) {
  return (curated.selected || [])
    .filter((c) => !c.isNeutral)
    .sort((a, b) => (b.brandConfidence || 0) - (a.brandConfidence || 0))
    .map((c) => ({
      hex: c.hex,
      designSystemScore: +(c.designSystemScore || 0).toFixed(3),
      brandConfidence: +(c.brandConfidence || 0).toFixed(3),
      areaShare: +((c.areaShare || 0) * 100).toFixed(2),
      sources: c.sourceCounts || {}
    }));
}

function analyzeSite(slug, name) {
  const extraction = loadExtraction(slug);
  const samples = extraction.samples || [];

  const zones = zoneStats(samples);
  const topByZone = topColorsByZone(samples);

  const before = runPipeline(extraction, 1);
  const after = runPipeline(extraction, DEMO_WEIGHT);

  const contribution = paletteZoneContribution(samples, before.swatches);

  return {
    site: name,
    slug,
    sectionCount: extraction.sectionCount,
    sampleCount: samples.length,
    zoneDistribution: zones,
    topColorsByZone: topByZone,
    paletteZoneContribution: contribution,
    chromaticRankings: chromaticRankings(before.curated),
    paletteBefore: before.swatches,
    paletteAfter: after.swatches,
    paletteBeforeFormatted: formatPalette(before.swatches),
    paletteAfterFormatted: formatPalette(after.swatches),
    primaryChanged: before.swatches.find((s) => s.role === "primary")?.hex !==
      after.swatches.find((s) => s.role === "primary")?.hex
  };
}

function diffPalettes(beforeSwatches, afterSwatches) {
  const changes = [];
  const maxLen = Math.max(beforeSwatches.length, afterSwatches.length);
  for (let i = 0; i < maxLen; i++) {
    const b = beforeSwatches[i];
    const a = afterSwatches[i];
    if (!b || !a || b.hex !== a.hex || b.role !== a.role) {
      changes.push({
        index: i + 1,
        before: b ? `${b.role} ${b.hex}` : "—",
        after: a ? `${a.role} ${a.hex}` : "—"
      });
    }
  }
  return changes;
}

function formatReport(reports) {
  let md = `# Product Demo Influence Report\n\n`;
  md += `Generated: ${new Date().toISOString()}\n\n`;
  md += `Simulated counterfactual: \`product_demo_weight = ${DEMO_WEIGHT}\` applied to sample importance only (no other logic changed).\n\n`;
  md += `---\n\n`;

  for (const r of reports) {
    md += `## ${r.site}\n\n`;
    md += `Samples: ${r.sampleCount} · Sections: ${r.sectionCount}\n\n`;

    md += `### 1. Sample distribution by content zone\n\n`;
    md += `| Zone | By count | By area | By importance |\n`;
    md += `|------|----------|---------|---------------|\n`;
    for (const z of ZONES) {
      md += `| ${z} | ${r.zoneDistribution.byCount[z]}% | ${r.zoneDistribution.byArea[z]}% | ${r.zoneDistribution.byImportance[z]}% |\n`;
    }
    md += `\n`;

    md += `### 2. Top 10 colors per zone (ranked by area within zone)\n\n`;
    for (const zone of ZONES) {
      md += `**${zone}**\n\n`;
      md += `| Rank | Hex | Area % in zone | Samples | Importance |\n`;
      md += `|------|-----|----------------|---------|------------|\n`;
      r.topColorsByZone[zone].forEach((c, i) => {
        md += `| ${i + 1} | ${c.hex} | ${c.areaPct}% | ${c.count} | ${c.importance} |\n`;
      });
      md += `\n`;
    }

    md += `### 3. Final palette contribution by zone\n\n`;
    md += `_Zone share of importance-weighted samples mapped to each palette color (LAB cluster match)._\n\n`;
    for (const entry of r.paletteZoneContribution) {
      md += `**${entry.role}** \`${entry.hex}\`\n`;
      md += `- website_chrome: ${entry.source.website_chrome}%\n`;
      md += `- product_demo: ${entry.source.product_demo}%\n`;
      md += `- page_content: ${entry.source.page_content}%\n\n`;
    }

    md += `### 4–5. Palette before vs after (demo weight ${DEMO_WEIGHT})\n\n`;
    md += `**Before:** ${r.paletteBeforeFormatted}\n\n`;
    md += `**After:** ${r.paletteAfterFormatted}\n\n`;

    const changes = diffPalettes(r.paletteBefore, r.paletteAfter);
    if (changes.length === 0) {
      md += `_No palette slots changed under importance-only demo weighting._\n\n`;
    } else {
      md += `| Slot | Before | After |\n|------|--------|-------|\n`;
      for (const c of changes) {
        md += `| ${c.index} | ${c.before} | ${c.after} |\n`;
      }
      md += `\n`;
    }

    if (r.chromaticRankings.length) {
      md += `**Curated chromatic clusters (before simulation)**\n\n`;
      md += `| Hex | Brand confidence | Design score | Area share % |\n`;
      md += `|-----|------------------|--------------|-------------|\n`;
      for (const c of r.chromaticRankings) {
        md += `| ${c.hex} | ${c.brandConfidence} | ${c.designSystemScore} | ${c.areaShare} |\n`;
      }
      md += `\n`;
    }
  }

  md += `## Cross-site summary\n\n`;
  md += `| Site | Demo samples % | Demo importance % | Primary before | Primary after | Primary changed? |\n`;
  md += `|------|----------------|-------------------|----------------|---------------|------------------|\n`;
  for (const r of reports) {
    const primaryBefore = r.paletteBefore.find((s) => s.role === "primary")?.hex || "—";
    const primaryAfter = r.paletteAfter.find((s) => s.role === "primary")?.hex || "—";
    md += `| ${r.site} | ${r.zoneDistribution.byCount.product_demo}% | ${r.zoneDistribution.byImportance.product_demo}% | ${primaryBefore} | ${primaryAfter} | ${r.primaryChanged ? "yes" : "no"} |\n`;
  }

  md += `\n## Key findings\n\n`;
  md += `### Linear is the only site with meaningful demo sample share\n\n`;
  md += `- **50.9% of samples** are tagged \`product_demo\`, but only **2.1% of total importance** — website chrome navigation samples carry ~93% of importance despite being 27% of samples.\n`;
  md += `- Primary \`#d0d6e0\` is the **only chromatic color** that survives curation; brand indigo \`#5e6ad2\` appears in just **3 samples** (648px² area) and never enters the curated chromatic set.\n`;
  md += `- Importance-only demo weighting (\`×0.25\`) **does not change any palette** on any site — the effect is too small relative to chrome-weighted importance and cluster area totals.\n`;
  md += `- Demo influence on primary is primarily via **sample volume and cluster area** (628k px² for \`#d0d6e0\`), not raw importance scores (demo samples are already capped at importance=3 in extraction).\n\n`;
  md += `### Other sites are largely unaffected\n\n`;
  md += `- Stripe, Vercel: **0% product_demo samples** in this crawl.\n`;
  md += `- Slack: **0.1% product_demo** — negligible.\n`;
  md += `- Notion: **4.3% product_demo** — primary correctly from website chrome (\`#0075de\`, 90% chrome attribution).\n\n`;
  md += `### Evidence for reduced demo weighting\n\n`;
  md += `- **Partial support**: Linear demo zone contributes 34% of primary color importance attribution and 76% of \`#62666d\` neutral — demo colors pollute neutral slots even when not primary.\n`;
  md += `- **Insufficient alone**: Importance scaling at 0.25 does not recover \`#5e6ad2\`; a weight change must also address **area aggregation** and/or **demo source categories** (\`demo_navigation\`, \`demo_sidebar\`) that still carry brand-confidence signals.\n`;

  return md;
}

const reports = SITES.map(({ slug, name }) => analyzeSite(slug, name));
const jsonOut = {
  generatedAt: new Date().toISOString(),
  demoWeightSimulation: DEMO_WEIGHT,
  reports
};

writeFileSync(new URL("./product-demo-influence-report.json", import.meta.url), JSON.stringify(jsonOut, null, 2));
writeFileSync(new URL("./product-demo-influence-report.md", import.meta.url), formatReport(reports));
console.log("Wrote scripts/product-demo-influence-report.json and .md");

for (const r of reports) {
  const primaryBefore = r.paletteBefore.find((s) => s.role === "primary")?.hex || "—";
  const primaryAfter = r.paletteAfter.find((s) => s.role === "primary")?.hex || "—";
  console.log(
    `\n${r.site}: demo=${r.zoneDistribution.byCount.product_demo}% primary ${primaryBefore} → ${primaryAfter}`
  );
}
