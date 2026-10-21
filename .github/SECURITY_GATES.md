# Prism security quality gates

Blocking checks run on every push to `dev`/`main`, every PR targeting those branches, and `workflow_dispatch`, via [`.github/workflows/quality-gates.yml`](./workflows/quality-gates.yml).

## Gates overview

| Gate | Job | Blocks when | How to fix |
|------|-----|-------------|------------|
| Unit + benchmark tests | `quality` | Any test failure | Fix code or update fixtures; do **not** regenerate `benchmark/lockfile.json` unless the palette change is intentional (`npm run benchmark:lock`). |
| Store package build | `quality` | `npm run package:store` fails | Restore required `manifest.json` / `icons` / `src` paths. |
| Secret scanning (Gitleaks) | `security` | Confirmed secret in the git history or working tree | Remove the secret, rotate the credential, rewrite history if it was committed. Logs redact secret values (`--redact`). |
| Extension permissions allowlist | `security` | Manifest capabilities differ from the approved allowlist | See [Approving a new permission](#approving-a-new-permission). |
| Dependency audit | `security` | Declared deps without a lockfile, or `npm audit` findings at **high** or **critical** | Add `package-lock.json` when introducing deps; upgrade/replace vulnerable packages. Moderate/low do not fail CI. |
| Static analysis (Semgrep) | `sast` | Any **ERROR**-severity finding from `p/javascript` or `p/security-audit` | Fix the code, or narrow the pattern if the finding is incorrect (prefer fixing over ignoring). WARNING/INFO are not scanned for failure. |

All three jobs must pass for the workflow to succeed.

## Severity policies

### Semgrep
- **Fail:** findings with severity `ERROR`.
- **Do not fail:** `WARNING` / `INFO` (not included in the CI filter).
- **Configs:** `p/javascript`, `p/security-audit`.
- **Pinning:** Semgrep runs in the official image pinned by digest (`semgrep/semgrep@sha256:…`).

### npm audit
- **Fail:** `high` and `critical` (`npm audit --audit-level=high`).
- **Do not fail:** `moderate` / `low`.
- **No dependencies today:** with zero declared dependencies and no lockfile, the gate passes without inventing packages. When you add dependencies, commit `package-lock.json`; CI will run `npm ci` then audit.

### Secrets
- Any Gitleaks detection fails the job.
- Output uses `--redact` so secret material is not printed in full.

## Approving a new permission

Current Manifest V3 permissions are intentional and minimal:

| Capability | Why it is approved |
|------------|--------------------|
| `activeTab` | Access only the tab where the user invoked Prism |
| `scripting` | Inject a short-lived sampler on that tab |
| `clipboardWrite` | Copy palette PNG / font names on user action |
| `web_accessible_resources` → `<all_urls>` | Load the in-page panel iframe on sites the user visits (not ambient host access) |

Prism does **not** use `host_permissions`, `optional_permissions`, or `optional_host_permissions`.

To add a capability intentionally:

1. Justify it in the PR/commit message (Chrome Web Store reviewers will ask).
2. Update [`.github/security/approved-permissions.json`](./security/approved-permissions.json) in the **same** change as `manifest.json`.
3. Update [`PRIVACY.md`](../PRIVACY.md) if user-facing data access changes.
4. Run locally: `node scripts/security/check-extension-permissions.mjs`.

Removing an approved capability also requires updating the allowlist in the same change so CI stays consistent.

## Local commands

```bash
npm test
npm run package:store
node scripts/security/check-extension-permissions.mjs
node scripts/security/check-dependency-security.mjs
```

Secret scanning (optional local install of [Gitleaks](https://github.com/gitleaks/gitleaks)):

```bash
gitleaks detect --source . --verbose --redact --exit-code 1
```

Semgrep (same digest-pinned image CI uses):

```bash
docker run --rm -v "${PWD}:/src" -w /src \
  semgrep/semgrep@sha256:4a34048c04fef049f71665047f074cffb00cc3d89482f965a5cd151d589237af \
  semgrep scan --config=p/javascript --config=p/security-audit \
  --severity=ERROR --error --metrics=off \
  --exclude=node_modules --exclude=dist --exclude=.git
```

On Windows PowerShell, use `-v "${PWD}:/src"` with Docker Desktop running, or install Semgrep `1.182.0` locally and run the same `semgrep scan` arguments.

## Supply-chain notes

- Third-party Actions are pinned to full commit SHAs (`actions/checkout`, `actions/setup-node`).
- Gitleaks is installed from the official GitHub release tarball and verified with SHA-256 before use.
- Semgrep uses a digest-pinned container image (not a mutable `:latest` tag).
- Workflow permissions are `contents: read` only. No custom secrets are passed into jobs that run PR code.

## Manual GitHub settings (not enforced by this repo alone)

These improve protection but require clicking through GitHub’s UI:

1. **Branch protection / rulesets** on `dev` and `main`: require the `Quality Gates` workflow (all jobs) to pass before merge.
2. **Secret scanning** (GitHub Advanced Security / push protection) if available on the plan — complementary to Gitleaks in CI.
3. **Code scanning alerts** (optional): uploading Semgrep/CodeQL SARIF needs `security-events: write` and is **not** configured here so fork PRs stay read-only; CI already fails on ERROR findings without uploading.
