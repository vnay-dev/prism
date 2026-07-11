# Prism — Architecture

Prism is a Chrome extension that extracts **design-system colors** and **typography** from live web pages.

- **Colors** — an 8-color palette with semantic roles (foundation, primary, secondary, accent, neutral) derived from rendered DOM colors, not CSS variables alone.
- **Fonts** — ranked font families with meaningful CSS weights, derived from computed styles on visible text.

The panel has two tabs (**Color palette** / **Font families**). Each tab runs the same in-page scan but curates a different slice of the extraction output.

### Color pipeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         extractInPage.js (content script)               │
│  Virtual section scan → classify source/zone → emit samples[]           │
│                      + fontSamples[] + fontTokens[]                     │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ samples[]
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         scoreAndCluster.js                              │
│  Split neutral/chromatic → LAB cluster → score → buildPalette (8)      │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ curated.selected[]
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         assignRoles.js                                  │
│  foundation · primary · secondary · accent · neutral                     │
└───────────────────────────────────┬─────────────────────────────────────┘
                                    │ swatches[8]
                                    ▼
                         Color tab / PNG export
```

### Font pipeline

```
extractInPage.js  →  fontSamples[] + fontTokens[]
        │
        ▼
curateFonts.js    →  aggregate by family · score weights · filter noise
        │
        ▼
