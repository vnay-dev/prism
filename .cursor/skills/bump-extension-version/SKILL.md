---
name: bump-extension-version
description: >-
  Analyze pending git changes for the Prism Chrome extension, decide the correct
  semantic version bump (major/minor/patch), and update manifest.json +
  package.json. Use before pushing, when preparing a release, when the user says
  "prep for push", "bump the version", "I'm about to push", or when a pre-push
  hook blocks a push because the version was not bumped.
---

# Bump Extension Version

Decide and apply the right version bump for the Prism extension based on what
actually changed, then commit it. This is the smart counterpart to the
`pre-push` git hook, which blocks pushes when `manifest.json` still matches the
remote version.

## Workflow

Copy this checklist and track progress:

```
- [ ] 1. Gather the changes
- [ ] 2. Classify impact (feature / fix / user-flow / breaking)
- [ ] 3. Ask clarifying questions if impact is ambiguous
- [ ] 4. Decide the bump (major / minor / patch)
- [ ] 5. Apply the version + add a RELEASE_NOTES.md entry
- [ ] 6. Update every other .md doc, but only where the change is relevant
- [ ] 7. Create the bump commit
- [ ] 8. Confirm, ready to push
```

### 1. Gather the changes

Look at everything not yet on the remote, not just the working tree:

```bash
git fetch origin --quiet
git --no-pager diff origin/main...HEAD --stat   # committed but unpushed
git --no-pager diff --stat                       # uncommitted (working tree)
git --no-pager log origin/main..HEAD --oneline   # unpushed commit messages
node scripts/sync-version.mjs --print            # current version
```

Then read the meaningful diffs (skip `dist/`, lockfiles, generated assets) to
understand them at a feature level — not just which lines changed, but which
**user flows** and **public behavior** of the extension are affected. This is a
designer-facing palette/font extraction extension, so weigh changes to the
popup UI, extraction logic, exported output, and permissions heavily.

### 2. Classify impact

Map the changes to a bump using semantic-versioning intent for a Chrome
extension:

| Bump | When | Examples for Prism |
|------|------|--------------------|
| **major** (X.0.0) | Breaking change to user-facing behavior, removed/renamed features, new required permissions, output format users depend on changes incompatibly | Reworked export format, removed a tab, manifest permission additions |
| **minor** (0.X.0) | New feature or capability, additive and backward-compatible | New "export palette as image", new font role, new tab |
| **patch** (0.0.X) | Bug fix, refactor, copy/style tweak, perf, no new capability | Fix wrong color role assignment, CSS spacing fix, internal refactor |

Pre-1.0 nuance: the project is at `0.x`. Treat genuinely breaking changes as a
**minor** bump unless the user explicitly wants a `1.0.0`, and call this out.

### 3. Ask clarifying questions if ambiguous

If the diff alone does not make the magnitude obvious, ask the user before
deciding. Prefer the AskQuestion tool. Good things to clarify:

- "Is this a user-facing feature or an internal change?"
- "Does the exported output / saved data change in a way that breaks existing users?"
- "Is this part of a larger feature still in progress (so keep it a patch for now)?"

Do not guess on breaking-change questions — confirm them.

### 4. Decide the bump

State the recommended bump and a one-line rationale tied to the actual changes,
e.g. "minor — adds palette-image export, additive and backward-compatible."

### 5. Apply the version + release notes

First set the version (keeps `manifest.json` and `package.json` in sync):

```bash
node scripts/sync-version.mjs minor      # or major / patch / an explicit X.Y.Z
```

Then add a new section at the **top** of `RELEASE_NOTES.md` (right under the
`# Release notes` heading, above the previous version).

**Do not invent a new format. Read `RELEASE_NOTES.md` first and copy the exact
structure of the existing entries**, including:

- Heading shape: `## <NEW_VERSION> — <short title>` (em dash `—`, not a hyphen).
- `**Date:** <Month D, YYYY>` line directly under the heading — use the **exact
  release date** (e.g. `June 18, 2026`), matching `PRIVACY.md`'s date style.
  This supersedes the older month-only dates in past entries; do not copy the
  `Month YYYY` style even though earlier entries use it. Get today's date from
  the system rather than guessing.
- The same `###` section names already used in the file (`New`, `Changed`,
  `Improved`, `Technical`, `Permissions`, `Package`) — reuse these names and
  their existing capitalization and ordering. Do not introduce new section
  names that don't already appear in the file.
- The existing bullet style: `- **Bold lead-in** — explanation.` where prior
  entries use it; plain bullets where they don't.
- A trailing `---` separator between releases, exactly as in the file.

Mirror the most recent entries as the template. Only include sections that
actually apply to this release; omit the rest. Write **user-facing**,
store-listing-ready bullets describing what changed for a designer using Prism
(derived from the same change analysis used to pick the bump), in the same tone
and length as the existing notes.

### 6. Update the documentation (only where relevant)

Review **every** Markdown doc in the repo and update each one **only if this
release actually affects what it covers**. Default to leaving a doc untouched;
edit it only when there is a concrete, relevant change. Match each file's
existing tone, structure, and headings — do not restructure or invent sections.
When unsure whether a change is "important enough" for a given doc, ask the user.

`sync-version.mjs` already synced the mechanical version strings in `README.md`
(the `**Version:**` line and `dist/prism-X.Y.Z.zip`) — do **not** hand-edit
those.

| Doc | Update it when… | Skip it for… |
|-----|-----------------|--------------|
| `README.md` | New/removed user-facing feature (`## Features`), changed flow (`## Usage`), permission change (both permission sections), new build/dev command or structure change | Pure bug fixes, refactors, perf, copy tweaks |
| `PRIVACY.md` | Anything privacy-relevant: permission added/removed, new data accessed, new network call, changed retention. Then also bump its `**Version:**` line to the new version and set `**Last updated:**` to today | Changes that don't affect data access, permissions, or network |
| `ARCHITECTURE.md` | Extraction/curation pipeline, module map, scoring, safeguards, data flow, integration, or known-limitations change | UI-only tweaks, copy, packaging, non-algorithmic changes |
| `benchmark/README.md` | Benchmark sites, files, commands, or regression workflow change | Anything not touching the benchmark system |

Discover docs dynamically rather than relying on this list being complete:

```bash
git ls-files "*.md"
```

Do not edit `.cursor/skills/**/*.md` (this skill itself) or vendored/generated
Markdown. For any doc you change, make sure its own version/date stamps (if it
has them) are consistent with this release.

### 7. Create the bump commit

This repo uses a dedicated bump commit (not an amend). Commit any pending
feature changes first (or ask), so this commit holds only the release files —
the version files, the release notes, and whichever docs you actually changed:

```bash
git add manifest.json package.json RELEASE_NOTES.md \
        README.md PRIVACY.md ARCHITECTURE.md benchmark/README.md
git commit -m "chore: bump version to <NEW_VERSION>"
```

Only stage the docs you actually edited (plus the always-changed version files
and `RELEASE_NOTES.md`). Use `git status` to confirm what changed.

### 8. Confirm

Report old → new version, the rationale, the release-notes title, and the list
of docs you updated (and, briefly, which docs you intentionally left untouched
and why). Tell the user they are clear to push. Do not run `git push` unless the
user explicitly asks.

## Notes

- The `pre-push` hook compares the pushed `manifest.json` version against the
  remote. A separate `chore: bump version` commit satisfies it.
- Docs-only / non-shipping pushes can bypass the hook with
  `SKIP_VERSION_CHECK=1 git push` or `[skip-bump]` in the commit message — only
  suggest this when no shippable code actually changed.
