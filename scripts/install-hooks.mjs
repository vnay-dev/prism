#!/usr/bin/env node
// Installs the project git hooks into .git/hooks.
// Run once per clone:  node scripts/install-hooks.mjs
//
// .git/hooks is not version-controlled, so this copies a thin shim that
// delegates to the tracked logic in scripts/git-hooks/.

import { writeFileSync, chmodSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

function gitDir() {
  return execFileSync("git", ["rev-parse", "--git-path", "hooks"], {
    encoding: "utf8",
  }).trim();
}

const shim = `#!/bin/sh
# Installed shim -> delegates to the version-controlled hook logic.
# Source: scripts/git-hooks/pre-push.mjs   (regenerate via scripts/install-hooks.mjs)
exec node scripts/git-hooks/pre-push.mjs "$@"
`;

const hooksDir = gitDir();
if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });

const target = join(hooksDir, "pre-push");
writeFileSync(target, shim);
chmodSync(target, 0o755);

process.stdout.write(`installed pre-push hook -> ${target}\n`);
