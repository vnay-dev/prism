import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { curatePalette } from "../src/core/scoreAndCluster.js";
import { assignRoles } from "../src/core/assignRoles.js";
import {
  addSampleUsage,
  emptyUsage,
  labelsFromUsage,
  normalizeUsageHex,
  primaryUsageRole,
  usageRoleLabels
} from "../src/core/usageRoles.js";
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
  const pageUsage = usageFrom([
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
  ]);
  pageUsage.background.pageShare = 0.9;
  assert.deepEqual(labelsFromUsage(pageUsage), ["background"]);

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
  // Decorative / non-page fills are accents, not foundational backgrounds.
  assert.deepEqual(decorative, ["accent"]);
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

test("a tiny CTA fill keeps Accent even when merged with large body-text area", () => {
  const mixed = usageFrom([
    sample({
      hex: "#0a0a0a",
      area: 80000,
      context: "text",
      sourceCategory: "default",
      areaSourceType: "Text"
    }),
    sample({
      hex: "#0a0a0a",
      area: 2500,
      context: "button",
      sourceCategory: "primary_button",
      areaSourceType: "Background"
    })
  ]);
  assert.deepEqual(labelsFromUsage(mixed), ["text", "accent"]);
});

test("a tiny page-surface patch is Accent, not Background; body text is not Accent", () => {
  const patch = usageFrom([
    sample({
      area: 256,
      context: "surface",
      sourceCategory: "hero_background",
      areaSourceType: "Background"
    })
  ]);
  patch.background.pageShare = 0.004;
  assert.deepEqual(labelsFromUsage(patch), ["accent"]);

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

test("repeated badge backgrounds stay out of Background", () => {
  const badges = [];
  for (let i = 0; i < 24; i++) {
    badges.push(
      sample({
        hex: "#fef3c6",
        rgb: { r: 254, g: 243, b: 198 },
        hsl: { h: 48, s: 97, l: 89 },
        area: 900,
        context: "surface",
        sourceCategory: "major_container",
        areaSourceType: "Background",
        sectionId: `section-${i % 5}`
      })
    );
  }
  const usage = usageFrom(badges);
  usage.background.pageShare = 0.018;
  assert.deepEqual(labelsFromUsage(usage), ["accent"]);

  const statusBadges = usageFrom([
    sample({
      hex: "#fef3c6",
      area: 800,
      context: "surface",
      sourceCategory: "status_chip",
      areaSourceType: "Background"
    }),
    sample({
      hex: "#fef3c6",
      area: 800,
      context: "surface",
      sourceCategory: "status_chip",
      areaSourceType: "Background",
      sectionId: "section-1"
    })
  ]);
  assert.deepEqual(labelsFromUsage(statusBadges), ["accent"]);
});

test("legitimate cards and large panels remain Background", () => {
  const cards = usageFrom([
    sample({
      hex: "#ffffff",
      rgb: { r: 255, g: 255, b: 255 },
      hsl: { h: 0, s: 0, l: 100 },
      area: 180000,
      context: "surface",
      sourceCategory: "card",
      areaSourceType: "Background"
    }),
    sample({
      hex: "#ffffff",
      rgb: { r: 255, g: 255, b: 255 },
      hsl: { h: 0, s: 0, l: 100 },
      area: 160000,
      context: "surface",
      sourceCategory: "card",
      areaSourceType: "Background",
      sectionId: "section-1"
    })
  ]);
  cards.background.pageShare = 0.22;
  assert.deepEqual(labelsFromUsage(cards), ["background"]);

  const panel = usageFrom([
    sample({
      hex: "#111827",
      rgb: { r: 17, g: 24, b: 39 },
      hsl: { h: 222, s: 39, l: 11 },
      area: 420000,
      context: "surface",
      sourceCategory: "major_container",
      areaSourceType: "Background"
    })
  ]);
  panel.background.pageShare = 0.35;
  assert.deepEqual(labelsFromUsage(panel), ["background"]);
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

test("role titles group equal square tiles without duplicating multi-role colors", () => {
  const swatches = [
    { hex: "#111111", usageRoles: ["text"], primaryUsageRole: "text" },
    { hex: "#222222", usageRoles: ["text"], primaryUsageRole: "text" },
    { hex: "#ffffff", usageRoles: ["background"], primaryUsageRole: "background" },
    {
      hex: "#3366ff",
      usageRoles: ["background", "accent"],
      primaryUsageRole: "background"
    },
    { hex: "#ff8800", usageRoles: ["accent"], primaryUsageRole: "accent" }
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
    sections[1].rows[0].tiles.map((tile) => tile.hex),
    ["#111111", "#222222"]
  );
  assert.deepEqual(
    sections[2].rows[0].tiles.map((tile) => tile.hex),
    ["#ff8800"]
  );
  // Multi-role color keeps secondary usage metadata on the single tile.
  assert.deepEqual(
    sections[0].rows[0].tiles.find((tile) => tile.hex === "#3366ff").usageRoles,
    ["background", "accent"]
  );
  const allHexes = sections.flatMap((section) =>
    section.rows.flatMap((row) => row.tiles.map((tile) => tile.hex.toLowerCase()))
  );
  assert.equal(allHexes.length, new Set(allHexes).size);
  for (const section of sections) {
    for (const row of section.rows) {
      assert.equal(row.height, TILE_SIZE);
      assert.equal(row.tileSize, TILE_SIZE);
      assert.equal(row.height, row.tileSize);
    }
  }
});

test("normalizeUsageHex treats equivalent color representations as one key", () => {
  assert.equal(normalizeUsageHex("#FFF"), "#ffffff");
  assert.equal(normalizeUsageHex("#ffffff"), "#ffffff");
  assert.equal(normalizeUsageHex("rgb(255, 255, 255)"), "#ffffff");
  assert.equal(normalizeUsageHex({ r: 255, g: 255, b: 255 }), "#ffffff");
  assert.equal(normalizeUsageHex("#3366FF"), normalizeUsageHex("rgb(51, 102, 255)"));
});

test("primaryUsageRole prefers measured area then foundational order", () => {
  assert.equal(primaryUsageRole(["text", "accent"]), "text");
  assert.equal(primaryUsageRole(["background", "text", "accent"]), "background");
  assert.equal(
    primaryUsageRole(["text", "accent"], {
      text: { area: 20 },
      accent: { area: 80 },
      loose: { text: 0, accent: 0, background: 0 }
    }),
    "accent"
  );
});

test("text+accent colors render once and keep usage metadata", () => {
  const swatches = [
    {
      hex: "#0a0a0a",
      usageRoles: ["text", "accent"],
      primaryUsageRole: "text"
    },
    {
      hex: "rgb(10, 10, 10)",
      usageRoles: ["text", "accent"],
      primaryUsageRole: "accent"
    },
    { hex: "#f5f5f5", usageRoles: ["background"], primaryUsageRole: "background" }
  ];
  const sections = buildRoleSections(swatches);
  const allTiles = sections.flatMap((section) => section.rows.flatMap((row) => row.tiles));
  assert.equal(allTiles.filter((tile) => normalizeUsageHex(tile.hex) === "#0a0a0a").length, 1);
  const dark = allTiles.find((tile) => normalizeUsageHex(tile.hex) === "#0a0a0a");
  assert.deepEqual(dark.usageRoles, ["text", "accent"]);
  assert.equal(
    sections.find((section) => section.label === "Text")?.rows[0].tiles.some(
      (tile) => normalizeUsageHex(tile.hex) === "#0a0a0a"
    ),
    true
  );
  assert.equal(
    sections
      .find((section) => section.label === "Accent")
      ?.rows.flatMap((row) => row.tiles)
      .some((tile) => normalizeUsageHex(tile.hex) === "#0a0a0a") || false,
    false
  );
});

test("label ink follows how light or dark the tile is", () => {
  assert.equal(onSwatchInk("#08090a"), LIGHT_INK);
  assert.equal(onSwatchInk("#1d1d1f"), LIGHT_INK);
  assert.equal(onSwatchInk("#5e6ad2"), LIGHT_INK);
  assert.equal(onSwatchInk("#f7f8f8"), DARK_INK);
  assert.equal(onSwatchInk("#e5edf5"), DARK_INK);
  assert.equal(LIGHT_INK, "#ffffff");
});
