# Linear Chromatic Curation Audit

Generated: 2026-05-29T16:49:10.513Z

## Pipeline (pre–role-assignment)

- 1. Split samples: isNeutralHsl(hsl) → neutral vs chromatic
- 2. Cluster chromatics: deltaE < 8 (CHROMA_MERGE_DE)
- 3. Representative hex: sample with peak importance in cluster (NOT area, NOT brandConfidence)
- 4. finalizeCluster: brandConfidence + designSystemScore
- 5. Filter: exclude isUtility clusters from brandChromas
- 6. stripBrowserDefaultLinks on brandChromas
- 7. dedupeHueFamilies: one chromatic per floor(h/30) bucket, keep highest designSystemScore
- 8. Pick primary from chromaDeduped (brandConfidence >= 0.15 or first)
- 9. Pick up to 2 secondaries from chromaDeduped
- 10. Pick up to 4 neutrals by area share
- 11. Fill to 8 slots from fillPool sorted by designSystemScore

## 1. Every extracted chromatic color (raw, pre-cluster)

| Hex | Area | Samples | Hue family | Top sources |
|-----|------|---------|------------|-------------|
| #d0d6e0 | 6,28,054 | 132 | 7 | default×83, demo_navigation×18, demo_sidebar×18 |
| #21b3ff | 5,544 | 1 | 6 | demo_illustration×1 |
| #993b3b | 3,072 | 1 | 0 | demo_illustration×1 |
| #232534 | 3,028 | 2 | 7 | demo_illustration×2 |
| #6d78d5 | 2,169 | 2 | 7 | default×2 |
| #f0bf00 | 2,080 | 10 | 1 | demo_illustration×6, demo_navigation×4 |
| #27a644 | 1,832 | 12 | 4 | demo_illustration×12 |
| #008d2c | 1,176 | 6 | 4 | demo_illustration×6 |
| #00b8cc | 784 | 4 | 6 | demo_navigation×2, demo_illustration×2 |
| #f2c94c | 768 | 3 | 1 | demo_illustration×3 |
| #5e6ad2 | 648 | 3 | 7 | demo_illustration×2, hero_background×1 |
| #d4a600 | 588 | 3 | 1 | demo_illustration×3 |
| #02b8cc | 512 | 2 | 6 | demo_illustration×2 |
| #eb5757 | 440 | 5 | 0 | demo_status×3, demo_navigation×2 |
| #4ea7fc | 392 | 2 | 6 | demo_illustration×2 |
| #e3484e | 100 | 1 | 11 | demo_illustration×1 |
| #6366f1 | 96 | 6 | 7 | demo_status×6 |
| #8b5cf6 | 64 | 4 | 8 | demo_status×4 |
| #10b981 | 32 | 2 | 5 | demo_status×2 |
| #06b6d4 | 16 | 1 | 6 | demo_status×1 |

## 2. Chromatic clusters after LAB merge (ΔE < 8)

_17 clusters total; only 2 pass `isUtilityColor` filter into brandChromas._

| Rank | Hex (rep) | Area | Samples | Brand conf | Design score | Utility? | Status | In brandChromas? |
|------|-----------|------|---------|------------|--------------|----------|--------|------------------|
| 1 | #d0d6e0 | 6,28,054 | 132 | 0.149 | 0.119 | no | **kept** | yes |
| 2 | #6d78d5 | 2,169 | 2 | 0.04 | 0.032 | no | **removed** | yes |
| 3 | #5e6ad2 | 648 | 3 | 0.307 | 0.023 | yes | **removed** | no |
| 4 | #02b8cc | 1,312 | 7 | 0.069 | 0.008 | yes | **removed** | no |
| 5 | #e3484e | 540 | 6 | 0.069 | 0.008 | yes | **removed** | no |
| 6 | #f0bf00 | 2,080 | 10 | 0.04 | 0.005 | yes | **removed** | no |
| 7 | #8b5cf6 | 64 | 4 | 0.04 | 0.005 | yes | **removed** | no |
| 8 | #6366f1 | 96 | 6 | 0.04 | 0.005 | yes | **removed** | no |
| 9 | #10b981 | 32 | 2 | 0.04 | 0.005 | yes | **removed** | no |
| 10 | #27a644 | 1,832 | 12 | 0.04 | 0.005 | yes | **removed** | no |
| 11 | #232534 | 3,028 | 2 | 0.04 | 0.005 | yes | **removed** | no |
| 12 | #f2c94c | 768 | 3 | 0.028 | 0.003 | yes | **removed** | no |
| 13 | #d4a600 | 588 | 3 | 0.028 | 0.003 | yes | **removed** | no |
| 14 | #993b3b | 3,072 | 1 | 0.028 | 0.003 | yes | **removed** | no |
| 15 | #008d2c | 1,176 | 6 | 0.028 | 0.003 | yes | **removed** | no |
| 16 | #21b3ff | 5,544 | 1 | 0.028 | 0.003 | yes | **removed** | no |
| 17 | #4ea7fc | 392 | 2 | 0.028 | 0.003 | yes | **removed** | no |

