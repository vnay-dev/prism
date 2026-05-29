import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  BENCHMARK_SITES,
  compareBenchmarkToLockfile,
  formatBenchmarkReport,
  runBenchmark
} from "../benchmark/benchmark-lib.mjs";

const LOCKFILE_PATH = new URL("../benchmark/lockfile.json", import.meta.url);
const EXTRACTIONS_DIR = new URL("../scripts/benchmark-extractions/", import.meta.url);

function loadLockfile() {
  assert.ok(existsSync(LOCKFILE_PATH), "benchmark/lockfile.json is missing — run npm run benchmark:lock");
  return JSON.parse(readFileSync(LOCKFILE_PATH, "utf8"));
}

test("benchmark lockfile covers all 9 reference sites", () => {
  const lockfile = loadLockfile();
  assert.equal(lockfile.sites.length, 9);
  for (const { slug } of BENCHMARK_SITES) {
    assert.ok(lockfile.sites.some((s) => s.slug === slug), `lockfile missing ${slug}`);
  }
});

test("benchmark extractions exist for all reference sites", () => {
  for (const { slug } of BENCHMARK_SITES) {
    const path = new URL(`${slug}.json`, EXTRACTIONS_DIR);
    assert.ok(existsSync(path), `missing extraction scripts/benchmark-extractions/${slug}.json`);
  }
});

test("palette extraction matches frozen benchmark lockfile", () => {
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
      assert.equal(comparison.paletteChanged, false, `${comparison.name} palette drifted without score change`);
      assert.equal(comparison.current.foundation, comparison.baseline.foundation);
      assert.equal(comparison.current.primary, comparison.baseline.primary);
      assert.deepEqual(comparison.current.secondaries, comparison.baseline.secondaries);
      assert.deepEqual(comparison.current.palette, comparison.baseline.palette);
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
  assert.equal(all.length, 9);
  assert.ok(Array.isArray(result.summary.improved));
  assert.ok(Array.isArray(result.summary.unchanged));
  assert.ok(Array.isArray(result.summary.regressed));
});
