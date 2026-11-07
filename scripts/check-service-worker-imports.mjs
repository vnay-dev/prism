/**
 * Resolve static relative imports from the MV3 service-worker entry and assert
 * every target exists under a package root (repo root, staging dir, or ZIP listing).
 *
 * Usage:
 *   node scripts/check-service-worker-imports.mjs
 *   node scripts/check-service-worker-imports.mjs --root dist/store
 *   node scripts/check-service-worker-imports.mjs --zip dist/prism-X.Y.Z.zip
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const STATIC_IMPORT_RE =
  /(?:^|[;\s({])import\s*(?:[\s\S]*?\sfrom\s*)?["'](\.[^"']+)["']/gm;

/**
 * @param {string} fromFileAbs
 * @param {string} specifier
 * @returns {string} absolute path
 */
export function resolveRelativeImport(fromFileAbs, specifier) {
  return normalize(join(dirname(fromFileAbs), specifier));
}

/**
 * Collect static relative import graph starting at entryAbs within packageRoot.
 * @param {string} packageRoot
 * @param {string} entryRel posix-or-native relative path from package root
 * @returns {{ files: string[], missing: string[] }}
 */
export function collectServiceWorkerImportGraph(packageRoot, entryRel) {
  const entryNorm = entryRel.split(/[/\\]/).join(sep);
  const missing = [];
  const files = [];
  const visited = new Set();
  const queue = [entryNorm];

  while (queue.length) {
    const rel = queue.shift();
    const key = rel.split(/[/\\]/).join("/");
    if (visited.has(key)) continue;
    visited.add(key);

    const abs = join(packageRoot, rel);
    if (!existsSync(abs)) {
      missing.push(key);
      continue;
    }
    files.push(key);

    const source = readFileSync(abs, "utf8");
    STATIC_IMPORT_RE.lastIndex = 0;
    let match;
    while ((match = STATIC_IMPORT_RE.exec(source))) {
      const specifier = match[1];
      const targetAbs = resolveRelativeImport(abs, specifier);
      const targetRel = relative(packageRoot, targetAbs);
      if (targetRel.startsWith("..")) {
        missing.push(`${key} -> ${specifier} (escapes package root)`);
        continue;
      }
      queue.push(targetRel);
    }
  }

  return { files, missing };
}

/**
 * @param {string} packageRoot
 * @param {{ manifestPath?: string }} [options]
 */
export function assertServiceWorkerImportsInRoot(packageRoot, options = {}) {
  const manifestPath = options.manifestPath || join(packageRoot, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`check-service-worker-imports: missing manifest at ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const entryRel = manifest?.background?.service_worker;
  if (!entryRel || typeof entryRel !== "string") {
    throw new Error("check-service-worker-imports: manifest.background.service_worker missing");
  }
  if (manifest?.background?.type === "module") {
    /* expected for relative imports */
  }

  const { files, missing } = collectServiceWorkerImportGraph(packageRoot, entryRel);
  if (missing.length) {
    throw new Error(
      `check-service-worker-imports: unresolved service-worker import(s):\n  - ${missing.join("\n  - ")}`
    );
  }
  if (!files.some((f) => f.replace(/\\/g, "/").endsWith("messageHandler.js"))) {
    throw new Error(
      "check-service-worker-imports: expected messageHandler.js in the service-worker import graph"
    );
  }
  return { entryRel, files };
}

/**
 * List paths inside a zip (forward slashes). Uses `tar -tf` (available on Win10+).
 * @param {string} zipPath
 * @returns {string[]}
 */
export function listZipEntries(zipPath) {
  if (!existsSync(zipPath)) {
    throw new Error(`check-service-worker-imports: zip not found: ${zipPath}`);
  }
  const result = spawnSync("tar", ["-tf", zipPath], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `check-service-worker-imports: tar -tf failed for ${zipPath}: ${result.stderr || result.error}`
    );
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\\/g, "/").replace(/^\.\//, ""))
    .filter(Boolean);
}

/**
 * Ensure every file in the SW import graph (from repo or staging root) appears in the zip.
 * @param {string} sourceRoot root used to resolve the graph (usually staging)
 * @param {string} zipPath
 */
export function assertServiceWorkerImportsInZip(sourceRoot, zipPath) {
  const { entryRel, files } = assertServiceWorkerImportsInRoot(sourceRoot);
  const entries = new Set(listZipEntries(zipPath));
  const missing = files
    .map((f) => f.replace(/\\/g, "/"))
    .filter((f) => !entries.has(f));
  if (!entries.has("manifest.json") && !entries.has("./manifest.json")) {
    // Compress-Archive may nest differently; accept either
  }
  if (missing.length) {
    throw new Error(
      `check-service-worker-imports: zip ${zipPath} missing service-worker modules:\n  - ${missing.join("\n  - ")}\nentry: ${entryRel}`
    );
  }
  return { entryRel, files, zipPath };
}

function parseArgs(argv) {
  const args = { root: repoRoot, zip: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root" && argv[i + 1]) {
      args.root = argv[++i];
    } else if (argv[i] === "--zip" && argv[i + 1]) {
      args.zip = argv[++i];
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = args.root.startsWith("/") || /^[A-Za-z]:/.test(args.root)
    ? args.root
    : join(repoRoot, args.root);

  try {
    if (args.zip) {
      const zipPath = args.zip.startsWith("/") || /^[A-Za-z]:/.test(args.zip)
        ? args.zip
        : join(repoRoot, args.zip);
      const result = assertServiceWorkerImportsInZip(root, zipPath);
      console.log(
        `check-service-worker-imports: OK (${result.files.length} modules in graph, zip verified)`
      );
      for (const f of result.files) console.log(`  - ${f.replace(/\\/g, "/")}`);
      return;
    }
    const result = assertServiceWorkerImportsInRoot(root);
    console.log(
      `check-service-worker-imports: OK (${result.files.length} modules from ${result.entryRel})`
    );
    for (const f of result.files) console.log(`  - ${f.replace(/\\/g, "/")}`);
  } catch (error) {
    console.error(error?.message || error);
    process.exit(1);
  }
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main();
}
