import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { curatePalette } from "../src/core/scoreAndCluster.js";
import { assignRoles } from "../src/core/assignRoles.js";
import { addSampleUsage, emptyUsage, labelsFromUsage, usageRoleLabels } from "../src/core/usageRoles.js";
import {
  DARK_INK,
  LIGHT_INK,
  TILE_SIZE,
  buildRoleSections,
  onSwatchInk
} from "../src/popup/paletteLayout.js";

function sample(partial) {
  return {
    hex: "#111111",
    rgb: { r: 17, g: 17, b: 17 },
    hsl: { h: 0, s: 0, l: 7 },
    area: 100,
    importance: 10,
    sectionId: "section-0",
    contrast: 0.5,
    ...partial
  };
}

function usageFrom(samples) {
  return samples.reduce((usage, entry) => addSampleUsage(usage, entry), emptyUsage());
}

async function loadFixtures() {
  const raw = await readFile(new URL("./fixtures/palette-fixtures.json", import.meta.url), "utf8");
  return JSON.parse(raw);
}

test("page surfaces are labeled Background and incidental fills are not", () => {
  const page = labelsFromUsage(
    usageFrom([
      sample({
        area: 800,
        context: "surface",
        sourceCategory: "global_background",
        areaSourceType: "Background"
      }),
      sample({
        area: 40,
        context: "surface",
        sourceCategory: "default",
        areaSourceType: "Background",
        hex: "#ff4fa3"
      })
    ])
  );
  assert.deepEqual(page, ["background"]);

  const decorative = labelsFromUsage(
    usageFrom([
      sample({
        hex: "#ff4fa3",
        rgb: { r: 255, g: 79, b: 163 },
        hsl: { h: 331, s: 100, l: 65 },
        area: 80,
        context: "surface",
        sourceCategory: "illustration",
        areaSourceType: "Background"
      })
    ])
  );
  assert.deepEqual(decorative, ["background"]);
});

test("text and accent labels follow measured use and can combine", () => {
  const labels = labelsFromUsage(
    usageFrom([
      sample({ area: 240, context: "text", sourceCategory: "default", areaSourceType: "Text" }),
      sample({
        area: 180,
        context: "text",
        sourceCategory: "default",
        areaSourceType: "Text",
        sectionId: "section-1"
      }),
      sample({
        area: 160,
        context: "button",
        sourceCategory: "hero_cta",
        areaSourceType: "Background",
        sectionId: "section-0"
      })
    ])
  );
  assert.deepEqual(labels, ["text", "accent"]);
  assert.deepEqual(usageRoleLabels(labels), ["Text", "Accent"]);
});

test("a border or status color still gets the role it was painted as", () => {
  const border = labelsFromUsage(
    usageFrom([
      sample({
        hex: "#5e6ad2",
        rgb: { r: 94, g: 106, b: 210 },
        hsl: { h: 234, s: 56, l: 60 },
        area: 12,
        context: "border",
        sourceCategory: "default",
        areaSourceType: "Border"
      })
    ])
  );
  assert.deepEqual(border, ["accent"]);

  const status = labelsFromUsage(
    usageFrom([
      sample({
        hex: "#22c55e",
        rgb: { r: 34, g: 197, b: 94 },
        hsl: { h: 142, s: 71, l: 45 },
        area: 180,
        context: "surface",
        sourceCategory: "success_state",
        areaSourceType: "Background"
      })
    ])
  );
  assert.deepEqual(status, ["accent"]);
});

test("a small surface still gets a label, and body text is not marked Accent", () => {
  const patch = usageFrom([
    sample({
      area: 256,
      context: "surface",
      sourceCategory: "hero_background",
      areaSourceType: "Background"
    })
  ]);
  patch.background.pageShare = 0.004;
  assert.deepEqual(labelsFromUsage(patch), ["background"]);

  const bodyAndButtons = usageFrom([
    sample({ area: 400, context: "text", sourceCategory: "default", areaSourceType: "Text" }),
    sample({ area: 220, context: "heading", sourceCategory: "default", areaSourceType: "Text" }),
    sample({
      area: 70,
      context: "button",
      sourceCategory: "primary_button",
      areaSourceType: "Text"
    })
  ]);
  assert.deepEqual(labelsFromUsage(bodyAndButtons), ["text"]);
});

test("link text is Accent when it is a real share of the color", () => {
  const labels = labelsFromUsage(
    usageFrom([
      sample({ area: 90, context: "link", sourceCategory: "navigation", areaSourceType: "Text" }),
      sample({
        area: 70,
        context: "link",
        sourceCategory: "navigation",
        areaSourceType: "Text",
        sectionId: "section-2"
      })
    ])
  );
  assert.deepEqual(labels, ["text", "accent"]);
});

test("curated swatches keep selection and gain usage labels from samples", async () => {
  const fixtures = await loadFixtures();
  const curated = curatePalette(fixtures[2]);
  const assigned = assignRoles(curated);
  const byHex = Object.fromEntries(assigned.swatches.map((swatch) => [swatch.hex, swatch.usageRoles]));

  assert.ok(assigned.swatches.some((swatch) => swatch.role === "primary"));
  assert.deepEqual(byHex["#0a0a0a"], ["background"]);
  assert.ok(byHex["#3b82f6"]?.includes("accent"));
  assert.ok(!byHex["#3b82f6"]?.includes("background"));
  assert.deepEqual(byHex["#a1a1aa"], ["text"]);
  assert.deepEqual(byHex["#fafafa"], ["text"]);
  assert.ok(assigned.swatches.every((swatch) => swatch.usageRoles.length > 0));
});

test("legacy candidate palettes are not given invented usage labels", async () => {
  const fixtures = await loadFixtures();
  const assigned = assignRoles(curatePalette(fixtures[0]));
  assert.equal(assigned.swatches.length, 8);
  assert.ok(assigned.swatches.every((swatch) => swatch.usageRoles.length === 0));
});

test("role titles group equal square tiles", () => {
  const swatches = [
    { hex: "#111111", usageRoles: ["text"] },
    { hex: "#222222", usageRoles: ["text"] },
    { hex: "#ffffff", usageRoles: ["background"] },
    { hex: "#3366ff", usageRoles: ["background", "accent"] },
    { hex: "#ff8800", usageRoles: ["accent"] }
  ];
  const sections = buildRoleSections(swatches);
  assert.deepEqual(
    sections.map((section) => section.label),
    ["Background", "Text", "Accent"]
  );
  assert.deepEqual(
    sections[0].rows[0].tiles.map((tile) => tile.hex),
    ["#ffffff", "#3366ff"]
  );
  assert.deepEqual(
    sections[2].rows[0].tiles.map((tile) => tile.hex),
    ["#3366ff", "#ff8800"]
  );
  for (const section of sections) {
    for (const row of section.rows) {
      assert.equal(row.height, TILE_SIZE);
      assert.equal(row.tileSize, TILE_SIZE);
      assert.equal(row.height, row.tileSize);
    }
  }
});

test("label ink follows how light or dark the tile is", () => {
  assert.equal(onSwatchInk("#08090a"), LIGHT_INK);
  assert.equal(onSwatchInk("#1d1d1f"), LIGHT_INK);
  assert.equal(onSwatchInk("#5e6ad2"), LIGHT_INK);
  assert.equal(onSwatchInk("#f7f8f8"), DARK_INK);
  assert.equal(onSwatchInk("#e5edf5"), DARK_INK);
  assert.equal(LIGHT_INK, "#ffffff");
});
