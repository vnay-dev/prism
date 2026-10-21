import test from "node:test";
import assert from "node:assert/strict";
import {
  COLOR_VIEW_MODES,
  normalizeColorViewMode,
  flattenUniqueSwatches,
  buildStackLayout,
  sortSwatchesByColorWheel
} from "../src/popup/paletteViews.js";

const SAMPLE = [
  { hex: "#ffffff", role: "foundation", areaShare: 40, usageRoles: ["background"] },
  { hex: "#111111", role: "neutral", areaShare: 20, usageRoles: ["text"] },
  { hex: "#3b82f6", role: "primary", areaShare: 8, usageRoles: ["accent"], hsl: { h: 217, s: 91, l: 60 } },
  { hex: "#22c55e", role: "accent", areaShare: 5, usageRoles: ["accent"], hsl: { h: 142, s: 71, l: 45 } },
  { hex: "#FFFFFF", role: "foundation", areaShare: 1, usageRoles: ["background"] }
];

test("normalizeColorViewMode only allows organized and stack views", () => {
  assert.equal(normalizeColorViewMode("stack"), COLOR_VIEW_MODES.STACK);
  assert.equal(normalizeColorViewMode("roles"), COLOR_VIEW_MODES.ROLES);
  assert.equal(normalizeColorViewMode("palette"), COLOR_VIEW_MODES.ROLES);
  assert.equal(normalizeColorViewMode("nope"), COLOR_VIEW_MODES.ROLES);
  assert.equal(normalizeColorViewMode(null), COLOR_VIEW_MODES.ROLES);
});

test("flattenUniqueSwatches drops duplicate hexes and keeps curated order", () => {
  const unique = flattenUniqueSwatches(SAMPLE);
  assert.equal(unique.length, 4);
  assert.equal(unique[0].hex, "#ffffff");
  assert.equal(unique[1].hex, "#111111");
  assert.equal(unique[2].hex, "#3b82f6");
  assert.equal(unique[3].hex, "#22c55e");
});

test("buildStackLayout sorts as a hue progression then neutral ramp", () => {
  const layout = buildStackLayout([
    { hex: "#3b82f6", hsl: { h: 217, s: 91, l: 60 } }, // blue
    { hex: "#ef4444", hsl: { h: 0, s: 84, l: 60 } }, // red
    { hex: "#22c55e", hsl: { h: 142, s: 71, l: 45 } }, // green
    { hex: "#a855f7", hsl: { h: 271, s: 91, l: 65 } }, // purple
    { hex: "#93c5fd", hsl: { h: 213, s: 97, l: 79 } }, // light blue — same family, before darker blue
    { hex: "#1e3a8a", hsl: { h: 224, s: 64, l: 33 } }, // dark blue — same family, after
    { hex: "#ffffff", hsl: { h: 0, s: 0, l: 100 } },
    { hex: "#111111", hsl: { h: 0, s: 0, l: 7 } },
    { hex: "#0f1419", hsl: { h: 210, s: 25, l: 8 } }, // near-black — neutral ramp, not mid-spectrum
    { hex: "#dae0e6", hsl: { h: 210, s: 19, l: 88 } } // pale grey-blue — neutral ramp
  ]);
  assert.deepEqual(
    layout.map((item) => item.swatch.hex),
    [
      "#ef4444",
      "#22c55e",
      "#93c5fd",
      "#3b82f6",
      "#1e3a8a",
      "#a855f7",
      "#ffffff",
      "#dae0e6",
      "#0f1419",
      "#111111"
    ]
  );
});

test("sortSwatchesByColorWheel places neutrals after the chromatic spectrum", () => {
  const sorted = sortSwatchesByColorWheel(flattenUniqueSwatches(SAMPLE));
  assert.deepEqual(
    sorted.map((s) => s.hex.toLowerCase()),
    ["#22c55e", "#3b82f6", "#ffffff", "#111111"]
  );
});

test("view switching helpers do not require re-extraction data", () => {
  const stack = buildStackLayout(SAMPLE);
  const unique = flattenUniqueSwatches(SAMPLE);
  assert.equal(stack.length, unique.length);
});
