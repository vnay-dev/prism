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

test("pages with only utility chromatics still get a primary tile", async () => {
  const curated = curatePalette({
    sectionCount: 3,
    sampledElements: 40,
    samples: [
      {
        hex: "#f5f5f5",
        rgb: { r: 245, g: 245, b: 245 },
        hsl: { h: 0, s: 0, l: 96 },
        area: 800,
        importance: 200,
        sourceCategory: "global_background",
        sectionId: "section-0",
        context: "surface",
        contrast: 0.2
      },
      {
        hex: "#111111",
        rgb: { r: 17, g: 17, b: 17 },
        hsl: { h: 0, s: 0, l: 7 },
        area: 120,
        importance: 80,
        sourceCategory: "default",
        sectionId: "section-0",
        context: "text",
        contrast: 0.9
      },
      {
        hex: "#9ca3af",
        rgb: { r: 156, g: 163, b: 175 },
        hsl: { h: 220, s: 9, l: 65 },
        area: 60,
        importance: 40,
        sourceCategory: "default",
        sectionId: "section-1",
        context: "text",
        contrast: 0.5
      },
      {
        hex: "#22c55e",
        rgb: { r: 34, g: 197, b: 94 },
        hsl: { h: 142, s: 71, l: 45 },
        area: 40,
        importance: 90,
        sourceCategory: "success_state",
        sectionId: "section-1",
        context: "surface",
        contrast: 0.5
      },
      {
        hex: "#ef4444",
        rgb: { r: 239, g: 68, b: 68 },
        hsl: { h: 0, s: 84, l: 60 },
        area: 30,
        importance: 70,
        sourceCategory: "error_state",
        sectionId: "section-2",
        context: "surface",
        contrast: 0.5
      }
    ]
  });
  const assigned = assignRoles(curated);
  const primary = assigned.swatches.find((s) => s.role === "primary");
  assert.ok(primary, "expected a primary when page has chromatic colors");
  assert.ok(primary.hsl.s > 18, "primary must be chromatic, not gray");
  assert.equal(assigned.paletteMode, "brand");
});

test("soft pastel and deep brand darks can become primary", async () => {
  const curated = curatePalette({
    sectionCount: 3,
    sampledElements: 30,
    samples: [
      {
        hex: "#f8fafc",
        rgb: { r: 248, g: 250, b: 252 },
        hsl: { h: 210, s: 40, l: 98 },
        area: 900,
        importance: 200,
        sourceCategory: "global_background",
        sectionId: "section-0",
        context: "surface",
        contrast: 0.1,
        areaSourceType: "Background"
      },
      {
        hex: "#dbeafe",
        rgb: { r: 219, g: 234, b: 254 },
        hsl: { h: 214, s: 95, l: 93 },
        area: 200,
        importance: 320,
        sourceCategory: "hero_background",
        sectionId: "section-0",
        context: "surface",
        contrast: 0.2,
        areaSourceType: "Background"
      },
      {
        hex: "#0f172a",
        rgb: { r: 15, g: 23, b: 42 },
        hsl: { h: 222, s: 47, l: 11 },
        area: 80,
        importance: 280,
        sourceCategory: "primary_button",
        sectionId: "section-1",
        context: "button",
        contrast: 0.8
      },
      {
        hex: "#64748b",
        rgb: { r: 100, g: 116, b: 139 },
        hsl: { h: 215, s: 16, l: 47 },
        area: 40,
        importance: 40,
        sourceCategory: "default",
        sectionId: "section-2",
        context: "text",
        contrast: 0.5
      }
    ]
  });
  const assigned = assignRoles(curated);
  const primary = assigned.swatches.find((s) => s.role === "primary");
  assert.ok(primary, "expected primary from soft/deep brand colors");
  assert.ok(
    ["#dbeafe", "#0f172a"].includes(primary.hex.toLowerCase()),
    `primary should be pastel or deep brand, got ${primary.hex}`
  );
  assert.ok(primary.hsl.s > 18, "primary should not be a gray");
});

