# Linear Utility Override Validation

Generated: 2026-05-29T16:52:26.331Z

## Validation answers

| # | Question | Result |
|---|----------|--------|
| 1 | Does `#5e6ad2` remain non-utility? | **YES** |
| 2 | Does it survive chromatic filtering (brandChromas)? | **YES** |
| 3 | Does it enter the curated chromatic set? | **YES** |
| 4 | Does it become primary? | **YES** |

## Target cluster (`#5e6ad2`)

- isUtility: **false** (was `true`)
- brandConfidence: **0.307**
- designSystemScore: **0.191**
- hasHero: **true** (override trigger)
- sources: {"hero_background":1,"demo_illustration":2}

## Pipeline trace

- brandChromas count: 3 (was 2)
- brandChromas: #d0d6e0, #5e6ad2, #6d78d5
- chromaDeduped: #d0d6e0
- `#5e6ad2` in brandChromas: **true**
- `#5e6ad2` in chromaDeduped: **false**

## Before vs after palette

| Role | Before | After |
|------|--------|-------|
| foundation | #08090a | #08090a |
| primary | #d0d6e0 | #5e6ad2 |

**Before full palette:** foundation #08090a · primary #d0d6e0

**After full palette:** foundation #08090a · primary #5e6ad2 · neutral #f7f8f8 · neutral #8a8f98 · neutral #e5e5e6 · neutral #23252a · neutral #62666d · neutral #2e2e32

**Curated chromatics after:** #5e6ad2
