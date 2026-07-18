/**
 * Generate or update benchmark/lockfile.json from current extractions + algorithm.
 * Usage: node benchmark/generate-lockfile.mjs
 *        (or: npm run benchmark:lock)
 */
import { writeFileSync } from "fs";
import {
  BENCHMARK_SITES,
  BENCHMARK_VERSION,
  runBenchmark
} from "./benchmark-lib.mjs";

const EXTRACTIONS_DIR = new URL("./extractions/", import.meta.url);
const LOCKFILE_PATH = new URL("./lockfile.json", import.meta.url);

const sites = runBenchmark(EXTRACTIONS_DIR);
const avgBrand = sites.reduce((s, x) => s + x.scores.brandAccuracy, 0) / sites.length;
const avgUseful = sites.reduce((s, x) => s + x.scores.designerUsefulness, 0) / sites.length;

const lockfile = {
  version: BENCHMARK_VERSION,
  frozenAt: new Date().toISOString(),
  description:
    "Frozen palette extraction baseline. Regenerate only when intentionally accepting benchmark changes.",
  extractionsSource: "benchmark/extractions/",
  sites,
  averages: {
    brandAccuracy: +avgBrand.toFixed(1),
    designerUsefulness: +avgUseful.toFixed(1)
  },
  siteSlugs: BENCHMARK_SITES.map((s) => s.slug)
};

writeFileSync(LOCKFILE_PATH, JSON.stringify(lockfile, null, 2));
console.log(`Wrote ${LOCKFILE_PATH.pathname || LOCKFILE_PATH}`);
console.log(`Sites: ${sites.length}`);
console.log(`Avg brand: ${lockfile.averages.brandAccuracy}/10`);
console.log(`Avg usefulness: ${lockfile.averages.designerUsefulness}/10`);
