/**
 * Fail CI when manifest.json introduces unapproved Chrome extension capabilities.
 * Policy source: .github/security/approved-permissions.json
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const manifestPath = join(root, "manifest.json");
const policyPath = join(root, ".github", "security", "approved-permissions.json");

function fail(message) {
  console.error(`check-extension-permissions: ${message}`);
  process.exit(1);
}

function asStringArray(value, label) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) {
      fail(`${label} must contain only non-empty strings`);
    }
  }
  return value;
}

function sortedUnique(list) {
  return [...new Set(list)].sort();
}

function assertExactAllowlist(actual, approved, label) {
  const a = sortedUnique(actual);
  const b = sortedUnique(approved);
  const unexpected = a.filter((item) => !b.includes(item));
  const missing = b.filter((item) => !a.includes(item));

  if (unexpected.length) {
    fail(
      `unapproved ${label}: ${unexpected.join(", ")}. ` +
        `Add to .github/security/approved-permissions.json only after documenting the need ` +
        `(see .github/SECURITY_GATES.md).`
    );
  }

  if (missing.length) {
    fail(
      `manifest is missing approved ${label}: ${missing.join(", ")}. ` +
        `If removal is intentional, update .github/security/approved-permissions.json in the same change.`
    );
  }
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const policy = JSON.parse(readFileSync(policyPath, "utf8"));

if (manifest.manifest_version !== 3) {
  fail(`expected Manifest V3, found manifest_version=${manifest.manifest_version}`);
}

assertExactAllowlist(
  asStringArray(manifest.permissions, "permissions"),
  asStringArray(policy.permissions, "policy.permissions"),
  "permissions"
);

assertExactAllowlist(
  asStringArray(manifest.optional_permissions, "optional_permissions"),
  asStringArray(policy.optional_permissions, "policy.optional_permissions"),
  "optional_permissions"
);

assertExactAllowlist(
  asStringArray(manifest.host_permissions, "host_permissions"),
  asStringArray(policy.host_permissions, "policy.host_permissions"),
  "host_permissions"
);

assertExactAllowlist(
  asStringArray(manifest.optional_host_permissions, "optional_host_permissions"),
  asStringArray(policy.optional_host_permissions, "policy.optional_host_permissions"),
  "optional_host_permissions"
);

const warEntries = Array.isArray(manifest.web_accessible_resources)
  ? manifest.web_accessible_resources
  : [];
const warMatches = [];
for (const entry of warEntries) {
  if (!entry || typeof entry !== "object") {
    fail("web_accessible_resources entries must be objects");
  }
  warMatches.push(...asStringArray(entry.matches, "web_accessible_resources.matches"));
}

assertExactAllowlist(
  warMatches,
  asStringArray(policy.web_accessible_resources_matches, "policy.web_accessible_resources_matches"),
  "web_accessible_resources matches"
);

console.log("check-extension-permissions: OK (manifest matches approved allowlist)");