Popup (Font families tab)  →  cards with family name + weights · per-card clipboard copy
```

---

## Module map

| Module | Responsibility |
|--------|----------------|
| `src/content/extractInPage.js` | Full-page virtual section scan, area measurement, color + font sampling |
| `src/content/highlightFont.js` | On-page highlighting of text matching a selected font family (CSS Highlight API, viewport-first, span-wrap fallback) |
| `src/popup/paletteLayout.js` | Shared bento geometry used by both the popup render and the PNG export |
| `src/core/sourceClassification.js` | Source categories, weights, product demo detection, utility classification, scoring |
| `src/core/curateFonts.js` | Font family curation and weight significance filtering |
| `src/core/fontUtils.js` | Font weight snapping and emoji-font filtering |
| `src/core/scoreAndCluster.js` | LAB clustering, palette curation, quality adjustment |
| `src/core/assignRoles.js` | Semantic role assignment on curated colors |
| `src/core/paletteSafeguards.js` | Foundation surface filter, browser link exclusion, legacy sample inference |
| `src/core/colorLab.js` | RGB ↔ HSL ↔ LAB, Delta-E |
| `benchmark/benchmark-lib.mjs` | Frozen 9-site regression baseline |
| `benchmark/lockfile.json` | Canonical palettes and scores |

---

## 1. Extraction pipeline

**Entry point:** `window.__prismExtractPalette()` in `extractInPage.js`

### 1.1 Page traversal

- Maps the document in viewport-sized **virtual sections** (no page scroll; max 25 sections, ~18s budget)
- At each section, scans up to 1,800 visible DOM nodes
- Each pass is a **section** (`section-0`, `section-1`, …)

### 1.2 Color properties sampled

For each element, reads computed styles for:

| CSS property | Area type | Context |
|--------------|-----------|---------|
| `background-color` | element bounding box | `surface` |
| `color` | text glyph boxes (range rects) | `text` / `link` |
| `border-top-color` | border strip area | `border` |
| `fill` | SVG bounding box (capped) | `icon` |
| `stroke` | SVG bounding box (capped) | `icon` |

Syntax-highlighted code (`pre`, `code`, `.hljs`) skips text/fill/stroke colors.

### 1.3 Area measurement

Area drives clustering weight and foundation selection. Rules differ by property:

- **Background:** `width × height` of element rect
- **Text:** sum of `Range.getClientRects()` areas, with font-size fallback
- **Border:** sum of border-width × edge lengths
- **SVG fill/stroke:** capped at `min(rawArea, max(2500, viewport × 1.5%))` to limit decorative SVG inflation

Each sample records `areaSourceType`: `Background`, `Text`, `Border`, `SVG Fill`, `SVG Stroke`.

### 1.4 Sample record

Each extracted color becomes a **sample**:

```js
{
  hex, rgb, hsl,
  area,                    // px² contribution
  areaSourceType,          // Background | Text | Border | SVG Fill | SVG Stroke
  importance,              // rawImportance × brandWeight
  rawImportance,             // semantic signal 3–100
  brandWeight,               // SOURCE_WEIGHT for sourceCategory
  sourceCategory,            // e.g. hero_cta, navigation, demo_illustration
  contentZone,               // website_chrome | product_demo | page_content
  sectionId,
  context,                   // surface | button | link | icon | heading | text | border
  contrast                   // Delta-E vs parent background, normalized
}
```

Samples are deduplicated per section by element position + context + hex.

### 1.5 Importance scoring (extraction)

`rawImportance` reflects DOM semantics and content zone:

| Signal | rawImportance |
|--------|---------------|
| Product demo zone | 3 (capped) |
| Website chrome hero H1/H2 or large button | 100 |
| Chrome CTA button (signup keywords) | 90 |
| Chrome button | 60 |
| Page content button | 40 |
| Chrome nav/header link | 70 / 60 |
| Card/feature context | 30 |
| Body text (P, H3–H6, LI, TD) | 10 |
| Default | 3 |

Final sample importance: `rawImportance × SOURCE_WEIGHT[sourceCategory]`.

### 1.6 Font sampling

Alongside color samples, each text-bearing element may emit a **font sample**:

```js
{
  family,              // resolved primary face from font-family stack
  stack,               // raw computed font-family
  fontSize, weight,    // normalized weight (400, 500, 600, …)
  textLength,
  headingLevel,        // 1–6 for H1–H6, else null
  viewportVisible,
  contentZone,
  sectionId,
  importance,          // same zone/source weighting as colors
  sourceCategory,
  context              // heading | button | link | text | …
}
```

**CSS token hints:** `collectFontTokens()` reads `--font-family`, `--font-sans`, `--font-body`, etc. from `:root` to boost families declared in design tokens.

Font samples are deduplicated per section by element geometry + family.

### 1.7 Extraction output

```js
{
  samples, fontSamples, fontTokens,
  sectionCount, sections,
  sampledElements,
  areaContributions
}
```

---

## 2. Source classification

**Module:** `sourceClassification.js` (mirrored in `extractInPage.js` for injection)

Every sample receives a `sourceCategory` from DOM signals: tag, class, id, aria-label, role, context, content zone, hero/nav/footer placement.

### 2.1 Source categories and weights

Categories are ranked by `SOURCE_WEIGHT` (1–10). Higher weight = stronger brand signal.

| Tier | Categories | Weight |
|------|------------|--------|
| Hero / CTA | `hero_cta`, `primary_button` | 10, 9 |
| Navigation / surfaces | `navigation`, `global_background`, `hero_background`, `logo` | 8 |
| Layout | `repeated_section_bg`, `major_container` | 7, 6 |
| Content | `illustration`, `card` | 5, 4 |
| Promo / dynamic | `promo_content`, `blog_card`, `marketing_banner`, `dynamic_content` | 2 |
| Utility / status | `success_state`, `warning_state`, `error_state`, `alert`, `notification`, `status_chip`, `chart`, `syntax_highlight` | 0.5–1 |
| Product demo | `demo_navigation`, `demo_sidebar`, `demo_status`, `demo_illustration` | 1–2 |
| Default | `default` | 3 |

Classification uses pattern matching on class/id/aria text for status badges, charts, promos, logos, and surface containers.

---

## 3. Product demo detection

Product demo detection separates **marketing chrome** from **embedded product UI** (screenshots, mock app shells, kanban boards).

### 3.1 Content zones

Three zones are assigned per element via `detectContentZone()`:

```
product_demo     ← inside PRODUCT_DEMO_SELECTOR
website_chrome   ← header, nav, footer, hero (outside demo)
page_content     ← everything else
```

### 3.2 Demo DOM selectors

Elements matching any of these selectors (via `el.closest()`) are in `product_demo`:

- Class patterns: `IssueView`, `Sidebar_sidebar`, `mock`, `preview`, `screenshot`, `product-demo`, `browser-window`, `device-frame`, `kanban`, `chatBox`, `agentChart`, …
- Full list: `PRODUCT_DEMO_SELECTOR` in `sourceClassification.js`

### 3.3 Demo source remapping

Inside `product_demo`, sources are remapped to demo categories:

| DOM signal | sourceCategory |
|------------|----------------|
| Nav / sidebar in demo | `demo_navigation`, `demo_sidebar` |
| Status badge/chip in demo | `demo_status` |
| SVG / icon / surface in demo | `demo_illustration` |

Demo samples receive `rawImportance = 3` regardless of element type.

### 3.4 Effect on downstream stages

- Demo sources count toward **utility classification** (60% occurrence threshold)
- Demo colors contribute to palette discovery via clustering area
- Demo importance is capped at extraction; no separate demo weight multiplier in curation
- Heavy demo pages (e.g. Linear ~51% demo samples) can skew chromatic ranking if brand evidence is weak

---

## 4. Clustering

**Module:** `scoreAndCluster.js`

### 4.1 Neutral / chromatic split

Samples split by `isNeutralHsl(hsl)` — low saturation or very high/low lightness.

### 4.2 LAB merge clustering

| Pool | Merge threshold | Constant |
|------|-----------------|----------|
| Neutrals | ΔE < 5 | `NEUTRAL_MERGE_DE` |
| Chromatics | ΔE < 8 | `CHROMA_MERGE_DE` |

Colors are converted to CIE LAB (`colorLab.js`). Each sample merges into the nearest cluster within threshold, or starts a new cluster.

### 4.3 Cluster aggregation

Per cluster, the pipeline tracks:

- `totalArea`, `occurrences`, `sectionIds`, `contexts`
- `sourceCounts` — histogram of sourceCategory
- `brandWeightedImportance` — sum of sample importance
- `hasHero`, `hasCta`, `hasNav` — boolean brand-context flags
- `foundationArea` — area from background surface samples only (see Safeguards)
- `foundationSurfaceByHex` — per-hex area within cluster for foundation display
- **Representative hex** — sample with peak `importance` in cluster

### 4.4 Hue-family deduplication

After clustering, chromatic clusters are deduplicated by **30° hue bucket** (`floor(h / 30)`). Only the highest `designSystemScore` color per bucket survives into `chromaDeduped`.

---

## 5. Utility classification

**Module:** `sourceClassification.js` — `classifyClusterUtility()`

Utility colors (status badges, charts, demo UI accents) are excluded from brand chromatic selection.

### 5.1 Occurrence-based rule

A cluster is utility if either:

- `utilityRatio >= 0.55` (weighted utility sources / total weighted sources), **or**
- Demo + utility source **occurrences ≥ 60%** of cluster samples

Utility sources: `success_state`, `warning_state`, `error_state`, `alert`, `notification`, `status_chip`, `chart`, `syntax_highlight`, plus demo sources.

### 5.2 Brand evidence override

A cluster is **never** classified as utility if it has strong brand evidence:

| Override condition | Field |
|--------------------|-------|
| Hero context | `hasHero` (hero_background or hero_cta sources) |
| Navigation context | `hasNav` |
| Logo present | `sourceCounts.logo > 0` |
| High brand confidence | `brandConfidence > 0.15` |

This prevents genuine brand colors (e.g. Linear `#5e6ad2` with `hero_background`) from being removed when mixed with demo_illustration samples.

