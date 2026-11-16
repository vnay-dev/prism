import test from "node:test";
import assert from "node:assert/strict";
import { buildPaletteSvg } from "../src/popup/exportPaletteSvg.js";

const swatches = [
  { hex: "#ffffff", usageRoles: ["background"] },
  { hex: "#111111", usageRoles: ["text"] }
];

test("palette SVG has named, editable layers (no raster image)", () => {
  const svg = buildPaletteSvg(swatches, { hostname: "example.com" });
  assert.match(svg, /^<svg id="Example palette"/);
  assert.match(svg, /id="Background #FFFFFF"/);
  assert.match(svg, /id="Text #111111"/);
  assert.match(svg, /<text id="Example title"[^>]*>Example<\/text>/);
  assert.doesNotMatch(svg, /<image/);
});

test("swatches without usage roles fall back to Color N + hex", () => {
  const svg = buildPaletteSvg([{ hex: "#0ea5e9", role: "primary" }], { hostname: "acme.com" });
  assert.match(svg, /id="Acme palette"/);
  assert.match(svg, /id="Primary #0EA5E9"/);
});

test("stack view renders full-width bars", () => {
  const svg = buildPaletteSvg(swatches, {}, { viewMode: "stack" });
  assert.match(svg, /width="348"/);
});

test("gradients become SVG gradient fills and ids are unique", () => {
  const svg = buildPaletteSvg(
    swatches,
    {},
    { gradients: [{ css: "linear-gradient(90deg,#f00,#00f)" }, { css: "linear-gradient(0deg,#0f0,#00f)" }] }
  );
  assert.match(svg, /fill="url\(#prism-gradient-1\)"/);
  assert.match(svg, /fill="url\(#prism-gradient-2\)"/);
  const ids = [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test("a PNG logo is embedded as an xlink:href image", () => {
  const svg = buildPaletteSvg(swatches, {
    hostname: "example.com",
    iconDataUrl: "data:image/png;base64,AAAA"
  });
  assert.match(svg, /xmlns:xlink=/);
  assert.match(svg, /<image id="Example logo" xlink:href="data:image\/png;base64,AAAA"/);
});

test("untrusted logo URLs are not embedded", () => {
  const svg = buildPaletteSvg(swatches, { iconDataUrl: 'https://evil.test/x.png" onload="x' });
  assert.doesNotMatch(svg, /<image/);
});

test("radial gradients keep CSS center/size and transparent stops keep their color", () => {
  const svg = buildPaletteSvg(swatches, {}, {
    gradients: [{ css: "radial-gradient(circle at 100% 0%, rgb(255, 120, 50) 0%, rgba(255, 120, 50, 0) 60%)" }]
  });
  assert.match(svg, /gradientTransform="translate\(60 0\) scale\(84\.85/);
  assert.doesNotMatch(svg, /stop-color="rgb\(0, 0, 0\)"/);
});
