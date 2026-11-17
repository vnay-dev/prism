import test from "node:test";
import assert from "node:assert/strict";
import { buildPaletteCss } from "../src/popup/exportPaletteCss.js";

const swatches = [
  { hex: "#ffffff", primaryUsageRole: "background", usageRoles: ["background"], role: "foundation" },
  { hex: "#111111", primaryUsageRole: "text", usageRoles: ["text"], role: "neutral" },
  { hex: "#ba4093", primaryUsageRole: "accent", usageRoles: ["accent"], role: "primary" },
  { hex: "#3b82f6", role: "secondary" }
];

test("palette CSS emits :root custom properties from usage roles", () => {
  const css = buildPaletteCss(swatches, { pageMeta: { hostname: "www.apple.com" } });
  assert.match(css, /^\/\* CSS variables — apple\.com\n/);
  assert.match(css, /Paste into your stylesheet to reuse this palette/);
  assert.match(css, /:root \{/);
  assert.match(css, /--color-background: #FFFFFF;/);
  assert.match(css, /--color-text: #111111;/);
  assert.match(css, /--color-accent: #BA4093;/);
  assert.match(css, /--color-secondary: #3B82F6;/);
  assert.match(css, /\/\* Background \*\//);
  assert.match(css, /\}\n$/);
});

test("CSS header falls back to site title when hostname is missing", () => {
  const css = buildPaletteCss(swatches, { pageMeta: { siteName: "Apple" } });
  assert.match(css, /^\/\* CSS variables — Apple\n/);
});

test("duplicate role names get numeric suffixes", () => {
  const css = buildPaletteCss([
    { hex: "#111111", primaryUsageRole: "text", usageRoles: ["text"] },
    { hex: "#333333", primaryUsageRole: "text", usageRoles: ["text"] }
  ]);
  assert.match(css, /--color-text: #111111;/);
  assert.match(css, /--color-text-2: #333333;/);
});

test("duplicate hex values appear once", () => {
  const css = buildPaletteCss([
    { hex: "#fff", primaryUsageRole: "background", usageRoles: ["background"] },
    { hex: "#FFFFFF", primaryUsageRole: "background", usageRoles: ["background"] }
  ]);
  const matches = css.match(/--color-background:/g) || [];
  assert.equal(matches.length, 1);
  assert.match(css, /--color-background: #FFFFFF;/);
});

test("gradients become --gradient-N custom properties", () => {
  const css = buildPaletteCss(swatches, {
    gradients: [
      { css: "linear-gradient(90deg, #f00, #00f)" },
      { css: "  radial-gradient( circle , #0f0 , #00f )  " }
    ]
  });
  assert.match(css, /\/\* Gradients \*\//);
  assert.match(css, /--gradient-1: linear-gradient\(90deg, #f00, #00f\);/);
  assert.match(css, /--gradient-2: radial-gradient\( circle , #0f0 , #00f \);/);
});

test("empty palette still returns a valid :root block", () => {
  const css = buildPaletteCss([]);
  assert.match(css, /^\/\* CSS variables\n/);
  assert.match(css, /:root \{\n  \/\* No colors yet \*\/\n\}\n$/);
});

test("falls back to semantic role when usage is missing", () => {
  const css = buildPaletteCss([{ hex: "#0ea5e9", role: "primary" }]);
  assert.match(css, /--color-primary: #0EA5E9;/);
  assert.match(css, /\/\* Primary \*\//);
});