## 3. Removal reasons (removed clusters only)

### #6d78d5

- Area: 2,169 px² (0% of page)
- Samples: 2
- Brand confidence: 0.04 · Design score: 0.032
- Member hexes in cluster: #6d78d5

- **dedupeHueFamilies() in scoreAndCluster.js lines 170–181**
  - hue family 7 (floor(h/30) bucket); lost to #d0d6e0 with higher designSystemScore

### #5e6ad2

- Area: 648 px² (0% of page)
- Samples: 3
- Brand confidence: 0.307 · Design score: 0.023
- Member hexes in cluster: #5e6ad2

- **isUtilityColor() in sourceClassification.js lines 191–196**
  - demo/utility source occurrences 2/3 (66.7%) >= 60% threshold; demo sources include demo_illustration, demo_navigation, demo_sidebar, demo_status

### #02b8cc

- Area: 1,312 px² (0% of page)
- Samples: 7
- Brand confidence: 0.069 · Design score: 0.008
- Member hexes in cluster: #00b8cc, #02b8cc, #06b6d4

- **isUtilityColor() in sourceClassification.js lines 191–196**
  - demo/utility source occurrences 7/7 (100%) >= 60% threshold; demo sources include demo_illustration, demo_navigation, demo_sidebar, demo_status

### #e3484e

- Area: 540 px² (0% of page)
- Samples: 6
- Brand confidence: 0.069 · Design score: 0.008
- Member hexes in cluster: #eb5757, #e3484e

- **isUtilityColor() in sourceClassification.js line 190**
  - utilityRatio 0.714 >= 0.55

### #f0bf00

- Area: 2,080 px² (0% of page)
- Samples: 10
- Brand confidence: 0.04 · Design score: 0.005
- Member hexes in cluster: #f0bf00

- **isUtilityColor() in sourceClassification.js lines 191–196**
  - demo/utility source occurrences 10/10 (100%) >= 60% threshold; demo sources include demo_illustration, demo_navigation, demo_sidebar, demo_status

### #8b5cf6

- Area: 64 px² (0% of page)
- Samples: 4
- Brand confidence: 0.04 · Design score: 0.005
- Member hexes in cluster: #8b5cf6

- **isUtilityColor() in sourceClassification.js line 190**
  - utilityRatio 1 >= 0.55

### #6366f1

- Area: 96 px² (0% of page)
- Samples: 6
- Brand confidence: 0.04 · Design score: 0.005
- Member hexes in cluster: #6366f1

- **isUtilityColor() in sourceClassification.js line 190**
  - utilityRatio 1 >= 0.55

### #10b981

- Area: 32 px² (0% of page)
- Samples: 2
- Brand confidence: 0.04 · Design score: 0.005
- Member hexes in cluster: #10b981

- **isUtilityColor() in sourceClassification.js line 190**
  - utilityRatio 1 >= 0.55

### #27a644

- Area: 1,832 px² (0% of page)
- Samples: 12
- Brand confidence: 0.04 · Design score: 0.005
- Member hexes in cluster: #27a644

- **isUtilityColor() in sourceClassification.js lines 191–196**
  - demo/utility source occurrences 12/12 (100%) >= 60% threshold; demo sources include demo_illustration, demo_navigation, demo_sidebar, demo_status

### #232534

- Area: 3,028 px² (0% of page)
- Samples: 2
- Brand confidence: 0.04 · Design score: 0.005
- Member hexes in cluster: #232534

- **isUtilityColor() in sourceClassification.js lines 191–196**
  - demo/utility source occurrences 2/2 (100%) >= 60% threshold; demo sources include demo_illustration, demo_navigation, demo_sidebar, demo_status

### #f2c94c

- Area: 768 px² (0% of page)
- Samples: 3
- Brand confidence: 0.028 · Design score: 0.003
- Member hexes in cluster: #f2c94c

- **isUtilityColor() in sourceClassification.js lines 191–196**
  - demo/utility source occurrences 3/3 (100%) >= 60% threshold; demo sources include demo_illustration, demo_navigation, demo_sidebar, demo_status

