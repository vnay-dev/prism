# Prism

Chrome extension that extracts a curated **8-color design palette** and **font families** from any live web page. Colors are sampled from rendered DOM styles (backgrounds, text, borders, icons), clustered, scored, and assigned semantic roles. Typography is sampled from computed `font-family` and `font-weight` on visible text, then ranked and filtered so you get the families and weights that actually matter on the page.

**Version:** 0.2.0 · [Release notes](./RELEASE_NOTES.md)

## Features

### Color palette
- Full-page virtual section scan with importance weighting (not just CSS variables)
- Semantic role assignment — foundation, primary, secondary, accent, and neutral
- Bento-style 8-swatch preview
- Copy palette as a PNG image to the clipboard

### Font families
- Same virtual section scan collects typography from visible text elements
- Ranks font families by area, importance, heading usage, and content zone
- Snaps weights to standard CSS values (400, 500, 600, …) and filters insignificant outliers
- Filters emoji and generic system fallbacks where possible
- Per-family copy button (family name to clipboard)

### Panel
- Two tabs: **Color palette** and **Font families** — separate extract and reset flows per tab
- In-page panel (iframe) on normal sites; guidance-only popup on restricted pages (`chrome://`, New Tab, etc.)
- Extraction runs locally in the browser; page data is not sent to our servers

## Install (development)

1. Clone this repo and open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the repo root (the folder containing `manifest.json`).

## Usage

1. Open a tab with the site you want to sample.
2. Click the **Prism** extension icon to open the panel.
3. Choose a tab:
   - **Color palette** — click **Extract color palette**, then **Copy palette** to paste the PNG into Figma or another tool.
   - **Font families** — click **Extract font families**, then use the copy icon on any card to copy that family name.
4. Wait for the scan to finish (~10–20 seconds on long pages).

See [RELEASE_NOTES.md](./RELEASE_NOTES.md) for version history and store publish notes.

## Chrome Web Store package

Build an upload-ready ZIP (runtime files only — no tests, scripts, or `node_modules`):

```bash
npm run package:store
```

Output: `dist/prism-0.2.0.zip`

**Privacy policy:** See [PRIVACY.md](./PRIVACY.md). Host it at a public URL (for example GitHub Pages on this repo) and paste that link into the Chrome Web Store listing.

**Permission justification (for the store form):**

- `activeTab` — Access only the tab where the user clicked the Prism icon, to sample styles when they click Extract.
- `scripting` — Inject a short-lived, self-contained script on that tab to read rendered styles.
- `clipboardWrite` — Copy the palette PNG or individual font family names when the user clicks copy.
- `web_accessible_resources` — Load the extension panel UI inside an iframe on the page the user is viewing; does not grant background access to all sites.

## Development

Requires [Node.js](https://nodejs.org/) 18+ for tests and benchmark tooling.

```bash
npm test                 # unit + benchmark regression tests
npm run test:benchmark   # benchmark tests only
npm run benchmark:lock   # regenerate frozen color baseline (intentional changes only)
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the extraction pipeline and module map. Benchmark details are in [benchmark/README.md](./benchmark/README.md).

## Project structure

```
manifest.json          Chrome extension manifest (MV3)
icons/                 Extension icons (required for store)
src/
  background/          Toolbar click → panel injection
  content/             In-page color + font extraction
  core/                Clustering, scoring, roles, font curation
  popup/               Tabbed panel UI
tests/                 Node test runner suites
benchmark/             Frozen 9-site color regression baseline
scripts/               Benchmark lockfile generator and store packaging
```

## Permissions and network

| Permission | Why |
|------------|-----|
| `activeTab` | Access the tab you invoked Prism on, only while you use it |
| `scripting` | Inject the extraction script into that tab |
| `clipboardWrite` | Copy the palette PNG or font family names |

**Network:** Extraction does not use the network. The panel UI loads [Google Fonts](https://fonts.google.com/) (Google Sans and Material Symbols) from `fonts.googleapis.com` / `fonts.gstatic.com` when you open Prism; see [PRIVACY.md](./PRIVACY.md).

No analytics. No remote palette or typography storage.

## License

Not yet specified.