Utility clusters are filtered out of `brandChromas` in `buildPalette()` but may appear as accent via `pickUtilityAccent()`.

---

## 6. Scoring

Two scores are computed per cluster in `finalizeCluster()`:

### 6.1 brandConfidence

Measures how strongly a cluster appears in brand-significant contexts:

```
brandConfidence =
  hasHero  × 0.25 +
  hasCta   × 0.25 +
  hasNav   × 0.20 +
  sectionCoverage × 0.20 +
  contextDiversity × 0.10
```

Range: 0–1+. Higher = more likely a deliberate brand color.

### 6.2 designSystemScore

Measures overall palette fitness:

```
designSystemScore =
  (confidence × 0.45 +
   brandSignal × 0.35 +
   sectionCoverage × 0.12 +
   area × 0.08)
  × utilityPenalty
```

Where:

- `brandSignal` = cluster importance / max cluster importance
- `area` = cluster area / max cluster area
- `utilityPenalty` = 0.15 if utility, 0.5 if utilityRatio > 0.35, else 1.0

Scores are normalized against page-wide maxima computed once per curation pass.

---

## 7. Palette curation

**Module:** `scoreAndCluster.js` — `buildPalette()` + `qualityAdjust()`

### 7.1 Selection order (8 slots)

```
1. Primary     ← best chromaDeduped with brandConfidence ≥ 0.15, else first
2. Secondary   ← up to 2 more from chromaDeduped
3. Accent      ← CTA/button chromatic, or brandConfidence ≥ 0.2
4. Neutral     ← up to 4 neutrals by area share
5. Fill pool   ← remaining slots from scored pool until 8
```

