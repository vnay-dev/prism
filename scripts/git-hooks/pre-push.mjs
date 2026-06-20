#!/usr/bin/env node
// Pre-push safety net for the Prism extension.
//
// Blocks a push when the manifest.json "version" being pushed is identical to
// the version already on the remote. This forces a version bump (via the
// `bump-extension-version` skill / `scripts/sync-version.mjs`) before shipping.
//
// Git invokes this from the repo root and feeds ref updates on stdin, one per
// line: "<local ref> <local sha> <remote ref> <remote sha>".
//
// Escape hatches (for docs-only / non-shipping pushes):
//   SKIP_VERSION_CHECK=1 git push
//   ...or put [skip-bump] in the tip commit's message.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ZERO = "0".repeat(40);

// Git feeds ref updates on stdin (fd 0). Read it synchronously.
function stdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function versionAt(sha) {
  if (!sha || sha === ZERO) return null;
  try {
    const raw = execFileSync("git", ["show", `${sha}:manifest.json`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(raw).version ?? null;
  } catch {
    return null; // manifest missing at that ref -> nothing to compare
  }
}

function tipMessage(sha) {
  if (!sha || sha === ZERO) return "";
  try {
    return execFileSync("git", ["log", "-1", "--format=%B", sha], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

function fail(message) {
  process.stderr.write(`\n\x1b[31m✗ push blocked\x1b[0m  ${message}\n\n`);
  process.exit(1);
}

function main() {
  if (process.env.SKIP_VERSION_CHECK) process.exit(0);

  const lines = stdin().split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) process.exit(0);

  for (const line of lines) {
    const [, localSha, , remoteSha] = line.split(/\s+/);

    if (!localSha || localSha === ZERO) continue; // branch deletion
    if (!remoteSha || remoteSha === ZERO) continue; // first push of this branch

    if (/\[skip-bump\]/i.test(tipMessage(localSha))) continue;

    const local = versionAt(localSha);
    const remote = versionAt(remoteSha);

    if (local == null || remote == null) continue; // can't compare safely
    if (local !== remote) continue; // version changed -> good to go

    fail(
      `manifest.json is still at v${local} \u2014 same as the remote.\n` +
        `  Bump it first: run the "bump-extension-version" skill, or\n` +
        `    node scripts/sync-version.mjs patch|minor|major\n` +
        `  Docs-only push? Use: SKIP_VERSION_CHECK=1 git push  (or [skip-bump] in the commit message)`
    );
  }

  process.exit(0);
}

main();
