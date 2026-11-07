---
name: pr-review
description: >-
  Spec-driven review of GitHub pull requests for the Prism Chrome extension
  using the GitHub CLI (`gh`), covering spec compliance, correctness,
  security, and performance. Writes `.pr-review/report.md` and a chat summary.
  Use when the user provides a GitHub PR URL, asks to review a pull request,
  or says "PR review" / "review this PR" for this repository.
---

# PR Review

Review a GitHub pull request for this repository. Accept a **GitHub PR URL**
(or `owner/repo#number` / PR number if the remote is unambiguous).

Write a detailed Markdown report to **`.pr-review/report.md`**, and print a
**concise summary plus the report path** in Cursor chat.

## Hard constraints

- Do **not** modify application code, change the PR branch, post GitHub
  comments, push commits, or commit the review report.
- **Exception:** creating/updating `.pr-review/report.md` (and ensuring
  `.pr-review/` exists and is gitignored) is the only intended write during
  review. The skill is otherwise read-only.
- Do **not** invent requirements. Only cite specs that exist in docs, ADRs,
  tests, or code comments.
- Do **not** claim a check passed unless you actually ran it in this session.
- Do **not** regenerate `benchmark/lockfile.json` or other baselines during
  review. Do **not** automatically fix findings.
- Do **not** execute untrusted scripts or commands introduced by the PR without
  assessing their safety first. Prefer `gh` and existing repo tooling
  (`npm test`, `npm run security:*`, etc.).
- If `gh` auth/access fails, required context is missing, or a check cannot run,
  state the limitation and continue with what you can verify — do not guess.
- Prefer confirmed defects over speculative advice. Skip stylistic nitpicks,
  duplicates, generic warnings, and low-value suggestions.

## Review dimensions

Every review must explicitly cover these four dimensions:

1. **Spec compliance** — Does the implementation match documented requirements
   and invariants?
2. **Correctness and regressions** — Are there functional defects or risks to
   existing behaviour?
3. **Security** — Could the change expose users or the extension to attack?
4. **Performance and maintainability** — Does it introduce meaningful
   efficiency, reliability, or structural problems?

Retain Prism-specific scrutiny for colour extraction, colour attribution,
palette ranking, SVG handling, and cross-site regression risk (see §5).

## Workflow

Copy this checklist and track progress:

```
- [ ] 1. Resolve PR + fetch metadata
- [ ] 2. Fetch diff and changed files
- [ ] 3. Load relevant specs (docs / comments / tests)
- [ ] 4. Spec compliance review
- [ ] 5. Correctness + Prism focus areas
- [ ] 6. Explicit security review
- [ ] 7. Explicit performance review
- [ ] 8. Run practical checks
- [ ] 9. Validate findings against code
- [ ] 10. Write `.pr-review/report.md` + chat summary
```

### 1. Resolve PR + fetch metadata

Require a PR URL when ambiguous. Then:

```bash
gh pr view <PR_URL> --json number,title,body,author,baseRefName,headRefName,files,commits,additions,deletions,changedFiles,url,state,isDraft
```

Record title, author, base/head branches, draft/state, and intent from the PR
body. If `gh` fails, stop the GitHub-dependent path and explain how to fix
access (auth, network, wrong repo) rather than inventing the diff.

### 2. Fetch diff and changed files

```bash
gh pr diff <PR_URL>
gh pr view <PR_URL> --json files --jq '.files[].path'
```

For large diffs, prioritize algorithmic / security-sensitive paths first
(`src/core/**`, `src/content/**`, `benchmark/**`, `manifest.json`,
`.github/**`, `tests/**`). Skim generated/vendored noise (`dist/`, lockfiles)
unless the PR intentionally changes packaging.

Read the full patch for every file you will comment on. Do not review from
filenames alone.

### 3. Load relevant specs

Only load what the changed files touch. Typical sources in this repo:

