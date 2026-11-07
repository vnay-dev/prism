import test from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_SOURCES,
  UTILITY_SOURCES,
  classifyClusterUtility,
  computeWeightedUtilityRatio,
  isDemoSource,
  isUtilityColor,
  isUtilitySource,
  weightForSource
} from "../src/core/sourceClassification.js";

test("demo_illustration is demo-only — not in UTILITY_SOURCES", () => {
  assert.equal(isDemoSource("demo_illustration"), true);
  assert.equal(isUtilitySource("demo_illustration"), false);
  assert.equal(UTILITY_SOURCES.has("demo_illustration"), false);
  assert.equal(DEMO_SOURCES.has("demo_illustration"), true);
});

test("weighted utilityRatio ignores demo_illustration but occurrence rule counts it", () => {
  const demoOnly = { demo_illustration: 10 };
  const ratio = computeWeightedUtilityRatio(demoOnly);
  assert.equal(ratio, 0, "demo_illustration must not inflate weighted utilityRatio");
  assert.equal(
    isUtilityColor(demoOnly, ratio),
    true,
    "demo_illustration alone must still trip the 60% occurrence rule"
  );
});

test("weighted utilityRatio uses UTILITY_SOURCES membership only", () => {
  // Mix brand surface with demo_illustration — ratio stays low; occurrence may still fire.
  const mixed = {
    global_background: 4,
    demo_illustration: 6
  };
  const ratio = computeWeightedUtilityRatio(mixed);
  assert.ok(ratio < 0.55, `expected ratio below 0.55, got ${ratio}`);
  // Occurrence: demo_illustration 6/10 = 60% → utility via occurrence
  assert.equal(isUtilityColor(mixed, ratio), true);

  // Pure status utility should push ratio high without needing demo.
  // status_chip weight 1 vs global_background weight 8 → need enough chips.
  const statusHeavy = { status_chip: 20, global_background: 1 };
  const statusRatio = computeWeightedUtilityRatio(statusHeavy);
  assert.ok(statusRatio >= 0.55, `expected status-heavy ratio ≥ 0.55, got ${statusRatio}`);
  assert.equal(isUtilityColor(statusHeavy, statusRatio), true);
});

test("demo_navigation in UTILITY_SOURCES does contribute to weighted ratio (current sets)", () => {
  // Documents current set membership — not a product expansion.
  assert.equal(isUtilitySource("demo_navigation"), true);
  const counts = { demo_navigation: 5 };
  const ratio = computeWeightedUtilityRatio(counts);
  assert.equal(ratio, 1);
  assert.equal(
    ratio,
    (5 * weightForSource("demo_navigation")) / (5 * weightForSource("demo_navigation"))
  );
});

test("brand evidence override still blocks utility classification", () => {
  const cluster = {
    sourceCounts: { demo_illustration: 20 },
    utilityRatio: computeWeightedUtilityRatio({ demo_illustration: 20 }),
    hasHero: true,
    hasNav: false,
    sectionIds: new Set(["section-0"])
  };
  assert.equal(classifyClusterUtility(cluster, 4), false);
});
