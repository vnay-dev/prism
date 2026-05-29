# Prism

Chrome extension that extracts a curated **8-color design palette** from any live web page. Colors are sampled from rendered DOM styles (backgrounds, text, borders, icons), clustered, scored, and assigned semantic roles — foundation, primary, secondary, accent, and neutral — so you can copy the result straight into Figma.

**Version:** 0.1.0

## Features

- Full-page scroll extraction with importance weighting (not just CSS variables)
- Semantic role assignment for design-system-style palettes
- Bento-style preview in the popup
- Copy palette as a PNG image to the clipboard
- Offline — all processing runs locally in the browser; nothing is sent to a server

## Install (development)

1. Clone this repo and open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the repo root (the folder containing `manifest.json`).

## Usage

1. Open a tab with the site you want to sample.
2. Click the **Prism Palette** extension icon.
3. Click **Extract palette** and wait for the scan to finish (~10–20 seconds on long pages).
4. Click the copy button to paste the palette image into Figma (or another design tool).

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
src/
  content/             In-page color extraction
  core/                Clustering, scoring, role assignment
  popup/               Extension UI
tests/                 Node test runner suites
benchmark/             Frozen 9-site regression baseline
scripts/               Benchmark runners and dev tooling
```

## Permissions

| Permission | Why |
|------------|-----|
| `activeTab` | Run extraction on the current tab when you click Extract |
| `scripting` | Inject the extraction script into the page |
| `clipboardWrite` | Copy the palette PNG |
| `downloads` | Optional palette download support |
| `<all_urls>` | Read computed styles on whichever site you choose to scan |

No background service worker, no analytics, and no network requests from the extension runtime.

## License

Not yet specified.
