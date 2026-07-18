# Palette Extraction Benchmark

Frozen baseline for the 9-site reference **color palette** benchmark. Typography curation is covered by `tests/fonts.test.js` but is not yet part of this lockfile. Future color algorithm changes must pass `tests/benchmark.test.js` before merge.

## Sites

Linear, Stripe, Spotify, Vercel, Notion, Framer, Apple, Netflix, Slack

## Files

| File | Purpose |
|------|---------|
| `lockfile.json` | Frozen palettes, roles, and benchmark scores |
| `benchmark-lib.mjs` | Shared extraction, scoring, and comparison logic |
| `extractions/*.json` | Cached page extractions (input fixtures) |
| `generate-lockfile.mjs` | Regenerates `lockfile.json` from extractions + algorithm |

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

Commit `benchmark/lockfile.json` with the algorithm change.
