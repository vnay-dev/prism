# Release notes

## 0.2.0 — Font families

**Date:** June 2026

### New

- **Font families tab** — extract typography from the current page alongside the existing color palette flow.
- **Font curation** — ranks families by visible usage (area, importance, headings, content zone) and surfaces meaningful CSS weights (400, 500, 600, …).
- **Per-family copy** — copy icon on each font card writes the family name to the clipboard.
- **Separate tab flows** — Color palette and Font families each have their own extract, loading, results, and reset actions.
- **Tabbed panel UI** — sliding tab indicator, aligned labels (**Color palette** / **Font families**), and mode-specific intro copy (“used on this webpage”).

### Improved

- Loader centered consistently on both tabs (spinner + status text).
- Privacy policy and README updated for typography sampling and clipboard use.
- Removed legacy `extractPalette.js` and ad-hoc diagnostic scripts from the repo.

### Technical

- New modules: `src/core/curateFonts.js`, `src/core/fontUtils.js`
- Font sampling added to `src/content/extractInPage.js`
- New test suite: `tests/fonts.test.js` (31 total tests passing)
- Color benchmark lockfile unchanged — regression still covers 9 reference sites

### Package

```bash
npm run package:store
# → dist/prism-0.2.0.zip
```

---

## 0.1.0 — Initial release

**Date:** May 2026

### New

- **Color palette extraction** — full-page virtual section scan with importance weighting on rendered DOM colors.
- **8-color curated palette** — semantic roles (foundation, primary, secondary, accent, neutral) with bento-style preview.
- **Copy palette PNG** — paste the palette image into Figma or other design tools.
- **In-page panel** — iframe panel injected on the active tab; guidance popup on restricted URLs (`chrome://`, New Tab, etc.).
- **Chrome Web Store packaging** — `npm run package:store` builds a runtime-only ZIP.
- **Privacy policy** — [PRIVACY.md](./PRIVACY.md) for store listing.

### Permissions

- `activeTab`, `scripting`, `clipboardWrite` — no broad host permissions, no `downloads`.

### Technical

- Core pipeline: `extractInPage.js` → `scoreAndCluster.js` → `assignRoles.js`
- Frozen 9-site color benchmark (`benchmark/lockfile.json`, `tests/benchmark.test.js`)