| Source | Use when the PR touches… |
|--------|---------------------------|
| `ARCHITECTURE.md` | Extraction, scoring, roles, safeguards, assets/SVG, data flow |
| `README.md` / `PRIVACY.md` | User-facing behavior, permissions, data access |
| `RELEASE_NOTES.md` | Claimed user-visible changes |
| `benchmark/README.md` + `benchmark/lockfile.json` | Palette regression / intentional baseline updates |
| `.github/SECURITY_GATES.md` | Permissions, CI gates, security scripts |
| Adjacent tests under `tests/` | Expected contracts for the changed module |
| In-code comments / JSDoc near the hunk | Local invariants the author documented |

Discover other docs with `git ls-files "*.md"` when needed. **Do not invent
requirements** that are not in these sources or in the PR description’s
explicit acceptance criteria.

### 4. Spec compliance

For each meaningful change, ask:

1. What documented behavior / invariant does this touch?
2. Does the patch preserve, intentionally change, or contradict that spec?
3. If the PR claims a behavior change, are docs/tests/benchmarks updated
   consistently?

Flag **spec mismatches** only when you can point to the specific doc section,
comment, or test that conflicts. If the docs are silent, say so and continue
with other dimensions — do not fabricate a “requirement.”

Missing or weak **test coverage** is not automatically a confirmed functional
defect. Record coverage gaps under residual risks or as a separate
`potential` / maintainability note when justified; reserve `confirmed`
correctness findings for evidenced behavioural bugs.

### 5. Correctness, regressions, and Prism focus

Review for functional defects and regression risk. For this repository,
scrutinize especially:

| Focus | What to verify |
|-------|----------------|
| **Website colour extraction** | Sampling, area measurement, source/zone classification, demo vs brand evidence, virtual section scan bounds |
| **Colour attribution** | Semantic roles (`assignRoles`), usage labels (`usageRoles`), safeguards (`paletteSafeguards`), foundation/link exclusions |
| **Palette ranking** | Clustering/scoring (`scoreAndCluster`), 8-color curation, quality adjust, utility/accent handling |
| **SVG handling** | SVG fill/stroke area caps, inline SVG normalization (`inlineSvg`), icon curation vs decorative inflation |
| **Cross-site regression** | Behavior that may help one site but break Linear/Stripe/Spotify/Vercel/Notion/Framer/Apple/Netflix/Slack (or general pages); lockfile churn without justification |

Also watch popup/controller race/dedupe and packaging path breakage when those
areas change.

### 6. Explicit security review

Assess applicable risks from the diff. Only flag issues with code evidence or a
clearly explained, credible risk — no generic “consider hardening” noise.

Check when relevant:

- **Manifest V3 permissions** — unnecessary expansion; allowlist drift vs
  `.github/security/approved-permissions.json` / `SECURITY_GATES.md`
- **Content-script isolation** — unsafe DOM manipulation, XSS, unsafe HTML
  (`innerHTML`, `insertAdjacentHTML`, `document.write`, untrusted SVG/HTML
  injection)
- **Message passing** — popup ↔ content script ↔ service worker validation,
  trust boundaries, spoofable senders, over-broad handlers
- **Untrusted website content** — URL handling, open redirects, path/URL
  injection, input sanitization before use in DOM, downloads, or messaging
- **Secrets / sensitive data** — hardcoded secrets, logging PII, clipboard and
  download surfaces exposing more than the user requested
- **Dependencies** — new/changed packages, lockfile gaps, known vulnerable or
  unsafe third-party code
- **Storage / privacy** — insecure storage, accidental network transmission,
  retention or permission claims that conflict with `PRIVACY.md`

Run existing security checks when relevant and practical (see §8).

### 7. Explicit performance review

Assess applicable performance and maintainability risks. Distinguish
**demonstrated** defects (clear hot-path waste, unbounded work, missing
cleanup with code evidence) from **potential** risks. Do not make unsupported
claims without measurements or concrete code evidence.

Check when relevant:

- Expensive DOM traversal and repeated `getComputedStyle` calls
- Forced synchronous layouts, unnecessary reflows, repeated geometry reads
- Memory leaks, retained DOM references, missing event-listener / observer
  cleanup
- Large pages, SVG-heavy pages, and dynamic/SPA content interacting with scan
  budgets (`maxCandidates`, `maxMillis`, per-category caps)
- Duplicate processing, unnecessary background work, and race conditions
- Bundle size, extension startup cost, and popup responsiveness

