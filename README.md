# Prism

Chrome extension that extracts a curated **8-color design palette** from any live web page. Colors are sampled from rendered DOM styles (backgrounds, text, borders, icons), clustered, scored, and assigned semantic roles — foundation, primary, secondary, accent, and neutral — so you can copy the result straight into Figma.

**Version:** 0.1.0

## Features

- Full-page virtual section scan with importance weighting (not just CSS variables)
- Semantic role assignment for design-system-style palettes
- Bento-style preview in the panel
- Copy palette as a PNG image to the clipboard
- Palette extraction runs locally in the browser; extracted colors are not sent to our servers

## Install (development)

1. Clone this repo and open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the repo root (the folder containing `manifest.json`).

## Usage

1. Open a tab with the site you want to sample.
2. Click the **Prism Palette** extension icon.
3. Click **Extract palette** and wait for the scan to finish (~10–20 seconds on long pages).
4. Click the copy button to paste the palette image into Figma (or another design tool).

## Chrome Web Store package

Build a upload-ready ZIP (runtime files only — no tests, scripts, or `node_modules`):

```bash
npm run package:store
```

Output: `dist/prism-palette-extractor-0.1.0.zip`

**Privacy policy:** See [PRIVACY.md](./PRIVACY.md). Host it at a public URL (for example GitHub Pages on this repo) and paste that link into the Chrome Web Store listing.

**Permission justification (for the store form):**

- `activeTab` — Access only the tab where the user clicked the Prism icon, to sample colors when they click Extract.
- `scripting` — Inject a short-lived, self-contained script on that tab to read rendered styles.
- `clipboardWrite` — Copy the generated palette PNG when the user clicks Copy palette.
- `web_accessible_resources` — Load the extension panel UI inside an iframe on the page the user is viewing; does not grant background access to all sites.

## Development

Requires [Node.js](https://nodejs.org/) 18+ for tests and benchmark tooling.

```bash
npm install
npm test                 # unit + benchmark regression tests
npm run test:benchmark   # benchmark tests only
npm run benchmark:lock   # regenerate frozen baseline (intentional changes only)
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the extraction pipeline and module map. Benchmark details are in [benchmark/README.md](./benchmark/README.md).

## Project structure

```
manifest.json          Chrome extension manifest (MV3)
icons/                 Extension icons (required for store)
src/
  background/          Toolbar click → panel injection
  content/             In-page color extraction
  core/                Clustering, scoring, role assignment
  popup/               Extension UI
tests/                 Node test runner suites
benchmark/             Frozen 9-site regression baseline
scripts/               Benchmark runners and store packaging
```

## Permissions and network

| Permission | Why |
|------------|-----|
| `activeTab` | Access the tab you invoked Prism on, only while you use it |
| `scripting` | Inject the extraction script into that tab |
| `clipboardWrite` | Copy the palette PNG |

**Network:** Extraction does not use the network. The panel UI loads [Google Fonts](https://fonts.google.com/) (Google Sans and Material Symbols) from `fonts.googleapis.com` / `fonts.gstatic.com` when you open Prism; see [PRIVACY.md](./PRIVACY.md).

No analytics. No remote palette storage.

## License

Not yet specified.
