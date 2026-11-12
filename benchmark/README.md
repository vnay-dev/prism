# Palette + Font Extraction Benchmark

Frozen baseline for the reference **color palette** and **font curation** benchmark. Algorithm changes must pass `tests/benchmark.test.js` before merge.

## Sites (11)

**Core:** Linear, Stripe, Spotify, Vercel, Notion, Framer (`framer.com`), Apple (`apple.com/in/store`), Netflix, Slack

**Added for QA regression:**
| Site | URL | Guards |
|------|-----|--------|
| Apple (updated URL/fixture) | https://www.apple.com/in/store | Prefers SF Pro Text over Helvetica Neue fallback |
| Toonify | https://toonify.io/ | Curates Fredoka (not Fredoka Fallback) |
| Adya Framer Portfolio | https://adyasrivastava.framer.website/ | Curates Inter (never Inter Placeholder); separate from `framer.com` |

## Files

| File | Purpose |
|------|---------|
| `lockfile.json` | Frozen palettes, fonts, roles, and benchmark scores |
| `benchmark-lib.mjs` | Shared extraction, scoring, and comparison logic |
| `extractions/*.json` | Cached page extractions (input fixtures) |
| `generate-lockfile.mjs` | Regenerates `lockfile.json` from extractions + algorithm |
| `build-site-fixture.mjs` | Builds compact fixtures from scraped color/font signals |

## Commands

```bash
# Run all tests including benchmark regression
npm test

# Run benchmark test only
npm run test:benchmark

# Regenerate lockfile after intentionally accepting benchmark changes
npm run benchmark:lock
```

## Before merge

1. Run `npm test`
2. Review benchmark output:
   - **Improved** — scores increased vs lockfile
   - **Unchanged** — exact match (required for no-op changes)
   - **Regressed** — test fails; fix or update lockfile deliberately

## Updating the baseline

Only regenerate the lockfile when benchmark changes are intentional:

```bash
npm run benchmark:lock
```

Commit `benchmark/lockfile.json` (and any new `extractions/*.json`) with the algorithm change.

### Adding a QA site fixture

1. Scrape `topColors` / `topFonts` from the live page (DevTools or capture script).
2. Build a compact extraction:

```bash
node benchmark/build-site-fixture.mjs <slug> signals.json benchmark/extractions/<slug>.json
```

3. Register the site in `BENCHMARK_SITES` + `KNOWN_BRAND` in `benchmark-lib.mjs`.
4. Run `npm run benchmark:lock` and `npm test`.