### 8. Run practical checks

Run existing checks when they are relevant and practical. Prefer the repo’s
own scripts:

```bash
npm test
# or narrower, when only one area changed:
npm run test:benchmark
node --test tests/<relevant>.test.js

npm run security:permissions   # if manifest / permissions changed
npm run security:deps          # if dependencies changed
npm run package:store          # if packaging / manifest / icons paths changed
```

Rules:

- Match checks to the diff; skip irrelevant heavy gates with an explicit
  **not run** reason.
- If a command fails to start (missing deps, no network), report the
  limitation — do not imply it passed.
- Never regenerate `benchmark/lockfile.json` during review; only observe
  whether a PR lockfile update looks intentional and documented.
- Before running any script added or modified by the PR, assess whether it is
  safe (side effects, network, filesystem, secrets). Prefer already-trusted
  repo scripts on the base tooling when unsure.

### 9. Validate findings

Every finding must be checked against the actual code (and tests/docs as
needed). Drop anything you cannot defend.

For each kept finding include:

- **Severity:** `blocker` | `high` | `medium` | `low`
- **Status:** `confirmed` (clear defect/mismatch) or `potential` (plausible
  risk with incomplete proof)
- **Dimension:** `spec` | `correctness` | `security` | `performance`
- **Location:** `path/to/file.ext:line` (small range only when needed)
- **Evidence:** what the diff/code/spec shows
- **Impact:** user-facing or system consequence
- **Suggested fix:** concrete and minimal

Discard: duplicates, pure style nits, “consider rewriting,” generic security
or performance boilerplate, and speculative architecture essays unrelated to
the PR.

If there are **no issues**, say so clearly, and still document important
untested areas and limitations.

### 10. Write report file + chat summary

#### Ensure gitignore

If `.pr-review/` is not already ignored, append it to `.gitignore` without
disturbing existing entries (add a short section such as `# PR review output`
then `.pr-review/`). Do not reorder or rewrite unrelated ignore rules.

#### Write the report

Create `.pr-review/` if needed. **Overwrite** `.pr-review/report.md` on every
review. Use this shape:

```markdown
# PR review: <number> — <title>

**PR:** <url>
**Author:** <author> · **Base:** `<base>` ← `<head>`
**Scope:** <N files, +add/−del> · **Draft:** <yes/no>

## Summary
<2–4 sentences: what the PR does and overall merge readiness>

## Review dimensions
| Dimension | Verdict |
|-----------|---------|
| Spec compliance | <aligned / gaps / intentional change / N/A> |
| Correctness & regressions | <…> |
| Security | <…> |
| Performance & maintainability | <…> |

## Spec coverage
- <spec source>: <aligned | gap | intentional change | not applicable>
- …

## Findings
### blocker / high / medium / low
1. **<title>** — `confirmed`|`potential` · `<dimension>`
   - **Where:** `file:line`
   - **Evidence:** …
   - **Impact:** …
   - **Fix:** …

(If none: “No confirmed issues found.” List potentials separately if any.)

## Security review
<Applicable risks assessed; findings or “no evidenced security issues.”>

## Performance review
<Applicable risks assessed; demonstrated vs potential; or “no evidenced
performance issues.”>

## Checks run
| Check | Result |
|-------|--------|
| `npm test` | pass / fail / not run (<reason>) |
| `npm run security:permissions` | pass / fail / not run (<reason>) |
| … | … |

## Residual risks / limitations
- <missing context, unrun checks, coverage gaps, manual site verification>
```

Keep the report concise. Lead with blockers/high.

#### Chat output

In Cursor chat, print only:

1. A short merge-readiness verdict
2. Counts by severity (and note if zero findings)
3. The top blocker/high items in one line each (if any)
4. The report path: `.pr-review/report.md`

Do not dump the full report into chat.

## Notes

- Follow existing repository conventions visible in the touched code; do not
  demand new abstractions or drive-by refactors.
- Manual verification on live sites may still be needed for extraction PRs;
  call that out under residual risks when benchmarks cannot fully cover the
  change.
- Aside from `.pr-review/report.md` and a possible `.gitignore` addition for
  `.pr-review/`, do not write files as part of this skill.
