import test from "node:test";
import assert from "node:assert/strict";
import {
  splitBackgroundImageLayers,
  isGradientLayer,
  extractGradientStops,
  normalizeGradientCss,
  curateGradients,
  gradientKind
} from "../src/core/curateGradients.js";
import {
  parseCssGradient,
  cssLinearEndpoints,
  paintParsedGradient
} from "../src/core/paintGradient.js";
import { buildRoleSections, GRADIENT_SECTION_LABEL } from "../src/popup/paletteLayout.js";

test("splitBackgroundImageLayers respects nested commas", () => {
  const layers = splitBackgroundImageLayers(
    "linear-gradient(90deg, rgb(255, 0, 0), blue), url(https://x.test/a.png), radial-gradient(circle, #fff, #000)"
  );
  assert.equal(layers.length, 3);
  assert.ok(layers[0].startsWith("linear-gradient"));
  assert.ok(layers[1].startsWith("url("));
  assert.ok(layers[2].startsWith("radial-gradient"));
});

test("isGradientLayer accepts gradient functions and rejects urls", () => {
  assert.equal(isGradientLayer("linear-gradient(to right, #fff, #000)"), true);
  assert.equal(isGradientLayer("repeating-linear-gradient(#f00, #00f 10px)"), true);
  assert.equal(isGradientLayer("url(https://example.com/bg.png)"), false);
  assert.equal(isGradientLayer("none"), false);
});

test("extractGradientStops pulls hex and rgb tokens in order", () => {
  const stops = extractGradientStops(
    "linear-gradient(135deg, #112233 0%, rgba(255, 0, 0, 0.5) 50%, blue)"
  );
  assert.deepEqual(
    stops.map((s) => s.toLowerCase()),
    ["#112233", "rgba(255, 0, 0, 0.5)", "blue"]
  );
});

test("parseCssGradient reads angle and stop offsets", () => {
  const parsed = parseCssGradient(
    "linear-gradient(90deg, #ff0000 0%, #0000ff 100%)"
  );
  assert.equal(parsed.type, "linear");
  assert.equal(parsed.angle, 90);
  assert.equal(parsed.stops.length, 2);
  assert.equal(parsed.stops[0].color.toLowerCase(), "#ff0000");
  assert.equal(parsed.stops[0].offset, 0);
  assert.equal(parsed.stops[1].offset, 1);
});

test("cssLinearEndpoints maps 90deg to a left-right line", () => {
  const line = cssLinearEndpoints(90, 200, 40);
  assert.ok(Math.abs(line.x1 - 0) < 0.01);
  assert.ok(Math.abs(line.x2 - 200) < 0.01);
  assert.ok(Math.abs(line.y1 - 20) < 0.01);
  assert.ok(Math.abs(line.y2 - 20) < 0.01);
});

test("paintParsedGradient writes distinct pixels across a bar", () => {
  // Minimal canvas stub for Node — only the APIs paintParsedGradient needs.
  const pixels = new Map();
  const gradientStops = [];
  const ctx = {
    createLinearGradient() {
      return {
        addColorStop(offset, color) {
          gradientStops.push({ offset, color });
        }
      };
    },
    createRadialGradient() {
      return { addColorStop() {} };
    },
    fillStyle: null,
    fillRect(x, y, w, h) {
      pixels.set("painted", { x, y, w, h, fill: this.fillStyle });
    }
  };

  const parsed = parseCssGradient("linear-gradient(to right, #111111, #eeeeee)");
  const ok = paintParsedGradient(ctx, parsed, 0, 0, 100, 20, (c) => c);
  assert.equal(ok, true);
  assert.equal(gradientStops.length, 2);
  assert.equal(gradientStops[0].color.toLowerCase(), "#111111");
  assert.equal(gradientStops[1].color.toLowerCase(), "#eeeeee");
  assert.ok(pixels.get("painted"));
});

test("curateGradients dedupes, ranks by area, and drops near-solids", () => {
  const curated = curateGradients([
    {
      css: "linear-gradient(to right, #111111, #111111)",
      area: 100000,
      importance: 50
    },
    {
      css: "linear-gradient(90deg, #ff0000, #0000ff)",
      area: 20000,
      importance: 40
    },
    {
      css: "LINEAR-GRADIENT(90deg, #FF0000, #0000FF)",
      area: 30000,
      importance: 60
    },
    {
      css: "radial-gradient(circle at center, #ffffff, #000000)",
      area: 15000,
      importance: 30
    },
    {
      css: "url(https://example.com/x.png)",
      area: 90000,
      importance: 90
    }
  ]);

  assert.equal(curated.length, 2);
  assert.equal(normalizeGradientCss(curated[0].css), "linear-gradient(90deg, #ff0000, #0000ff)");
  assert.equal(curated[0].area, 50000);
  assert.equal(gradientKind(curated[1].css), "radial");
  assert.equal(curated[0].id, "grad-1");
});

test("buildRoleSections appends Gradients after color roles", () => {
  const sections = buildRoleSections(
    [
      { hex: "#ffffff", usageRoles: ["background"], primaryUsageRole: "background" },
      { hex: "#111111", usageRoles: ["text"], primaryUsageRole: "text" },
      { hex: "#3b82f6", usageRoles: ["accent"], primaryUsageRole: "accent" }
    ],
    {
      gradients: [
        {
          id: "grad-1",
          css: "linear-gradient(to right, #f00, #00f)",
          kind: "linear",
          stops: ["#f00", "#00f"]
        }
      ]
    }
  );

  assert.equal(sections.length, 4);
  assert.equal(sections[0].label, "Background");
  assert.equal(sections[1].label, "Text");
  assert.equal(sections[2].label, "Accent");
  assert.equal(sections[3].label, GRADIENT_SECTION_LABEL);
  assert.equal(sections[3].kind, "gradients");
  assert.equal(sections[3].rows.length, 1);
  assert.equal(sections[3].rows[0].tiles.length, 1);
  assert.equal(sections[3].rows[0].tiles[0].css, "linear-gradient(to right, #f00, #00f)");
  // Grid view uses the same square tile geometry as color swatches.
  assert.equal(sections[3].rows[0].height, sections[0].rows[0].height);
});