`chromaDeduped` = hue-deduplicated, browser-link-stripped brand chromatics.

### 7.2 Safeguards (`paletteSafeguards.js` + `colorLab.js`)

Applied during curation and role assignment:

| Safeguard | Purpose |
|-----------|---------|
| **Foundation surface filter** | Foundation area from `global_background`, `hero_background`, `repeated_section_bg`, `major_container` with `areaSourceType = Background` only |
| **Foundation surface hex** | When neutral clusters merge near-black colors, display the dominant *surface* hex, not the merged cluster label |
| **Browser link exclusion** | `#0000ee` / `#0000ff` stripped from chromatic selection unless explicit brand evidence (hero, CTA, logo sources) |
| **Pure black / white exclusion** | Literal `#000000` / `#ffffff` filtered from samples before clustering |
| **Legacy sample inference** | Test fixtures without sourceCategory get inferred fields for backward compatibility |

### 7.3 Shuffle curation

`curatePalette(extraction, { seed, avoidHexes })` enables alternate palettes without re-extracting:

- Seeded PRNG varies role picks among top-ranked candidates
- Optional `avoidHexes` prefers colors not already on screen
- Display hexes can rotate among cluster members and darker/lighter HSL shades (`shadeColor` in `colorLab.js`)
- Edited/locked swatches in the popup are re-injected as high-weight samples so later shuffles build around them

### 7.4 Quality adjustment

Post-selection cleanup:

- Keep at most one utility color in palette
- Demote utility colors assigned as primary → accent
- Ensure accent slot filled when chromatics exist
- Rebalance if no brand chromatics survived selection

---

## 8. Role assignment

**Module:** `assignRoles.js`

Maps curated 8-color output to semantic roles for display and export.

### 8.1 Foundation

Selected from neutral pool using **foundation area share** (not total area):

- `foundationAreaShare >= 0.30`
- Present in ≥ 50% of page sections (minimum 2)
- Uses `foundationSurfaceHex` when available

### 8.2 Primary / secondary / accent

| Role | Selection rule |
|------|----------------|
| **Primary** | Highest `brandConfidence` among non-utility, non-neutral chromatics (browser links stripped) |
| **Secondary** | Next 2 brand chromatics by brandConfidence |
| **Accent** | Curator accent hint, or chromatic with CTA context / brandConfidence ≥ 0.2; utility accent as fallback |
| **Neutral** | Up to 4 remaining neutrals by designSystemScore |

Utility colors cannot hold primary or secondary — demoted to accent.

Browser default link colors demoted from primary/secondary/accent → neutral.

### 8.3 Output

```js
{
  swatches: [{ hex, role, score, brandConfidence, hsl, areaShare, isUtility, source }],
  paletteMode: "brand" | "foundation",
  sectionCount,
  sampledElements
}
```

`paletteMode = "brand"` when a chromatic primary exists.

---

## 9. Font curation

**Module:** `curateFonts.js` (helpers in `fontUtils.js`)

Runs in the extension popup when the user extracts on the **Font families** tab. Input: `fontSamples[]` and `fontTokens[]` from extraction.

### 9.1 Aggregation

- Groups samples by resolved **family** name (first non-generic face in the stack)
- Sums a **sample score** per family using area, importance, content zone, heading level, font size, and visibility
- Tracks per-family **weight buckets** with frequency, heading prominence, and section spread

### 9.2 Weight filtering (`fontUtils.js`)

- **Snap** computed weights to standard CSS values (100–900)
- Drop insignificant outlier weights (e.g. 401, 437) unless they have enough supporting text area
- Filter **emoji fonts** (`Apple Color Emoji`, `Segoe UI Emoji`, …) and deprioritize generic **system fallbacks**

### 9.3 Family selection

Up to three distinct families, chosen by heading score, body text score, and UI/chrome score:

1. Primary — strongest heading/hero signal
2. Secondary — dominant body text face
3. Tertiary — nav/UI chrome face (when distinct)

CSS custom-property **token hints** can fill gaps when samples under-represent a declared token family.

### 9.4 Popup output

Each family card shows:

- Family name (rendered in the panel UI font, not the extracted typeface)
- `Weights: 400, 500, 600` — comma-separated list of meaningful weights
- Copy icon — writes the family name to the clipboard
- Select control — injects `highlightFont.js` to highlight every visible run of that family on the page (viewport-first, revealed on scroll); cleared on deselect or panel close

