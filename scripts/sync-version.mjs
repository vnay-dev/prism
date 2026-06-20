#!/usr/bin/env node
// Sets the extension version in manifest.json and package.json so they stay in sync.
//
// Usage:
//   node scripts/sync-version.mjs 0.3.0     # set an explicit version
//   node scripts/sync-version.mjs patch     # bump patch  (0.2.1 -> 0.2.2)
//   node scripts/sync-version.mjs minor     # bump minor  (0.2.1 -> 0.3.0)
//   node scripts/sync-version.mjs major     # bump major  (0.2.1 -> 1.0.0)
//   node scripts/sync-version.mjs --print   # print current version and exit

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "manifest.json");
const PACKAGE = join(ROOT, "package.json");
const README = join(ROOT, "README.md");

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

function parseSemver(version) {
  const match = SEMVER.exec(version);
  if (!match) throw new Error(`"${version}" is not a 3-part semver (X.Y.Z)`);
  return match.slice(1, 4).map(Number);
}

function bump([major, minor, patch], kind) {
  switch (kind) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`unknown bump kind: ${kind}`);
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

// Rewrites only the "version" value, preserving the rest of the file's formatting.
async function setVersionField(path, nextVersion) {
  const raw = await readFile(path, "utf8");
  const replaced = raw.replace(
    /("version"\s*:\s*")\d+\.\d+\.\d+(")/,
    `$1${nextVersion}$2`
  );
  if (replaced === raw) {
    throw new Error(`could not find a "version" field to update in ${path}`);
  }
  await writeFile(path, replaced);
}

// Syncs the version strings embedded in README.md (the "**Version:**" line and
// the dist/prism-X.Y.Z.zip references). Best-effort: warns instead of failing if
// the README format changes, so a missing pattern never blocks a bump.
async function syncReadme(nextVersion) {
  let raw;
  try {
    raw = await readFile(README, "utf8");
  } catch {
    return; // no README, nothing to do
  }

  let updated = raw
    .replace(/(\*\*Version:\*\*\s*)\d+\.\d+\.\d+/, `$1${nextVersion}`)
    .replace(/prism-\d+\.\d+\.\d+\.zip/g, `prism-${nextVersion}.zip`);

  if (updated === raw) {
    process.stderr.write(
      "sync-version: warning — no version strings found in README.md to update\n"
    );
    return;
  }
  await writeFile(README, updated);
}

async function main() {
  const arg = process.argv[2];
  const manifest = await readJson(MANIFEST);
  const current = manifest.version;

  if (!arg || arg === "--print") {
    process.stdout.write(`${current}\n`);
    return;
  }

  const nextVersion = ["major", "minor", "patch"].includes(arg)
    ? bump(parseSemver(current), arg)
    : (parseSemver(arg), arg); // validate explicit version, then use it

  if (nextVersion === current) {
    throw new Error(`version is already ${current}; nothing to do`);
  }

  await setVersionField(MANIFEST, nextVersion);
  await setVersionField(PACKAGE, nextVersion);
  await syncReadme(nextVersion);

  process.stdout.write(`${current} -> ${nextVersion}\n`);
}

main().catch((err) => {
  process.stderr.write(`sync-version: ${err.message}\n`);
  process.exit(1);
});