test("gray-only pages still expose a primary hero tile", async () => {
  const curated = curatePalette({
    sectionCount: 3,
    sampledElements: 20,
    samples: [
      {
        hex: "#f5f5f5",
        rgb: { r: 245, g: 245, b: 245 },
        hsl: { h: 0, s: 0, l: 96 },
        area: 800,
        importance: 200,
        sourceCategory: "global_background",
        sectionId: "section-0",
        context: "surface",
        contrast: 0.2,
        areaSourceType: "Background"
      },
      {
        hex: "#111111",
        rgb: { r: 17, g: 17, b: 17 },
        hsl: { h: 0, s: 0, l: 7 },
        area: 120,
        importance: 80,
        sourceCategory: "default",
        sectionId: "section-0",
        context: "text",
        contrast: 0.9
      },
      {
        hex: "#9ca3af",
        rgb: { r: 156, g: 163, b: 175 },
        hsl: { h: 220, s: 9, l: 65 },
        area: 60,
        importance: 50,
        sourceCategory: "default",
        sectionId: "section-1",
        context: "text",
        contrast: 0.5
      },
      {
        hex: "#6b7280",
        rgb: { r: 107, g: 114, b: 128 },
        hsl: { h: 220, s: 9, l: 46 },
        area: 40,
        importance: 40,
        sourceCategory: "default",
        sectionId: "section-2",
        context: "border",
        contrast: 0.4
      }
    ]
  });
  const assigned = assignRoles(curated);
  const primary = assigned.swatches.find((s) => s.role === "primary");
  assert.ok(primary, "gray-only pages should still get a primary tile");
  assert.ok(assigned.swatches.length >= 3, "should keep the available gray swatches");
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

test("pure black/white page canvases may be foundation but never primary accents", async () => {
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
        hex: "#ffffff",
        rgb: { r: 255, g: 255, b: 255 },
        hsl: { h: 0, s: 0, l: 100 },
        area: 400000,
        importance: 380,
        sourceCategory: "repeated_section_bg",
        areaSourceType: "Background",
        sectionId: "section-1",
        context: "surface"
      },
      {
        hex: "#000000",
        rgb: { r: 0, g: 0, b: 0 },
        hsl: { h: 0, s: 0, l: 0 },
        area: 50000,
        importance: 30,
        sourceCategory: "default",
        areaSourceType: "Text",
        sectionId: "section-0",
        context: "text"
      },
      {
        hex: "#000000",
        rgb: { r: 0, g: 0, b: 0 },
        hsl: { h: 0, s: 0, l: 0 },
        area: 900000,
        importance: 24,
        sourceCategory: "illustration",
        areaSourceType: "SVG Fill",
        sectionId: "section-2",
        context: "icon"
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
  const byHex = Object.fromEntries(assigned.swatches.map((s) => [s.hex.toLowerCase(), s]));
  assert.ok(byHex["#ffffff"], "white page canvas must remain as foundation/background");
  assert.ok(
    byHex["#ffffff"].role === "foundation" || byHex["#ffffff"].usageRoles.includes("background")
  );
  assert.ok(byHex["#000000"], "black body text must remain");
  assert.ok(byHex["#000000"].usageRoles.includes("text"));
  assert.notEqual(assigned.swatches.find((s) => s.role === "primary")?.hex.toLowerCase(), "#ffffff");
  assert.notEqual(assigned.swatches.find((s) => s.role === "primary")?.hex.toLowerCase(), "#000000");
  assert.equal(assigned.swatches.find((s) => s.role === "primary")?.hex.toLowerCase(), "#5e6ad2");
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

test("shuffle seeds produce distinct real-color palettes", async () => {
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
  // Shuffle uses real sampled colors only (no invented shades), so variety is
  // bounded by the page's chromatic pool — still expect multiple alternatives.
  assert.ok(
    signatures.size >= 4,
    `expected multiple shuffle alternatives, got ${signatures.size} distinct palettes`
  );
  for (let seed = 1; seed <= 10; seed++) {
    const assigned = assignRoles(curatePalette(fixtures[0], { seed: seed * 2654435761 }));
    assert.ok(
      assigned.swatches.some((s) => s.role === "primary"),
      "every shuffled palette should still include a primary"
    );
  }
});

function fixtureByName(fixtures, name) {
  const found = fixtures.find((entry) => entry.name === name);
  assert.ok(found, `missing fixture ${name}`);
  return found;
}

test("light grayscale marketplace keeps background, text, and button over marquee chips", async () => {
  const fixtures = await loadFixtures();
  const curated = curatePalette(fixtureByName(fixtures, "light-grayscale-marketplace"));
  const assigned = assignRoles(curated);
  const byHex = Object.fromEntries(assigned.swatches.map((s) => [s.hex.toLowerCase(), s]));

  assert.ok(byHex["#f5f5f5"]?.usageRoles.includes("background"), "page background must survive");
  // Near-black body text and dark button fills often merge (ΔE < 5); the cluster
  // must still expose both Text and Accent usage — not paste over identity.
  const darkInk = assigned.swatches.find((s) => s.hsl.l <= 12);
  assert.ok(darkInk, "dark ink/button cluster must survive curation");
  assert.ok(darkInk.usageRoles.includes("text"), "dark cluster must keep text usage");
  assert.ok(darkInk.usageRoles.includes("accent"), "dark CTA fill must keep accent usage");
  assert.ok(assigned.swatches.some((s) => s.usageRoles.includes("background")));
  assert.ok(assigned.swatches.some((s) => s.usageRoles.includes("text")));
  assert.ok(
    !assigned.swatches.every((s) => s.usageRoles.length === 1 && s.usageRoles[0] === "accent"),
    "palette must not collapse to accent-only"
  );
  // Marquee pastel chips may appear, but must not be the only swatches.
  assert.ok(assigned.swatches.length >= 3);
  assert.ok(byHex["#f5f5f5"].areaShare > (byHex["#e6fff0"]?.areaShare || 0));
});

test("chips-only extraction (oklch identity missing) cannot invent a full identity palette", async () => {
  const fixtures = await loadFixtures();
  const curated = curatePalette(fixtureByName(fixtures, "light-grayscale-chips-only-regression"));
  const assigned = assignRoles(curated);
  const hasFoundationSurface = assigned.swatches.some(
    (s) => s.usageRoles.includes("background") && s.hsl.l >= 90 && s.areaShare >= 20
  );
  const hasBodyText = assigned.swatches.some((s) => s.usageRoles.includes("text") && s.hsl.l <= 20);
  // Documents the pre-fix failure mode: without parsed page surfaces/text,
  // curation only has pastel chips / filtered black — no real identity.
  assert.equal(hasFoundationSurface, false);
  assert.equal(hasBodyText, false);
});

test("dark site with restrained accent keeps surfaces, light text, and small CTA", async () => {
  const fixtures = await loadFixtures();
  const curated = curatePalette(fixtureByName(fixtures, "dark-site-restrained-accent"));
  const assigned = assignRoles(curated);
  const foundation = assigned.swatches.find((s) => s.role === "foundation");
  const primary = assigned.swatches.find((s) => s.role === "primary");
  const byHex = Object.fromEntries(assigned.swatches.map((s) => [s.hex.toLowerCase(), s]));

  assert.ok(foundation, "expected dark foundation");
  assert.ok(foundation.hsl.l <= 12);
  assert.ok(byHex["#f4f4f5"]?.usageRoles.includes("text"), "light text on dark ground");
  assert.ok(byHex["#151922"]?.usageRoles.includes("background"), "secondary surface retained");
  assert.equal(primary?.hex.toLowerCase(), "#22d3ee");
  assert.ok(byHex["#22d3ee"]?.usageRoles.includes("accent"));
  // Tiny repeated icon gold must not outrank the real CTA.
  assert.notEqual(primary?.hex.toLowerCase(), "#fbbf24");
});

test("light site with competing accents prefers brand CTA over utility and icons", async () => {
  const fixtures = await loadFixtures();
  const curated = curatePalette(fixtureByName(fixtures, "competing-accents-light-site"));
  const assigned = assignRoles(curated);
  const primary = assigned.swatches.find((s) => s.role === "primary");
  const hexes = assigned.swatches.map((s) => s.hex.toLowerCase());
  const byHex = Object.fromEntries(assigned.swatches.map((s) => [s.hex.toLowerCase(), s]));

  assert.ok(byHex["#f8fafc"]?.usageRoles.includes("background"));
  assert.ok(byHex["#0f172a"]?.usageRoles.includes("text"));
  assert.ok(["#2563eb", "#f97316"].includes(primary?.hex.toLowerCase()));
  assert.ok(!hexes.includes("#22c55e") || byHex["#22c55e"]?.isUtility);
  // Small purple icon can remain, but must not become primary.
  assert.notEqual(primary?.hex.toLowerCase(), "#a855f7");
});

test("small CTA accent is kept despite tiny coverage", async () => {
  const fixtures = await loadFixtures();
  const curated = curatePalette(fixtureByName(fixtures, "dark-site-restrained-accent"));
  const assigned = assignRoles(curated);
  const accent = assigned.swatches.find((s) => s.hex.toLowerCase() === "#22d3ee");
  assert.ok(accent, "small-area CTA must remain in the palette");
  assert.ok(accent.areaShare < 5, "CTA coverage is intentionally small");
  assert.ok(accent.usageRoles.includes("accent"));
});

test("classifySourceFromSignals does not treat link fills as page surfaces", async () => {
  const { classifySourceFromSignals } = await import("../src/core/sourceClassification.js");
  assert.equal(
    classifySourceFromSignals({
      tagName: "A",
      context: "link",
      prop: "backgroundColor",
      classText: "flex items-center gap-2 px-4"
    }),
    "default"
  );
  assert.equal(
    classifySourceFromSignals({
      tagName: "DIV",
      context: "surface",
      prop: "backgroundColor",
      classText: "content-section",
      sectionIndex: 2
    }),
    "repeated_section_bg"
  );
});

test("small badge fills are not major_container page surfaces", async () => {
  const { classifySourceFromSignals } = await import("../src/core/sourceClassification.js");
  assert.equal(
    classifySourceFromSignals({
      tagName: "DIV",
      context: "surface",
      prop: "backgroundColor",
      classText: "absolute top-0 right-0 bg-amber-100",
      text: "FOR SALE",
      area: 2400,
      viewportArea: 1920 * 1080
    }),
    "promo_content"
  );
  assert.equal(
    classifySourceFromSignals({
      tagName: "SPAN",
      context: "surface",
      prop: "backgroundColor",
      classText: "inline-flex rounded-full",
      area: 1800,
      viewportArea: 1440 * 900
    }),
    "default"
  );
  assert.equal(
    classifySourceFromSignals({
      tagName: "DIV",
      context: "surface",
      prop: "backgroundColor",
      classText: "card shadow-sm",
      area: 220000,
      viewportArea: 1440 * 900
    }),
    "card"
  );
});

test("dominant background keeps Background while badge fills do not", async () => {
  const curated = curatePalette({
    sectionCount: 5,
    sampledElements: 200,
    samples: [
      ...[0, 1, 2, 3, 4].flatMap((section) => [
        {
          hex: "#f5f5f5",
          rgb: { r: 245, g: 245, b: 245 },
          hsl: { h: 0, s: 0, l: 96 },
          area: 400000,
          importance: 24,
          sourceCategory: "global_background",
          sectionId: `section-${section}`,
          context: "surface",
          contrast: 0.1,
          areaSourceType: "Background"
        }
      ]),
      ...Array.from({ length: 20 }, (_, i) => ({
        hex: "#fef3c6",
        rgb: { r: 254, g: 243, b: 198 },
        hsl: { h: 48, s: 97, l: 89 },
        area: 900,
        importance: 18,
        sourceCategory: "major_container",
        sectionId: `section-${i % 5}`,
        context: "surface",
        contrast: 0.3,
        areaSourceType: "Background"
      })),
      {
        hex: "#0a0a0a",
        rgb: { r: 10, g: 10, b: 10 },
        hsl: { h: 0, s: 0, l: 4 },
        area: 50000,
        importance: 30,
        sourceCategory: "default",
        sectionId: "section-0",
        context: "text",
        contrast: 0.9,
        areaSourceType: "Text"
      },
      {
        hex: "#0a0a0a",
        rgb: { r: 10, g: 10, b: 10 },
        hsl: { h: 0, s: 0, l: 4 },
        area: 40000,
        importance: 30,
        sourceCategory: "default",
        sectionId: "section-1",
        context: "text",
        contrast: 0.9,
        areaSourceType: "Text"
      },
      {
        hex: "#e2e8f0",
        rgb: { r: 226, g: 232, b: 240 },
        hsl: { h: 214, s: 32, l: 91 },
        area: 220000,
        importance: 48,
        sourceCategory: "card",
        sectionId: "section-1",
        context: "surface",
        contrast: 0.1,
        areaSourceType: "Background"
      },
      {
        hex: "#e2e8f0",
        rgb: { r: 226, g: 232, b: 240 },
        hsl: { h: 214, s: 32, l: 91 },
        area: 200000,
        importance: 48,
        sourceCategory: "card",
        sectionId: "section-2",
        context: "surface",
        contrast: 0.1,
        areaSourceType: "Background"
      }
    ]
  });
  const assigned = assignRoles(curated);
  const byHex = Object.fromEntries(assigned.swatches.map((s) => [s.hex.toLowerCase(), s]));

  assert.ok(byHex["#f5f5f5"]?.usageRoles.includes("background"), "main canvas stays Background");
  assert.ok(byHex["#e2e8f0"]?.usageRoles.includes("background"), "large card surfaces stay Background");
  assert.ok(
    !byHex["#fef3c6"] || !byHex["#fef3c6"].usageRoles.includes("background"),
    "badge fill must not enter Background"
  );
  if (byHex["#fef3c6"]) {
    assert.ok(byHex["#fef3c6"].usageRoles.includes("accent"), "badge may remain as Accent");
  }
});

test("X-like white canvas keeps Background; green accents do not become Background", async () => {
  const curated = curatePalette({
    sectionCount: 5,
    samples: [
      ...[0, 1, 2, 3, 4].map((section) => ({
        hex: "#ffffff",
        rgb: { r: 255, g: 255, b: 255 },
        hsl: { h: 0, s: 0, l: 100 },
        area: 500000,
        importance: 24,
        sourceCategory: "global_background",
        sectionId: `section-${section}`,
        context: "surface",
        contrast: 0.1,
        areaSourceType: "Background"
      })),
      {
        hex: "#000000",
        rgb: { r: 0, g: 0, b: 0 },
        hsl: { h: 0, s: 0, l: 0 },
        area: 70000,
        importance: 30,
        sourceCategory: "default",
        sectionId: "section-0",
        context: "text",
        contrast: 0.9,
        areaSourceType: "Text"
      },
      {
        hex: "#000000",
        rgb: { r: 0, g: 0, b: 0 },
        hsl: { h: 0, s: 0, l: 0 },
        area: 50000,
        importance: 30,
        sourceCategory: "default",
        sectionId: "section-1",
        context: "text",
        contrast: 0.9,
        areaSourceType: "Text"
      },
      {
        hex: "#1d9bf0",
        rgb: { r: 29, g: 155, b: 240 },
        hsl: { h: 203, s: 89, l: 53 },
        area: 8000,
        importance: 900,
        sourceCategory: "hero_cta",
        sectionId: "section-0",
        context: "button",
        contrast: 0.7,
        areaSourceType: "Background"
      },
      // Repeated green success / join chips — must not become foundational Background
      ...[0, 1, 2, 3, 4].flatMap((section) => [
        {
          hex: "#00ba7c",
          rgb: { r: 0, g: 186, b: 124 },
          hsl: { h: 160, s: 100, l: 36 },
          area: 12000,
          importance: 48,
          sourceCategory: "major_container",
          sectionId: `section-${section}`,
          context: "surface",
          contrast: 0.5,
          areaSourceType: "Background"
        },
        {
          hex: "#00ba7c",
          rgb: { r: 0, g: 186, b: 124 },
          hsl: { h: 160, s: 100, l: 36 },
          area: 3000,
          importance: 40,
          sourceCategory: "success_state",
          sectionId: `section-${section}`,
          context: "surface",
          contrast: 0.5,
          areaSourceType: "Background"
        }
      ])
    ]
  });
  const assigned = assignRoles(curated);
  const byHex = Object.fromEntries(assigned.swatches.map((s) => [s.hex.toLowerCase(), s]));
  const sections = (await import("../src/popup/paletteLayout.js")).buildRoleSections(assigned.swatches);
  const backgroundHexes = sections
    .filter((section) => section.label === "Background")
    .flatMap((section) => section.rows.flatMap((row) => row.tiles.map((tile) => tile.hex.toLowerCase())));

  assert.ok(byHex["#ffffff"], "white canvas must survive curation");
  assert.ok(backgroundHexes.includes("#ffffff"), "white canvas must be Background");
  assert.ok(!backgroundHexes.includes("#00ba7c"), "green must not be foundational Background");
  if (byHex["#00ba7c"]) {
    assert.ok(
      byHex["#00ba7c"].usageRoles.includes("accent") || byHex["#00ba7c"].primaryUsageRole === "accent",
      "green remains an accent-like color"
    );
  }
  assert.ok(byHex["#1d9bf0"]?.usageRoles.includes("accent"));
});

test("Reddit-like light canvas keeps Background over colorful community accents", async () => {
  const curated = curatePalette({
    sectionCount: 5,
    samples: [
      ...[0, 1, 2, 3, 4].map((section) => ({
        hex: "#ffffff",
        rgb: { r: 255, g: 255, b: 255 },
        hsl: { h: 0, s: 0, l: 100 },
        area: 450000,
        importance: 24,
        sourceCategory: "global_background",
        sectionId: `section-${section}`,
        context: "surface",
        contrast: 0.1,
        areaSourceType: "Background"
      })),
      ...[1, 2, 3].map((section) => ({
        hex: "#dae0e6",
        rgb: { r: 218, g: 224, b: 230 },
        hsl: { h: 210, s: 20, l: 88 },
        area: 160000,
        importance: 42,
        sourceCategory: "major_container",
        sectionId: `section-${section}`,
        context: "surface",
        contrast: 0.15,
        areaSourceType: "Background"
      })),
      {
        hex: "#1c1c1c",
        rgb: { r: 28, g: 28, b: 28 },
        hsl: { h: 0, s: 0, l: 11 },
        area: 60000,
        importance: 30,
        sourceCategory: "default",
        sectionId: "section-0",
        context: "text",
        contrast: 0.9,
        areaSourceType: "Text"
      },
      {
        hex: "#1c1c1c",
        rgb: { r: 28, g: 28, b: 28 },
        hsl: { h: 0, s: 0, l: 11 },
        area: 40000,
        importance: 30,
        sourceCategory: "default",
        sectionId: "section-1",
        context: "text",
        contrast: 0.9,
        areaSourceType: "Text"
      },
      {
        hex: "#ff4500",
        rgb: { r: 255, g: 69, b: 0 },
        hsl: { h: 16, s: 100, l: 50 },
        area: 7000,
        importance: 900,
        sourceCategory: "primary_button",
        sectionId: "section-0",
        context: "button",
        contrast: 0.75,
        areaSourceType: "Background"
      },
      ...[0, 1, 2, 3, 4].map((section) => ({
        hex: "#46d160",
        rgb: { r: 70, g: 209, b: 96 },
        hsl: { h: 131, s: 60, l: 55 },
        area: 9000,
        importance: 60,
        sourceCategory: "major_container",
        sectionId: `section-${section}`,
        context: "surface",
        contrast: 0.5,
        areaSourceType: "Background"
      }))
    ]
  });
  const assigned = assignRoles(curated);
  const sections = (await import("../src/popup/paletteLayout.js")).buildRoleSections(assigned.swatches);
  const backgroundHexes = sections
    .filter((section) => section.label === "Background")
    .flatMap((section) => section.rows.flatMap((row) => row.tiles.map((tile) => tile.hex.toLowerCase())));

  assert.ok(backgroundHexes.includes("#ffffff") || backgroundHexes.includes("#dae0e6"));
  assert.ok(!backgroundHexes.includes("#46d160"), "community green must not be Background");
  assert.ok(!backgroundHexes.includes("#ff4500"), "orangered CTA must not be Background");
});

test("dark theme canvas stays Background while green accents stay Accent", async () => {
  const curated = curatePalette({
    sectionCount: 5,
    samples: [
      ...[0, 1, 2, 3, 4].map((section) => ({
        hex: "#000000",
        rgb: { r: 0, g: 0, b: 0 },
        hsl: { h: 0, s: 0, l: 0 },
        area: 500000,
        importance: 24,
        sourceCategory: "global_background",
        sectionId: `section-${section}`,
        context: "surface",
        contrast: 0.1,
        areaSourceType: "Background"
      })),
      {
        hex: "#e7e9ea",
        rgb: { r: 231, g: 233, b: 234 },
        hsl: { h: 200, s: 6, l: 91 },
        area: 50000,
        importance: 30,
        sourceCategory: "default",
        sectionId: "section-0",
        context: "text",
        contrast: 0.9,
        areaSourceType: "Text"
      },
      {
        hex: "#e7e9ea",
        rgb: { r: 231, g: 233, b: 234 },
        hsl: { h: 200, s: 6, l: 91 },
        area: 40000,
        importance: 30,
        sourceCategory: "default",
        sectionId: "section-1",
        context: "text",
        contrast: 0.9,
        areaSourceType: "Text"
      },
      {
        hex: "#00ba7c",
        rgb: { r: 0, g: 186, b: 124 },
        hsl: { h: 160, s: 100, l: 36 },
        area: 5000,
        importance: 900,
        sourceCategory: "hero_cta",
        sectionId: "section-0",
        context: "button",
        contrast: 0.7,
        areaSourceType: "Background"
      },
      ...[0, 1, 2].map((section) => ({
        hex: "#00ba7c",
        rgb: { r: 0, g: 186, b: 124 },
        hsl: { h: 160, s: 100, l: 36 },
        area: 8000,
        importance: 48,
        sourceCategory: "major_container",
        sectionId: `section-${section}`,
        context: "surface",
        contrast: 0.5,
        areaSourceType: "Background"
      }))
    ]
  });
  const assigned = assignRoles(curated);
  const sections = (await import("../src/popup/paletteLayout.js")).buildRoleSections(assigned.swatches);
  const backgroundHexes = sections
    .filter((section) => section.label === "Background")
    .flatMap((section) => section.rows.flatMap((row) => row.tiles.map((tile) => tile.hex.toLowerCase())));
  const accentHexes = sections
    .filter((section) => section.label === "Accent")
    .flatMap((section) => section.rows.flatMap((row) => row.tiles.map((tile) => tile.hex.toLowerCase())));

  assert.ok(backgroundHexes.includes("#000000"), "dark canvas must be Background");
  assert.ok(!backgroundHexes.includes("#00ba7c"));
  assert.ok(accentHexes.includes("#00ba7c"), "green CTA/surface remains Accent");
});

test("dark site keeps multiple large surface shades as Background", async () => {
  const curated = curatePalette({
    sectionCount: 5,
    samples: [
      ...[0, 1, 2, 3, 4].map((section) => ({
        hex: "#0b0d10",
        rgb: { r: 11, g: 13, b: 16 },
        hsl: { h: 216, s: 18, l: 5 },
        area: 500000,
        importance: 24,
        sourceCategory: "global_background",
        sectionId: `section-${section}`,
        context: "surface",
        contrast: 0.1,
        areaSourceType: "Background"
      })),
      ...[1, 2, 3].map((section) => ({
        hex: "#151922",
        rgb: { r: 21, g: 25, b: 34 },
        hsl: { h: 222, s: 24, l: 11 },
        area: 180000,
        importance: 48,
        sourceCategory: "major_container",
        sectionId: `section-${section}`,
        context: "surface",
        contrast: 0.2,
        areaSourceType: "Background"
      })),
      {
        hex: "#f4f4f5",
        rgb: { r: 244, g: 244, b: 245 },
        hsl: { h: 240, s: 5, l: 96 },
        area: 40000,
        importance: 30,
        sourceCategory: "default",
        sectionId: "section-0",
        context: "text",
        contrast: 0.9,
        areaSourceType: "Text"
      },
      {
        hex: "#f4f4f5",
        rgb: { r: 244, g: 244, b: 245 },
        hsl: { h: 240, s: 5, l: 96 },
        area: 30000,
        importance: 30,
        sourceCategory: "default",
        sectionId: "section-1",
        context: "text",
        contrast: 0.9,
        areaSourceType: "Text"
      }
    ]
  });
  const assigned = assignRoles(curated);
  const byHex = Object.fromEntries(assigned.swatches.map((s) => [s.hex.toLowerCase(), s]));
  assert.ok(byHex["#0b0d10"]?.usageRoles.includes("background"));
  assert.ok(byHex["#151922"]?.usageRoles.includes("background"));
  assert.ok(byHex["#f4f4f5"]?.usageRoles.includes("text"));
});
