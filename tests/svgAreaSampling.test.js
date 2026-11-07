import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { curatePalette } from "../src/core/scoreAndCluster.js";
import { assignRoles } from "../src/core/assignRoles.js";
import { contributesFoundationArea } from "../src/core/paletteSafeguards.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("SVG fill/stroke area cap formula is per-sample on the root SVG bbox", () => {
  const src = readFileSync(join(root, "src/content/extractInPage.js"), "utf8");
  assert.match(src, /function measureSvgArea\(el\)/);
  assert.match(src, /Math\.max\(2500,\s*vw\s*\*\s*vh\s*\*\s*0\.015\)/);
  assert.match(src, /Math\.min\(rawArea,\s*svgCap\)/);
  // Cap applies via closest svg root — descendants share that bbox.
  assert.match(src, /el\.closest\("svg"\)/);
});

test("multiple capped SVG Fill samples can accumulate area but do not become foundation", () => {
  const capped = 2500;
  // Simulate several painted descendants each contributing the same capped root area.
  const svgSamples = Array.from({ length: 12 }, (_, i) => ({
    hex: "#5b6cff",
    rgb: { r: 91, g: 108, b: 255 },
    hsl: { h: 232, s: 100, l: 68 },
    area: capped,
    importance: 10,
    sourceCategory: "illustration",
    areaSourceType: "SVG Fill",
    sectionId: `section-${i % 3}`,
    context: "icon",
    contrast: 0.4
  }));

  for (const sample of svgSamples) {
    assert.equal(contributesFoundationArea(sample), false);
  }

  // Mirror the existing foundation-vs-SVG fixture shape (multi-section canvas).
  const extraction = {
    sectionCount: 6,
    samples: [
      ...svgSamples,
      {
        hex: "#08090a",
        rgb: { r: 8, g: 9, b: 10 },
        hsl: { h: 210, s: 10, l: 4 },
        area: 900000,
        importance: 200,
        sourceCategory: "global_background",
        areaSourceType: "Background",
        sectionId: "section-0",
        context: "surface"
      },
      {
        hex: "#08090a",
        rgb: { r: 8, g: 9, b: 10 },
        hsl: { h: 210, s: 10, l: 4 },
        area: 800000,
        importance: 180,
        sourceCategory: "repeated_section_bg",
        areaSourceType: "Background",
        sectionId: "section-1",
        context: "surface"
      },
      {
        hex: "#08090a",
        rgb: { r: 8, g: 9, b: 10 },
        hsl: { h: 210, s: 10, l: 4 },
        area: 700000,
        importance: 160,
        sourceCategory: "repeated_section_bg",
        areaSourceType: "Background",
        sectionId: "section-2",
        context: "surface"
      },
      {
        hex: "#5e6ad2",
        rgb: { r: 94, g: 106, b: 210 },
        hsl: { h: 234, s: 56, l: 60 },
        area: 5000,
        importance: 900,
        sourceCategory: "hero_cta",
        areaSourceType: "Background",
        sectionId: "section-0",
        context: "button"
      }
    ]
  };

  const assigned = assignRoles(curatePalette(extraction));
  const foundation = assigned.swatches.find((s) => s.role === "foundation");
  assert.equal(foundation?.hex, "#08090a");
  assert.ok(
    svgSamples.reduce((sum, s) => sum + s.area, 0) > 20000,
    "fixture must accumulate multi-child capped SVG area"
  );
});

test("frozen benchmark fixtures already include SVG-heavy pages for measurement", () => {
  const linear = JSON.parse(
    readFileSync(join(root, "benchmark/extractions/linear.json"), "utf8")
  );
  const svgPaint = (linear.samples || []).filter(
    (s) => s.areaSourceType === "SVG Fill" || s.areaSourceType === "SVG Stroke"
  );
  assert.ok(
    svgPaint.length > 1000,
    `expected Linear fixture to remain SVG-heavy for impact measurement (got ${svgPaint.length})`
  );
});