### #d4a600

- Area: 588 px² (0% of page)
- Samples: 3
- Brand confidence: 0.028 · Design score: 0.003
- Member hexes in cluster: #d4a600

- **isUtilityColor() in sourceClassification.js lines 191–196**
  - demo/utility source occurrences 3/3 (100%) >= 60% threshold; demo sources include demo_illustration, demo_navigation, demo_sidebar, demo_status

### #993b3b

- Area: 3,072 px² (0% of page)
- Samples: 1
- Brand confidence: 0.028 · Design score: 0.003
- Member hexes in cluster: #993b3b

- **isUtilityColor() in sourceClassification.js lines 191–196**
  - demo/utility source occurrences 1/1 (100%) >= 60% threshold; demo sources include demo_illustration, demo_navigation, demo_sidebar, demo_status

### #008d2c

- Area: 1,176 px² (0% of page)
- Samples: 6
- Brand confidence: 0.028 · Design score: 0.003
- Member hexes in cluster: #008d2c

- **isUtilityColor() in sourceClassification.js lines 191–196**
  - demo/utility source occurrences 6/6 (100%) >= 60% threshold; demo sources include demo_illustration, demo_navigation, demo_sidebar, demo_status

### #21b3ff

- Area: 5,544 px² (0.001% of page)
- Samples: 1
- Brand confidence: 0.028 · Design score: 0.003
- Member hexes in cluster: #21b3ff

- **isUtilityColor() in sourceClassification.js lines 191–196**
  - demo/utility source occurrences 1/1 (100%) >= 60% threshold; demo sources include demo_illustration, demo_navigation, demo_sidebar, demo_status

### #4ea7fc

- Area: 392 px² (0% of page)
- Samples: 2
- Brand confidence: 0.028 · Design score: 0.003
- Member hexes in cluster: #4ea7fc

- **isUtilityColor() in sourceClassification.js lines 191–196**
  - demo/utility source occurrences 2/2 (100%) >= 60% threshold; demo sources include demo_illustration, demo_navigation, demo_sidebar, demo_status


## 4. #5e6ad2 deep dive

**Raw extraction:** 3 samples, 648 px²

Sources: hero_background×1, demo_illustration×2

**Own cluster** (not merged — ΔE to #d0d6e0 ≈ 67, above CHROMA_MERGE_DE=8)

**Representative:** `#5e6ad2` (peak importance = 240 from hero_background sample)

**Scores:** brandConfidence=0.307, designSystemScore=0.023, hasHero=true

**Removed because:**

- `buildPalette` line 209–210: `brandChromas = chromaClusters.filter(c => !c.isUtility)`
- `isUtilityColor()` lines 191–196: demo/utility occurrences **2/3 (66.7%)** >= **60%** threshold
- 2 of 3 samples tagged `demo_illustration` (DEMO_SOURCES) despite 1 `hero_background` sample

## 5. Counterfactuals

| Scenario | #5e6ad2 enters palette? | Chromatics selected |
|----------|-------------------------|---------------------|
| Allow 1 extra secondary chromatic slot: secondary slice(0, 2) → slice(0, 3) | **NO** | #d0d6e0 |
| Total palette cap 8 → 9 | **NO** | #d0d6e0 |
| skip dedupeHueFamilies (no 30° bucket limit) | **NO** | #d0d6e0, #6d78d5 |
| remove minimum sample count threshold | **NO** | — |
| cluster representative = highest brandConfidence sample instead of peak importance | **NO** | #000000, #f7f8f8, #8a8f98, #e5e5e6 |
| include isUtility clusters in brandChromas (bypass isUtilityColor gate) | **NO** | #d0d6e0, #02b8cc, #e3484e |

## 6. Conclusion

The exact curation rule excluding brand indigo `#5e6ad2` is **`isUtilityColor()`** in `sourceClassification.js`, applied at **`buildPalette` line 209–210** before hue dedupe or slot allocation.

The cluster is correctly formed with `hasHero=true` and brandConfidence **0.307** (higher than #d0d6e0's 0.149), but 2/3 samples carry `demo_illustration` source tags, triggering the 60% demo-source occurrence gate.

**Slot limits, sample count thresholds, and representative election are NOT the cause.** Increasing chromatic slots or removing sample minimums does not help. Changing representative to brandConfidence does not help — #5e6ad2 already wins representative election.

If the utility filter were bypassed, `#5e6ad2` would enter `brandChromas` but still lose `dedupeHueFamilies` to `#d0d6e0` in hue family 7 on designSystemScore (0.119 vs 0.029) — a secondary failure mode.
