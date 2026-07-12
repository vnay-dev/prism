# Release notes

## 0.4.0 — In-place editing & primary guarantee

**Date:** July 12, 2026

### New

- **In-place color editing** — the swatch morphs into the picker; **Apply color** commits the change, dismissing without Apply restores the previous hex.
- **HEX / RGB / HSL formats** — cycle the value format in the picker dock with a chevron carousel.

### Improved

- **Primary tile guaranteed** — palettes keep a primary hero swatch whenever the page has usable color (including soft pastels and utility-only chromatics); gray-heavy pages still get a primary slot.
- **Shuffle uses real site colors only** — no invented darker/lighter shades; alternates come from colors actually sampled on the page.
- **Near-white swatches** — light tiles get a subtle edge so they stay visible on the panel.
- **Panel height** — resizes instantly when switching tabs or opening the picker (no height tween).
- **Copy CTA** — label stays correct when moving between Color palette and Font families.

### Technical

- `hasVisibleChroma` / `ensurePrimaryRole` in `assignRoles.js`; soft-tint and utility seeding in `scoreAndCluster.js`.
- Color picker FLIP morph, Apply/discard baseline, and format carousel in `colorPicker.js` / `App.js`.
- Expanded palette tests for primary guarantee, soft pastels, and gray-only primary.

### Package

```bash
npm run package:store
# → dist/prism-0.4.0.zip
```

---

## 0.3.0 — Palette shuffle & color editing


**Date:** July 11, 2026

### New

- **Shuffle** — after extracting a palette, generate alternate combinations from the same page (website colors and darker/lighter shades) without re-scanning.
- **Edit any swatch** — pencil on each tile opens a minimal color picker (hue, saturation, eyedropper, hex). Edited colors stay locked and seed later shuffles.
- **Hex tooltips** — hover a swatch for a compact hex label; no hex text clutter inside the tiles.

### Improved

- **No pure black or white** in curated palettes — `#000000` / `#ffffff` are excluded as they add little design value.
- **Color palette controls** — Reset sits above the swatches; Shuffle shares the footer with Copy.

### Technical

- Seeded shuffle path in `scoreAndCluster.js` (`seed`, `avoidHexes`, shade variants via `colorLab.js`).
- New `src/popup/colorPicker.js` — custom HSV picker with Material Symbols chrome.
- Expanded palette unit tests for shuffle determinism, shade helpers, and black/white exclusion.

### Package

```bash
npm run package:store
# → dist/prism-0.3.0.zip
```

---

## 0.2.2 — On-page font highlighting

**Date:** June 20, 2026

### New

- **Font highlighting on the page** — select a family in the **Font families** tab to highlight every visible run of text that uses it, directly on the live page. Matches in the viewport appear first and more reveal as you scroll; the highlight clears when you deselect or close the panel.

### Improved

- **Palette image export** — the copied PNG now includes the site's logo and name as a header, renders at 4× (retina) resolution, and mirrors the on-screen bento layout exactly so the image matches what you see.
- **Panel motion** — the panel opens and resizes with a smooth height animation that respects `prefers-reduced-motion`.
- **Copy feedback** — the color copy button now reads **Copy to clipboard** and confirms with **Copied! Paste in Figma**.
- **Dev build clarity** — unpacked development builds show a red **DEV** badge on the toolbar icon.

### Technical

- New `src/content/highlightFont.js` — CSS Highlight API with a span-wrap fallback for older engines.
- New shared `src/popup/paletteLayout.js` — single source of bento geometry used by both the popup and the PNG export.
- New release workflow: `bump-extension-version` skill, `scripts/sync-version.mjs`, and a blocking `pre-push` hook auto-installed via `npm prepare`.

### Package

```bash
npm run package:store
# → dist/prism-0.2.2.zip
```

---

## 0.2.1 — Rename to Prism

**Date:** June 2026

### Changed

- Extension name is now **Prism** everywhere (store listing, toolbar, panel, privacy policy).
- Store package output: `dist/prism-0.2.1.zip`

---

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
