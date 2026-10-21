/**
 * Dependency vulnerability gate.
 *
 * Current Prism state: no package.json dependency fields and no lockfile.
 * Policy:
 * - Zero declared dependencies + no lockfile → pass (nothing to audit).
 * - Any declared dependency without package-lock.json → fail (require a lockfile).
 * - package-lock.json present → npm ci + npm audit, fail on high/critical.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const packageJsonPath = join(root, "package.json");
const lockfilePath = join(root, "package-lock.json");

/** npm audit --audit-level: fails for this severity and above. */
const AUDIT_LEVEL = "high";

function fail(message) {
  console.error(`check-dependency-security: ${message}`);
  process.exit(1);
}

function collectDeclaredDeps(pkg) {
  const sections = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies"
  ];
  const names = new Set();
  for (const section of sections) {
    const block = pkg[section];
    if (!block || typeof block !== "object") continue;
    for (const name of Object.keys(block)) names.add(name);
  }
  return [...names].sort();
}

function runNpm(args) {
  const result = spawnSync("npm", args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      // prepare installs local git hooks; skip in CI/audit installs.
      npm_config_ignore_scripts: "true"
    }
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status ?? 1;
}

const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const declared = collectDeclaredDeps(pkg);
const hasLockfile = existsSync(lockfilePath);

console.log(
  `check-dependency-security: declared dependencies=${declared.length || 0}` +
    (declared.length ? ` (${declared.join(", ")})` : "") +
    `; lockfile=${hasLockfile ? "yes" : "no"}; audit-level=${AUDIT_LEVEL}`
);

if (declared.length === 0 && !hasLockfile) {
  console.log(
    "check-dependency-security: OK (no npm dependencies or lockfile; audit skipped)"
  );
  process.exit(0);
}

if (declared.length > 0 && !hasLockfile) {
  fail(
    "package.json declares dependencies but package-lock.json is missing. " +
      "Commit a lockfile and use npm ci so audits are reproducible."
  );
}

const ciStatus = runNpm(["ci"]);
if (ciStatus !== 0) {
  fail("npm ci failed; cannot audit a reproducible dependency tree");
}

const auditStatus = runNpm(["audit", `--audit-level=${AUDIT_LEVEL}`]);
if (auditStatus !== 0) {
  fail(
    `npm audit reported vulnerabilities at severity ${AUDIT_LEVEL} or higher. ` +
      "Upgrade or replace affected packages (moderate/low are non-blocking)."
  );
}

console.log(
  `check-dependency-security: OK (npm audit clean at ${AUDIT_LEVEL}+)`
);
