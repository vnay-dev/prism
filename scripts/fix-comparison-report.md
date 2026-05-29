# Fix Comparison Report

Generated: 2026-05-29T16:39:07.654Z

## FIX 1: Foundation from background surfaces

| Site | Before | After (new extractions) | On old extraction (FIX 1 only) |
|------|--------|-------------------------|--------------------------------|
| Linear | #000000 | #08090a | #08090a |
| Stripe | #000000 | #ffffff | #ffffff |
| Spotify | — | — | — |
| Vercel | #000000 | #fafafa | #fafafa |
| Notion | #000000 | #ffffff | #ffffff |
| Framer | #000000 | #000000 | #000000 |
| Apple | #000000 | #ffffff | #ffffff |
| Netflix | #000000 | #000000 | #000000 |
| Slack | #000000 | #f9edff | #f9edff |

## FIX 2: SVG area influence

| Site | SVG % before | SVG % after | Reduction | Foundation before → after |
|------|--------------|-------------|-----------|-------------------------|
| Linear | 63.2% | 1.7% | 61.5pp | #08090a → #08090a |
| Stripe | 95.4% | 10% | 85.4pp | #ffffff → #ffffff |
| Spotify | 75.3% | 24.3% | 51pp | — → — |
| Vercel | 75.4% | 20.6% | 54.8pp | #fafafa → #fafafa |
| Notion | 73% | 4.5% | 68.5pp | #ffffff → #ffffff |
| Framer | 67.4% | 2.5% | 64.9pp | #000000 → #000000 |
| Apple | 73% | 4.1% | 68.9pp | #ffffff → #ffffff |
| Netflix | 72.6% | 8.7% | 63.9pp | #000000 → #000000 |
| Slack | 96.9% | 27.3% | 69.6pp | #f9edff → #f9edff |

## FIX 3: Browser default link colors

| Site | Before primary | After primary | Fixed? |
|------|----------------|---------------|--------|
| Spotify | #0000ee | undefined | yes |
| Framer | #0000ee | #0099ff | yes |

## Summary

- **Improved:** Linear, Stripe, Spotify, Vercel, Notion, Framer, Apple, Slack
- **Regressed:** none
- **Unchanged:** Netflix

## Final palettes

### Linear
- **foundation**: #08090a
- **primary**: #d0d6e0
- **neutral**: #2e2e32

### Stripe
- **foundation**: #ffffff
- **primary**: #533afd
- **secondary**: #ff6118
- **neutral**: #e5edf5

### Spotify
- **neutral**: #333333

### Vercel
- **foundation**: #fafafa
- **primary**: #00dc82
- **secondary**: #7820bc
- **neutral**: #ededed

### Notion
- **foundation**: #ffffff
- **primary**: #0075de
- **secondary**: #f77463
- **neutral**: #191918

### Framer
- **foundation**: #000000
- **primary**: #0099ff
- **secondary**: #fd5d5c
- **neutral**: #222222

### Apple
- **foundation**: #ffffff
- **primary**: #0071e3
- **secondary**: #a4618d
- **neutral**: #6e6e73

### Netflix
- **foundation**: #000000
- **primary**: #e50914
- **neutral**: #3f3f3f

### Slack
- **foundation**: #f9edff
- **primary**: #3d0157
- **secondary**: #f6bbc1
- **neutral**: #ffffff

## Remaining failure patterns

- **foundation_not_dominant_raw_color**: ["Slack"] — Foundation role assigned to a neutral that is not the largest raw area color (often #000000 from SVG fills)
- **no_chromatic_primary**: ["Air India","Spotify"] — No chromatic color received primary role — brand color may be missing from palette
- **top_scored_chroma_excluded**: ["Notion"] — Highest-scored chromatic cluster not in final 8-color palette
- **heavy_product_demo_pages**: [{"site":"Linear","demoShare":50.9}] — Marketing pages with large embedded product UI — demo detection heavily influences scoring
