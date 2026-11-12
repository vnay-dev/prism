import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  BENCHMARK_SITES,
  assertNoPlaceholderFonts,
  compareBenchmarkToLockfile,
  fontFamilies,
  formatBenchmarkReport,
  runBenchmark
} from "../benchmark/benchmark-lib.mjs";

const LOCKFILE_PATH = new URL("../benchmark/lockfile.json", import.meta.url);
const EXTRACTIONS_DIR = new URL("../benchmark/extractions/", import.meta.url);
const SITE_COUNT = BENCHMARK_SITES.length;

function loadLockfile() {
  assert.ok(existsSync(LOCKFILE_PATH), "benchmark/lockfile.json is missing — run npm run benchmark:lock");
  return JSON.parse(readFileSync(LOCKFILE_PATH, "utf8"));
}

test(`benchmark lockfile covers all ${SITE_COUNT} reference sites`, () => {
  const lockfile = loadLockfile();
  assert.equal(lockfile.sites.length, SITE_COUNT);
  for (const { slug } of BENCHMARK_SITES) {
    assert.ok(lockfile.sites.some((s) => s.slug === slug), `lockfile missing ${slug}`);
  }
});

test("benchmark extractions exist for all reference sites", () => {
  for (const { slug } of BENCHMARK_SITES) {
    const path = new URL(`${slug}.json`, EXTRACTIONS_DIR);
    assert.ok(existsSync(path), `missing extraction benchmark/extractions/${slug}.json`);
  }
});

test("palette and font extraction matches frozen benchmark lockfile", () => {
  const lockfile = loadLockfile();
  const current = runBenchmark(EXTRACTIONS_DIR);
  const result = compareBenchmarkToLockfile(current, lockfile);

  console.log("\n" + formatBenchmarkReport(result) + "\n");

  assert.deepEqual(
    result.summary.regressed,
    [],
    `Benchmark regressions detected: ${result.summary.regressed.join(", ") || "none"}\n${formatBenchmarkReport(result)}`
  );

  for (const comparison of result.comparisons) {
    if (comparison.status === "unchanged") {
      assert.equal(
        comparison.paletteChanged,
        false,
        `${comparison.name} palette drifted without score change`
      );
      assert.equal(
        comparison.fontsChanged,
        false,
        `${comparison.name} fonts drifted without score change`
      );
      assert.equal(comparison.current.foundation, comparison.baseline.foundation);
      assert.equal(comparison.current.primary, comparison.baseline.primary);
      assert.deepEqual(comparison.current.secondaries, comparison.baseline.secondaries);
      assert.deepEqual(comparison.current.palette, comparison.baseline.palette);
      assert.deepEqual(comparison.current.fonts || [], comparison.baseline.fonts || []);
    }
  }
});

test("benchmark reports improved unchanged regressed summary", () => {
  const lockfile = loadLockfile();
  const current = runBenchmark(EXTRACTIONS_DIR);
  const result = compareBenchmarkToLockfile(current, lockfile);

  const all = [
    ...result.summary.improved,
    ...result.summary.unchanged,
    ...result.summary.regressed
  ];
  assert.equal(all.length, SITE_COUNT);
  assert.ok(Array.isArray(result.summary.improved));
  assert.ok(Array.isArray(result.summary.unchanged));
  assert.ok(Array.isArray(result.summary.regressed));
});

test("QA sites keep expected curated fonts (no metric placeholders)", () => {
  const current = runBenchmark(EXTRACTIONS_DIR);
  const bySlug = new Map(current.map((site) => [site.slug, site]));

  const offenders = assertNoPlaceholderFonts(current);
  assert.deepEqual(offenders, [], `placeholder fonts leaked: ${offenders.join(", ")}`);

  const apple = bySlug.get("apple");
  assert.ok(apple?.hasFonts, "apple should curate fonts");
  assert.ok(fontFamilies(apple).includes("sf pro text"));
  assert.ok(!fontFamilies(apple).includes("helvetica neue"));

  const toonify = bySlug.get("toonify");
  assert.ok(toonify?.hasFonts, "toonify should curate fonts");
  assert.ok(fontFamilies(toonify).includes("fredoka"));
  assert.ok(fontFamilies(toonify).includes("nunito"));
  assert.ok(!fontFamilies(toonify).includes("fredoka fallback"));

  const adya = bySlug.get("adya-framer");
  assert.ok(adya?.hasFonts, "adya-framer should curate fonts");
  assert.ok(fontFamilies(adya).includes("inter"));
  assert.ok(fontFamilies(adya).includes("instrument serif"));
  assert.ok(fontFamilies(adya).includes("dm sans"));
  assert.ok(!fontFamilies(adya).includes("inter placeholder"));
});