PNG export includes **colors only**; typography is clipboard-only per family.

---

## 10. Benchmark system

The extraction algorithm is **frozen** behind a 9-site regression benchmark.

### 10.1 Reference sites

Linear, Stripe, Spotify, Vercel, Notion, Framer, Apple, Netflix, Slack

### 10.2 Artifacts

| File | Contents |
|------|----------|
| `benchmark/lockfile.json` | Frozen palettes, roles, scores (brandAccuracy, designerUsefulness) |
| `scripts/benchmark-extractions/*.json` | Cached raw extractions (input fixtures) |
| `benchmark/benchmark-lib.mjs` | Shared run, score, compare logic |
| `tests/benchmark.test.js` | Automated regression test |

**Current baseline averages:** brand accuracy **8.6/10**, designer usefulness **8.3/10**

### 10.3 Benchmark scoring

Per-site scores (0–10) computed against known brand reference colors:

- **brandAccuracy** — foundation match, primary match, browser-link penalty
- **designerUsefulness** — chromatic primary present, palette completeness, foundation present

### 10.4 Regression workflow

```bash
npm test                 # All tests including benchmark
npm run test:benchmark   # Benchmark only
npm run benchmark:lock   # Regenerate lockfile (intentional changes only)
```

Before merge, the benchmark test reports:

```
Improved:   sites with score increases vs lockfile
Unchanged:  exact palette match (required for no-op changes)
Regressed:  test FAIL — score drop or unintended palette drift
```

Regressions block merge unless the lockfile is deliberately regenerated.

### 10.5 Updating the baseline

When algorithm changes are intentional and validated:

1. Run `npm run benchmark:lock`
2. Commit updated `benchmark/lockfile.json` with the algorithm change
3. Document what improved and what trade-offs were accepted

---

## 11. Data flow summary

```
DOM element
  → contentZone (website_chrome | product_demo | page_content)
  → sourceCategory (hero_cta | navigation | demo_illustration | …)
  → sample { hex, area, areaSourceType, importance, contentZone }
  → LAB cluster { totalArea, sourceCounts, hasHero, isUtility, … }
  → scores { brandConfidence, designSystemScore }
  → curated palette [8 colors with roleHints]
  → assigned roles { foundation, primary, secondary, accent, neutral }
  → benchmark lockfile comparison (colors only)

fontSamples[] + fontTokens[]
  → curateFonts → ranked families + weight labels
  → Font families tab + clipboard copy
```

---

## 12. Extension integration

| Component | Role |
|-----------|------|
| `src/content/extractInPage.js` | Injected into page tab; returns raw extraction JSON (colors + fonts) |
| `src/core/scoreAndCluster.js` | `curatePalette(extraction, options?)` → curated colors (optional shuffle seed) |
| `src/core/assignRoles.js` | `assignRoles(curated)` → final swatches |
| `src/core/curateFonts.js` | `curateFonts(extraction)` → ranked families + weights |
| `src/popup/App.js` | Tabbed UI — extract, shuffle, swatch edit/lock, copy, and font-highlight flows |
| `src/popup/colorPicker.js` | Custom HSV color picker for swatch editing |
| `src/popup/exportPaletteImage.js` | Palette PNG generation (color tab only), using `paletteLayout.js` geometry |
| `src/popup/paletteLayout.js` | Shared bento layout for popup render and PNG export |
| `src/content/highlightFont.js` | Injected on demand to highlight visible text matching a selected font family |

The popup injects `extractInPage.js` via `chrome.scripting.executeScript`, then runs color or font curation in the extension context using shared core modules. The Font families tab additionally injects `highlightFont.js` to mark on-page text in the selected family.

---

## 13. Known limitations

Documented by the frozen benchmark (not bugs — baseline expectations):

| Pattern | Affected sites |
|---------|----------------|
| Partial page crawl (cookie walls) | Spotify |
| Heavy product demo sample share | Linear |
| Role inversion (brand secondary vs primary) | Slack |
| Warm foundation vs white extraction | Notion |
| Browser link in neutral slot | Framer, Spotify |
| No chromatic primary | Spotify |
| Font benchmark | Not yet in frozen lockfile — color regression only today |
| Lazy-loaded below-fold content | May be under-sampled without real scroll |

These represent the current accuracy ceiling. Future work should improve scores via the benchmark workflow without silent regressions on the 8 sites that pass today.
