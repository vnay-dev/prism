import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { curatePalette } from "../src/core/scoreAndCluster.js";
import { assignRoles } from "../src/core/assignRoles.js";

async function loadFixtures() {
  const raw = await readFile(new URL("./fixtures/palette-fixtures.json", import.meta.url), "utf8");
  return JSON.parse(raw);
}

test("curatePalette returns 8 balanced colors", async () => {
  const fixtures = await loadFixtures();
  const curated = curatePalette(fixtures[0]);
  assert.equal(curated.selected.length, 8);
  assert.ok(curated.selected.every((c) => typeof c.areaShare === "number"));
});

test("brand site assigns primary chromatic and supporting neutrals", async () => {
  const fixtures = await loadFixtures();
  const curated = curatePalette(fixtures[0]);
  const assigned = assignRoles(curated);
  assert.equal(assigned.swatches.length, 8);
  assert.ok(assigned.swatches.some((s) => s.role === "primary"));
  assert.ok(assigned.swatches.some((s) => s.role === "neutral" || s.role === "foundation"));
  assert.equal(assigned.paletteMode, "brand");
});

test("light neutral site promotes dominant surface to foundation", async () => {
  const fixtures = await loadFixtures();
  const curated = curatePalette(fixtures[1]);
  const assigned = assignRoles(curated);
  const foundation = assigned.swatches.find((s) => s.role === "foundation");
  assert.ok(foundation, "expected a foundation color on neutral-heavy site");
  assert.ok(foundation.areaShare >= 40);
  assert.equal(assigned.paletteMode, "foundation");
});

test("dark saas site separates foundation from brand colors", async () => {
  const fixtures = await loadFixtures();
  const curated = curatePalette(fixtures[2]);
  const assigned = assignRoles(curated);
  const foundation = assigned.swatches.find((s) => s.role === "foundation");
  const primary = assigned.swatches.find((s) => s.role === "primary");
  assert.ok(foundation, "expected dark foundation");
  assert.ok(foundation.hsl.l <= 12, "foundation should be a dark surface");
  assert.ok(primary, "expected brand primary");
  assert.ok(primary.hsl.s > 18, "primary should be chromatic");
  assert.equal(assigned.paletteMode, "brand");
});

test("utility-heavy colors do not become primary or secondary", async () => {
  const fixtures = await loadFixtures();
  const curated = curatePalette(fixtures[3]);
  const assigned = assignRoles(curated);
  const primary = assigned.swatches.find((s) => s.role === "primary");
  const secondaries = assigned.swatches.filter((s) => s.role === "secondary");
  const utilityRoles = assigned.swatches.filter((s) => s.isUtility);

  assert.ok(primary, "expected brand primary");
  assert.ok(["#5e6ad2", "#8b5cf6"].includes(primary.hex), "primary should be brand purple/blue");
  for (const s of secondaries) {
    assert.ok(!s.isUtility, "utility colors must not be secondary");
    assert.ok(!["#22c55e", "#f59e0b", "#ef4444"].includes(s.hex), "status colors must not be secondary");
  }
  for (const u of utilityRoles) {
    assert.ok(u.role === "accent" || u.role === "neutral", "utility colors capped at accent");
  }
});

test("classifySourceFromSignals detects utility badges", async () => {
  const { classifySourceFromSignals } = await import("../src/core/sourceClassification.js");
  assert.equal(
    classifySourceFromSignals({ classText: "badge success", text: "Completed" }),
    "success_state"
  );
  assert.equal(
    classifySourceFromSignals({ tagName: "BUTTON", context: "button", inHero: true, contentZone: "website_chrome" }),
    "hero_cta"
  );
});

test("classifySourceFromSignals demotes product demo navigation", async () => {
  const { classifySourceFromSignals } = await import("../src/core/sourceClassification.js");
  assert.equal(
    classifySourceFromSignals({
      tagName: "SVG",
      context: "icon",
      inNav: true,
      classText: "Sidebar_sidebar",
      contentZone: "product_demo"
    }),
    "demo_status"
  );
  assert.equal(
    classifySourceFromSignals({
      tagName: "NAV",
      inNav: true,
      classText: "Sidebar_sidebar",
      contentZone: "product_demo"
    }),
    "demo_sidebar"
  );
  assert.equal(
    classifySourceFromSignals({
      tagName: "NAV",
      inNav: true,
      contentZone: "website_chrome"
    }),
    "navigation"
  );
});

