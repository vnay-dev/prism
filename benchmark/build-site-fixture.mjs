/**
 * Build a compact benchmark extraction fixture from scraped color/font signals.
 * Usage: node benchmark/build-site-fixture.mjs <slug> <signals.json> <out.json>
 */
import { readFileSync, writeFileSync } from "fs";
import { rgbToHsl } from "../src/core/colorLab.js";

function parseCssRgb(css) {
  const m = String(css)
    .trim()
    .match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?/i);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : Number(m[4]);
  if (a < 0.9) return null;
  return { r: Math.round(+m[1]), g: Math.round(+m[2]), b: Math.round(+m[3]) };
}

function toHex({ r, g, b }) {
  return (
    "#" +
    [r, g, b]
      .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0"))
      .join("")
  );
}

function parseStackPrimary(stack) {
  if (!stack) return "";
  const part = String(stack).split(",")[0]?.trim().replace(/^['"]|['"]$/g, "");
  return part || "";
}

function buildSamples(topColors) {
  const samples = [];
  let i = 0;
  for (const entry of topColors || []) {
    const rgb = parseCssRgb(entry.css);
    if (!rgb) continue;
    const hex = toHex(rgb);
    const hsl = rgbToHsl(rgb);
    const area = Math.max(100, Math.round(entry.area || 1000));
    const isBg = entry.prop === "backgroundColor";
    samples.push({
      hex,
      rgb,
      hsl,
      area,
      areaSourceType: isBg ? "Background" : "Text",
      importance: Math.max(3, Math.round(Math.log10(area + 1) * 4)),
      rawImportance: 5,
      brandWeight: isBg ? 4 : 2,
      sourceCategory: isBg ? "surface" : "text",
      contentZone: "page_content",
      sectionId: `section-${i % 3}`,
      context: isBg ? "other" : "text",
      contrast: 1
    });
    i += 1;
  }
  return samples;
}

function buildFontSamples(topFonts) {
  const fontSamples = [];
  let i = 0;
  for (const entry of topFonts || []) {
    const family = parseStackPrimary(entry.stack);
    if (!family) continue;
    const area = Math.max(100, Math.round(entry.area || 1000));
    const weight = Number.parseInt(entry.weight, 10) || 400;
    fontSamples.push({
      family,
      stack: entry.stack,
      fontSize: 16,
      weight,
      style: "normal",
      textLength: Math.max(8, entry.count * 12),
      headingLevel: /serif/i.test(entry.stack) && i === 0 ? 1 : null,
      viewportVisible: true,
      visibilityRatio: 1,
      area,
      importance: Math.max(5, Math.round(area / 500)),
      rawImportance: 10,
      brandWeight: 5,
      sourceCategory: i === 0 ? "hero_cta" : "default",
      contentZone: "page_content",
      sectionId: `section-${i % 3}`,
      context: i === 0 ? "heading" : "text"
    });
    i += 1;
  }
  return fontSamples;
}

const [slug, signalsPath, outPath] = process.argv.slice(2);
if (!slug || !signalsPath || !outPath) {
  console.error("Usage: node benchmark/build-site-fixture.mjs <slug> <signals.json> <out.json>");
  process.exit(1);
}

const signals = JSON.parse(readFileSync(signalsPath, "utf8"));
const samples = buildSamples(signals.topColors || []);
const fontSamples = buildFontSamples(signals.topFonts || []);
const fixture = {
  sampledElements: samples.length,
  sectionCount: 3,
  sections: [
    { sectionId: "section-0", startY: 0, endY: 900 },
    { sectionId: "section-1", startY: 900, endY: 1800 },
    { sectionId: "section-2", startY: 1800, endY: 2700 }
  ],
  samples,
  fontSamples,
  fontTokens: [],
  fontFaces: signals.fontFaces || [],
  gradients: [],
  areaContributions: samples.map((s) => ({
    hex: s.hex,
    sourceType: s.areaSourceType,
    area: s.area,
    count: 1
  })),
  meta: {
    slug,
    url: signals.url || "",
    title: signals.title || "",
    capturedAt: new Date().toISOString(),
    compact: true
  }
};

writeFileSync(outPath, JSON.stringify(fixture));
console.log(
  `Wrote ${outPath} samples=${samples.length} fontSamples=${fontSamples.length} fonts=${fontSamples
    .map((f) => f.family)
    .join(", ")}`
);