test("foundation uses background surface area not svg inflation", async () => {
  const { curatePalette } = await import("../src/core/scoreAndCluster.js");
  const { assignRoles } = await import("../src/core/assignRoles.js");
  const extraction = {
    sectionCount: 6,
    samples: [
      {
        hex: "#000000",
        rgb: { r: 0, g: 0, b: 0 },
        hsl: { h: 0, s: 0, l: 0 },
        area: 5000000,
        importance: 100,
        sourceCategory: "illustration",
        areaSourceType: "SVG Fill",
        sectionId: "section-0",
        context: "icon"
      },
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
});

test("browser default link blue cannot become primary", async () => {
  const { curatePalette } = await import("../src/core/scoreAndCluster.js");
  const { assignRoles } = await import("../src/core/assignRoles.js");
  const extraction = {
    sectionCount: 4,
    samples: [
      {
        hex: "#ffffff",
        rgb: { r: 255, g: 255, b: 255 },
        hsl: { h: 0, s: 0, l: 100 },
        area: 500000,
        importance: 120,
        sourceCategory: "global_background",
        areaSourceType: "Background",
        sectionId: "section-0",
        context: "surface"
      },
      {
        hex: "#ffffff",
        rgb: { r: 255, g: 255, b: 255 },
        hsl: { h: 0, s: 0, l: 100 },
        area: 400000,
        importance: 100,
        sourceCategory: "repeated_section_bg",
        areaSourceType: "Background",
        sectionId: "section-1",
        context: "surface"
      },
      {
        hex: "#0000ee",
        rgb: { r: 0, g: 0, b: 238 },
        hsl: { h: 240, s: 100, l: 47 },
        area: 2000,
        importance: 560,
        sourceCategory: "navigation",
        areaSourceType: "Text",
        sectionId: "section-0",
        context: "link"
      },
      {
        hex: "#1ed760",
        rgb: { r: 30, g: 215, b: 96 },
        hsl: { h: 141, s: 76, l: 48 },
        area: 8000,
        importance: 540,
        sourceCategory: "primary_button",
        areaSourceType: "Background",
        sectionId: "section-0",
        context: "button"
      }
    ]
  };
  const assigned = assignRoles(curatePalette(extraction));
  const primary = assigned.swatches.find((s) => s.role === "primary");
  assert.notEqual(primary?.hex, "#0000ee");
  assert.equal(primary?.hex, "#1ed760");
});

test("pure black and pure white never appear in the curated palette", async () => {
  const { curatePalette } = await import("../src/core/scoreAndCluster.js");
  const { assignRoles } = await import("../src/core/assignRoles.js");
  const extraction = {
    sectionCount: 4,
    samples: [
      {
        hex: "#ffffff",
        rgb: { r: 255, g: 255, b: 255 },
        hsl: { h: 0, s: 0, l: 100 },
        area: 500000,
        importance: 400,
        sourceCategory: "global_background",
        areaSourceType: "Background",
        sectionId: "section-0",
        context: "surface"
      },
      {
        hex: "#000000",
        rgb: { r: 0, g: 0, b: 0 },
        hsl: { h: 0, s: 0, l: 0 },
        area: 400000,
        importance: 380,
        sourceCategory: "repeated_section_bg",
        areaSourceType: "Background",
        sectionId: "section-1",
        context: "surface"
      },
      {
        hex: "#f4f4f4",
        rgb: { r: 244, g: 244, b: 244 },
        hsl: { h: 0, s: 0, l: 96 },
        area: 100000,
        importance: 80,
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

  const curated = curatePalette(extraction);
  const assigned = assignRoles(curated);
  const hexes = assigned.swatches.map((s) => s.hex.toLowerCase());
  assert.ok(!hexes.includes("#000000"), "pure black must be excluded");
  assert.ok(!hexes.includes("#ffffff"), "pure white must be excluded");
});

test("shuffling with a seed produces a valid, black/white-free palette", async () => {
  const fixtures = await loadFixtures();
  const curated = curatePalette(fixtures[0], { seed: 42 });
  const assigned = assignRoles(curated);
  assert.equal(assigned.swatches.length, 8);
  const hexes = assigned.swatches.map((s) => s.hex.toLowerCase());
  assert.ok(!hexes.includes("#000000"));
  assert.ok(!hexes.includes("#ffffff"));
});

test("different shuffle seeds tend to produce different palettes", async () => {
  const fixtures = await loadFixtures();
  const signatures = new Set();
  for (let seed = 0; seed < 20; seed++) {
    const curated = curatePalette(fixtures[0], { seed: seed * 97 + 1 });
    const assigned = assignRoles(curated);
    signatures.add(
      assigned.swatches
        .map((s) => s.hex.toLowerCase())
        .sort()
        .join(",")
    );
  }
  assert.ok(signatures.size > 1, "expected shuffle seeds to yield more than one distinct palette");
});

test("avoidHexes pushes shuffle away from the current palette", async () => {
  const fixtures = await loadFixtures();
  const base = assignRoles(curatePalette(fixtures[0]));
  const baseSig = base.swatches
    .map((s) => s.hex.toLowerCase())
    .sort()
    .join(",");
  const avoidHexes = base.swatches.map((s) => s.hex);

  let foundDifferent = false;
  for (let seed = 1; seed <= 40; seed++) {
    const curated = curatePalette(fixtures[0], { seed: seed * 2654435761, avoidHexes });
    const assigned = assignRoles(curated);
    const sig = assigned.swatches
      .map((s) => s.hex.toLowerCase())
      .sort()
      .join(",");
    if (sig !== baseSig) {
      foundDifferent = true;
      break;
    }
  }
  assert.ok(foundDifferent, "expected avoidHexes to produce a palette different from the base");
});

test("omitting the seed keeps curatePalette fully deterministic", async () => {
  const fixtures = await loadFixtures();
  const first = curatePalette(fixtures[0]);
  const second = curatePalette(fixtures[0]);
  assert.deepEqual(first.selected.map((c) => c.hex), second.selected.map((c) => c.hex));
});

test("shadeColor produces darker and lighter siblings without pure black/white", async () => {
  const { shadeColor } = await import("../src/core/colorLab.js");
  const base = { hex: "#5e6ad2", rgb: { r: 94, g: 106, b: 210 }, hsl: { h: 234, s: 56, l: 60 } };
  const darker = shadeColor(base, -20);
  const lighter = shadeColor(base, 20);
  assert.ok(darker);
  assert.ok(lighter);
  assert.notEqual(darker.hex.toLowerCase(), base.hex.toLowerCase());
  assert.notEqual(lighter.hex.toLowerCase(), base.hex.toLowerCase());
  assert.ok(darker.hsl.l < base.hsl.l);
  assert.ok(lighter.hsl.l > base.hsl.l);
  assert.notEqual(darker.hex.toLowerCase(), "#000000");
  assert.notEqual(lighter.hex.toLowerCase(), "#ffffff");
});

test("hexToRgb parses six-digit hex codes", async () => {
  const { hexToRgb, rgbToHex } = await import("../src/core/colorLab.js");
  assert.deepEqual(hexToRgb("#5e6ad2"), { r: 94, g: 106, b: 210 });
  assert.equal(rgbToHex(hexToRgb("#abcdef")), "#abcdef");
  assert.equal(hexToRgb("not-a-color"), null);
});

test("shuffle seeds produce many distinct palettes via shades", async () => {
  const fixtures = await loadFixtures();
  const signatures = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const curated = curatePalette(fixtures[0], { seed: seed * 2654435761 });
    const assigned = assignRoles(curated);
    signatures.add(
      assigned.swatches
        .map((s) => s.hex.toLowerCase())
        .sort()
        .join("|")
    );
  }
  assert.ok(
    signatures.size >= 15,
    `expected rich shade variety, got ${signatures.size} distinct palettes`
  );
});
