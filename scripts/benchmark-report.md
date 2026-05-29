# Prism Palette Benchmark Report
Generated: 2026-05-29T16:30:03.515Z

## Cross-site failure patterns
- **no_chromatic_primary**: No chromatic color received primary role — brand color may be missing from palette (["Air India"])
- **top_scored_chroma_excluded**: Highest-scored chromatic cluster not in final 8-color palette (["Notion"])
- **heavy_product_demo_pages**: Marketing pages with large embedded product UI — demo detection heavily influences scoring ([{"site":"Linear","demoShare":42.2}])

Additional systematic patterns observed:
- **#000000 foundation on 8/9 successful sites** — SVG fill area dominates raw ranking; true page backgrounds (#08090a, #121212) lose to pure black icon fills
- **#0000ee link-blue as primary** on Framer/Spotify — default <a> color treated as brand chromatic
- **Spotify partial crawl** — only 1 scroll section (760 samples); likely cookie/consent gate blocked full-page scroll
- **Air India extraction failed** — HTTP/2 protocol error in headless Chromium (geo/bot protection)

---
## Air India
URL: https://www.airindia.com/
Samples: 0 | Sections: 1 | Mode: foundation
**EXTRACTION FAILED**

---
## Apple
URL: https://www.apple.com/
Samples: 4972 | Sections: 16 | Mode: brand

### Final palette
- **#000000** (foundation) score=0.895 area=74.2%
  - Dominant neutral surface (74.2% area share, 16 sections)
  - Sources: navigation×1464, illustration×588, default×206
  - Curator hint: neutral
  - designSystemScore=0.895, brandConfidence=0.767
- **#0071e3** (primary) score=0.107 area=0%
  - Highest brand-confidence chromatic in curated set
  - Sources: default×18, major_container×9, promo_content×1
  - Curator hint: primary
  - designSystemScore=0.107, brandConfidence=0.121
- **#2997ff** (secondary) score=0.068 area=0%
  - Additional chromatic hue family after primary deduplication
  - Sources: default×44
  - Curator hint: secondary
  - designSystemScore=0.068, brandConfidence=0.083
- **#de9444** (secondary) score=0.034 area=0%
  - Additional chromatic hue family after primary deduplication
  - Sources: repeated_section_bg×2
  - Curator hint: secondary
  - designSystemScore=0.034, brandConfidence=0.042
- **#ffffff** (neutral) score=0.924 area=25%
  - Neutral cluster ranked by area (25%) and design-system score
  - Sources: navigation×1376, default×117, primary_button×32
  - Curator hint: neutral
  - designSystemScore=0.924, brandConfidence=1
- **#1d1d1f** (neutral) score=0.6 area=0.7%
  - Neutral cluster ranked by area (0.7%) and design-system score
  - Sources: navigation×656, default×90, card×51
  - Curator hint: neutral
  - designSystemScore=0.6, brandConfidence=0.717
- **#d2d2d7** (neutral) score=0.133 area=0%
  - Neutral cluster ranked by area (0%) and design-system score
  - Sources: primary_button×1
  - Curator hint: neutral
  - designSystemScore=0.133, brandConfidence=0.279
- **#271810** (neutral) score=0.034 area=0%
  - Neutral cluster ranked by area (0%) and design-system score
  - Sources: repeated_section_bg×2
  - Curator hint: neutral
  - designSystemScore=0.034, brandConfidence=0.042

### Top 10 raw colors (by area)
1. **#000000** area=938018887 hits=2406 [navigation(1464), illustration(588), default(206), primary_button(49)]
2. **#ffffff** area=235532166 hits=1554 [navigation(1376), default(105), illustration(32), global_background(16)]
3. **#f5f5f7** area=80222020 hits=77 [primary_button(16), repeated_section_bg(14), default(12), major_container(11)]
4. **#1d1d1f** area=6467240 hits=820 [navigation(656), default(90), card(51), chart(10)]
5. **#161617** area=1847328 hits=32 [major_container(16), primary_button(16)]
6. **#2997ff** area=622449 hits=44 [default(44)]
7. **#271810** area=195625 hits=2 [repeated_section_bg(2)]
8. **#f4f8fb** area=195625 hits=2 [repeated_section_bg(2)]
9. **#3397d4** area=195625 hits=2 [repeated_section_bg(2)]
10. **#de9444** area=195156 hits=2 [repeated_section_bg(2)]

### Top 10 scored colors
1. **#ffffff** score=0.9238 area=25% util=no nav=yes [navigation×1376, default×117, primary_button×32]
2. **#000000** score=0.895 area=74.24% util=no nav=yes [navigation×1464, illustration×588, default×206]
3. **#1d1d1f** score=0.5999 area=0.66% util=no nav=yes [navigation×656, default×90, card×51]
4. **#d2d2d7** score=0.1333 area=0% util=no nav=no [primary_button×1]
5. **#0071e3** score=0.107 area=0% util=no nav=no [default×18, major_container×9, promo_content×1]
6. **#2997ff** score=0.0677 area=0.05% util=no nav=no [default×44]
7. **#271810** score=0.0338 area=0.02% util=no nav=no [repeated_section_bg×2]
8. **#3397d4** score=0.0338 area=0.02% util=no nav=no [repeated_section_bg×2]
9. **#de9444** score=0.0338 area=0.02% util=no nav=no [repeated_section_bg×2]
10. **#6e6e73** score=0.0206 area=0% util=no nav=no [chart×1, default×1]

---
## Framer
URL: https://www.framer.com/
Samples: 5400 | Sections: 19 | Mode: brand

### Final palette
- **#000000** (foundation) score=0.872 area=99.2%
  - Dominant neutral surface (99.2% area share, 19 sections)
  - Sources: illustration×1665, navigation×1596, default×691
  - Curator hint: neutral
  - designSystemScore=0.872, brandConfidence=0.717
- **#0000ee** (primary) score=0.366 area=0%
  - Highest brand-confidence chromatic in curated set
  - Present in website navigation
  - Sources: navigation×247, default×52
  - Curator hint: primary
  - designSystemScore=0.366, brandConfidence=0.433
- **#0099ff** (secondary) score=0.081 area=0%
  - Additional chromatic hue family after primary deduplication
  - Sources: major_container×10, default×7
  - Curator hint: secondary
  - designSystemScore=0.081, brandConfidence=0.096
- **#0055ff** (secondary) score=0.03 area=0%
  - Additional chromatic hue family after primary deduplication
  - Sources: major_container×2
  - Curator hint: secondary
  - designSystemScore=0.03, brandConfidence=0.038
- **#ffffff** (neutral) score=0.513 area=0.2%
  - Neutral cluster ranked by area (0.2%) and design-system score
  - Sources: navigation×323, default×206, major_container×78
  - Curator hint: neutral
  - designSystemScore=0.513, brandConfidence=0.717
- **#171717** (neutral) score=0.108 area=0.5%
  - Neutral cluster ranked by area (0.5%) and design-system score
  - Sources: major_container×17, repeated_section_bg×4, blog_card×4
  - Curator hint: neutral
  - designSystemScore=0.108, brandConfidence=0.111
- **#222222** (neutral) score=0.093 area=0%
  - Neutral cluster ranked by area (0%) and design-system score
  - Sources: major_container×45, default×3, repeated_section_bg×2
  - Curator hint: neutral
  - designSystemScore=0.093, brandConfidence=0.107
- **#999999** (neutral) score=0.063 area=0%
  - Neutral cluster ranked by area (0%) and design-system score
  - Sources: default×57, logo×1
  - Curator hint: neutral
  - designSystemScore=0.063, brandConfidence=0.069

### Top 10 raw colors (by area)
1. **#000000** area=2245865269 hits=4262 [illustration(1665), navigation(1596), default(688), logo(199)]
2. **#111111** area=7401440 hits=10 [major_container(6), blog_card(4)]
3. **#080808** area=7375717 hits=16 [major_container(11), default(3), repeated_section_bg(2)]
4. **#ffffff** area=5292410 hits=615 [navigation(323), default(206), major_container(78), hero_background(3)]
5. **#171717** area=3654561 hits=8 [major_container(6), repeated_section_bg(2)]
6. **#0084ff** area=467060 hits=2 [major_container(2)]
7. **#0000ee** area=257074 hits=299 [navigation(247), default(52)]
8. **#089aff** area=172500 hits=2 [major_container(2)]
9. **#141414** area=99960 hits=2 [major_container(2)]
10. **#999999** area=46509 hits=58 [default(57), logo(1)]

### Top 10 scored colors
1. **#000000** score=0.8725 area=99.23% util=no nav=yes [illustration×1665, navigation×1596, default×691]
2. **#ffffff** score=0.5127 area=0.23% util=no nav=yes [navigation×323, default×206, major_container×78]
3. **#0000ee** score=0.3664 area=0.01% util=no nav=yes [navigation×247, default×52]
4. **#171717** score=0.1075 area=0.49% util=no nav=no [major_container×17, repeated_section_bg×4, blog_card×4]
5. **#242424** score=0.0927 area=0% util=no nav=no [major_container×45, default×3, repeated_section_bg×2]
6. **#0099ff** score=0.0815 area=0.01% util=no nav=no [major_container×10, default×7]
7. **#999999** score=0.0634 area=0% util=no nav=no [default×57, logo×1]
8. **#888888** score=0.0483 area=0% util=no nav=no [default×10, major_container×3, card×2]
9. **#cccccc** score=0.0299 area=0% util=no nav=no [default×18, card×4]
10. **#0084ff** score=0.0296 area=0.02% util=no nav=no [major_container×2]

---
## Linear
URL: https://linear.app/
Samples: 4275 | Sections: 24 | Mode: brand

### Final palette
- **#000000** (foundation) score=0.76 area=99.3%
  - Dominant neutral surface (99.3% area share, 24 sections)
  - Sources: navigation×695, demo_illustration×621, illustration×389
  - Curator hint: neutral
  - designSystemScore=0.76, brandConfidence=0.467
- **#5e6ad2** (primary) score=0.154 area=0%
  - Highest brand-confidence chromatic in curated set
  - Appears in hero region
  - Sources: hero_background×2, demo_illustration×2
  - Curator hint: primary
  - designSystemScore=0.154, brandConfidence=0.308
- **#f7f8f8** (neutral) score=0.561 area=0.4%
  - Neutral cluster ranked by area (0.4%) and design-system score
  - Sources: default×588, navigation×431, demo_illustration×86
  - Curator hint: neutral
  - designSystemScore=0.561, brandConfidence=0.517
- **#8a8f98** (neutral) score=0.425 area=0%
  - Neutral cluster ranked by area (0%) and design-system score
  - Sources: navigation×168, default×61, demo_navigation×6
  - Curator hint: neutral
  - designSystemScore=0.425, brandConfidence=0.483
- **#e5e5e6** (neutral) score=0.338 area=0%
  - Neutral cluster ranked by area (0%) and design-system score
  - Sources: illustration×100, demo_illustration×25, navigation×24
  - Curator hint: neutral
  - designSystemScore=0.338, brandConfidence=0.433
- **#23252a** (neutral) score=0.326 area=0%
  - Neutral cluster ranked by area (0%) and design-system score
  - Sources: navigation×24, demo_illustration×3, demo_sidebar×2
  - Curator hint: neutral
  - designSystemScore=0.326, brandConfidence=0.433
- **#62666d** (neutral) score=0.12 area=0.1%
  - Neutral cluster ranked by area (0.1%) and design-system score
  - Sources: default×137, demo_illustration×127, illustration×30
  - Curator hint: neutral
  - designSystemScore=0.12, brandConfidence=0.15
- **#2e2e32** (neutral) score=0.06 area=0.1%
  - Neutral cluster ranked by area (0.1%) and design-system score
  - Sources: illustration×39, default×9, demo_illustration×1
  - Curator hint: neutral
  - designSystemScore=0.06, brandConfidence=0.075

### Top 10 raw colors (by area)
1. **#000000** area=1641475307 hits=1838 [navigation(671), demo_illustration(616), illustration(345), default(62)]
2. **#08090a** area=942879398 hits=140 [global_background(49), illustration(44), navigation(24), major_container(23)]
3. **#f7f8f8** area=9699027 hits=984 [default(514), navigation(431), demo_sidebar(13), status_chip(10)]
4. **#0f1011** area=3938468 hits=5 [demo_illustration(5)]
5. **#2e2e32** area=2947725 hits=40 [illustration(39), demo_illustration(1)]
6. **#090a0b** area=2592000 hits=3 [major_container(2), global_background(1)]
7. **#101112** area=2592000 hits=3 [major_container(2), global_background(1)]
8. **#62666d** area=2287150 hits=308 [default(137), demo_illustration(127), illustration(30), demo_navigation(11)]
9. **#121314** area=2010624 hits=3 [major_container(2), global_background(1)]
10. **#3e3e44** area=1383146 hits=19 [illustration(19)]

### Top 10 scored colors
1. **#08090a** score=0.76 area=99.25% util=no nav=yes [navigation×695, demo_illustration×621, illustration×389]
2. **#f7f8f8** score=0.5609 area=0.38% util=no nav=yes [default×588, navigation×431, demo_illustration×86]
3. **#8a8f98** score=0.4247 area=0.02% util=no nav=yes [navigation×168, default×61, demo_navigation×6]
4. **#e5e5e6** score=0.3384 area=0% util=no nav=yes [illustration×100, demo_illustration×25, navigation×24]
5. **#23252a** score=0.326 area=0% util=no nav=yes [navigation×24, demo_illustration×3, demo_sidebar×2]
6. **#5e6ad2** score=0.1542 area=0% util=no nav=no [hero_background×2, demo_illustration×2]
7. **#62666d** score=0.1197 area=0.09% util=no nav=no [default×137, demo_illustration×127, illustration×30]
8. **#d0d6e0** score=0.1195 area=0.05% util=no nav=no [default×87, demo_navigation×18, demo_sidebar×16]
9. **#323334** score=0.0604 area=0.11% util=no nav=no [illustration×39, default×9, demo_illustration×1]
10. **#00b8cc** score=0.0588 area=0% util=yes nav=no [demo_illustration×6, demo_navigation×4, demo_status×2]

---
## Netflix
URL: https://www.netflix.com/
Samples: 769 | Sections: 5 | Mode: brand

### Final palette
- **#000000** (foundation) score=0.79 area=96.6%
  - Dominant neutral surface (96.6% area share, 5 sections)
  - Sources: illustration×292, default×47, primary_button×19
  - Curator hint: neutral
  - designSystemScore=0.79, brandConfidence=0.533
- **#e50914** (primary) score=0.412 area=0%
  - Highest brand-confidence chromatic in curated set
  - Appears in hero region
  - Linked to CTA/button context
  - Sources: illustration×3, primary_button×3, hero_background×1
  - Curator hint: primary
  - designSystemScore=0.412, brandConfidence=0.67
- **#ffffff** (neutral) score=0.682 area=2.2%
  - Neutral cluster ranked by area (2.2%) and design-system score
  - Sources: default×284, illustration×36, primary_button×22
  - Curator hint: neutral
  - designSystemScore=0.682, brandConfidence=0.533
- **#161616** (neutral) score=0.256 area=0.1%
  - Neutral cluster ranked by area (0.1%) and design-system score
  - Sources: hero_background×3, major_container×3
  - Curator hint: neutral
  - designSystemScore=0.256, brandConfidence=0.387
- **#2d2d2d** (neutral) score=0.203 area=0.7%
  - Neutral cluster ranked by area (0.7%) and design-system score
  - Sources: major_container×15, default×6
  - Curator hint: neutral
  - designSystemScore=0.203, brandConfidence=0.21
- **#232323** (neutral) score=0.203 area=0.3%
  - Neutral cluster ranked by area (0.3%) and design-system score
  - Sources: major_container×7, primary_button×6
  - Curator hint: neutral
  - designSystemScore=0.203, brandConfidence=0.323
- **#808080** (neutral) score=0.134 area=0%
  - Neutral cluster ranked by area (0%) and design-system score
  - Sources: default×6
  - Curator hint: neutral
  - designSystemScore=0.134, brandConfidence=0.137

### Top 10 raw colors (by area)
1. **#000000** area=174638793 hits=371 [illustration(292), default(47), primary_button(19), global_background(10)]
2. **#ffffff** area=4065334 hits=345 [default(284), illustration(36), primary_button(22), chart(3)]
3. **#2d2d2d** area=1153152 hits=12 [major_container(12)]
4. **#232323** area=544320 hits=12 [primary_button(6), major_container(6)]
5. **#161616** area=95358 hits=6 [hero_background(3), major_container(3)]
6. **#e50914** area=56047 hits=7 [illustration(3), primary_button(3), hero_background(1)]
7. **#414141** area=47004 hits=6 [default(6)]
8. **#363636** area=45360 hits=1 [major_container(1)]
9. **#3e3e3e** area=45360 hits=1 [major_container(1)]
10. **#343434** area=45360 hits=1 [major_container(1)]

### Top 10 scored colors
1. **#000000** score=0.79 area=96.6% util=no nav=no [illustration×292, default×47, primary_button×19]
2. **#ffffff** score=0.6817 area=2.25% util=no nav=no [default×284, illustration×36, primary_button×22]
3. **#e50914** score=0.4121 area=0.03% util=no nav=no [illustration×3, primary_button×3, hero_background×1]
4. **#161616** score=0.2555 area=0.05% util=no nav=no [hero_background×3, major_container×3]
5. **#363636** score=0.203 area=0.74% util=no nav=no [major_container×15, default×6]
6. **#232323** score=0.2026 area=0.33% util=no nav=no [major_container×7, primary_button×6]
7. **#808080** score=0.1343 area=0% util=no nav=no [default×6]

---
## Notion
URL: https://www.notion.so/
Samples: 2972 | Sections: 12 | Mode: brand

### Final palette
- **#000000** (foundation) score=1.007 area=74.3%
  - Dominant neutral surface (74.3% area share, 12 sections)
  - Sources: illustration×874, navigation×559, chart×380
  - Curator hint: neutral
  - designSystemScore=1.007, brandConfidence=1.017
- **#0075de** (primary) score=0.3 area=0%
  - Highest brand-confidence chromatic in curated set
  - Present in website navigation
  - Sources: navigation×11, default×10, chart×4
  - Curator hint: primary
  - designSystemScore=0.3, brandConfidence=0.433
- **#455dd3** (secondary) score=0.151 area=0%
  - Additional chromatic hue family after primary deduplication
  - Sources: navigation×3, chart×1
  - Curator hint: secondary
  - designSystemScore=0.151, brandConfidence=0.267
- **#62aef0** (secondary) score=0.138 area=0.1%
  - Additional chromatic hue family after primary deduplication
  - Sources: major_container×4, chart×2, illustration×2
  - Curator hint: secondary
  - designSystemScore=0.138, brandConfidence=0.15
- **#f77463** (secondary) score=0.078 area=0.1%
  - Additional chromatic hue family after primary deduplication
  - Sources: chart×2, major_container×2
  - Curator hint: secondary
  - designSystemScore=0.078, brandConfidence=0.083
- **#f6f5f4** (neutral) score=0.662 area=20.9%
  - Neutral cluster ranked by area (20.9%) and design-system score
  - Sources: navigation×101, chart×46, major_container×45
  - Curator hint: neutral
  - designSystemScore=0.662, brandConfidence=1.017
- **#02093a** (neutral) score=0.177 area=0.6%
  - Neutral cluster ranked by area (0.6%) and design-system score
  - Sources: navigation×3, promo_content×3, logo×3
  - Curator hint: neutral
  - designSystemScore=0.177, brandConfidence=0.3
- **#191918** (neutral) score=0.096 area=3.5%
  - Neutral cluster ranked by area (3.5%) and design-system score
  - Sources: global_background×3, major_container×2, status_chip×1
  - Curator hint: neutral
  - designSystemScore=0.096, brandConfidence=0.117

### Top 10 raw colors (by area)
1. **#000000** area=699897283 hits=2504 [illustration(874), navigation(559), chart(380), default(363)]
2. **#ffffff** area=152771494 hits=171 [navigation(38), major_container(38), repeated_section_bg(29), chart(19)]
3. **#f6f5f4** area=41644334 hits=120 [navigation(63), chart(27), illustration(13), repeated_section_bg(9)]
4. **#191918** area=32631926 hits=6 [global_background(3), major_container(2), status_chip(1)]
5. **#02093a** area=5639539 hits=13 [navigation(3), promo_content(3), logo(3), repeated_section_bg(2)]
6. **#2537b1** area=3642480 hits=24 [illustration(24)]
7. **#f7f7f5** area=2277838 hits=8 [major_container(5), repeated_section_bg(3)]
8. **#62aef0** area=1098202 hits=8 [major_container(4), chart(2), illustration(2)]
9. **#f77463** area=552511 hits=4 [chart(2), major_container(2)]
10. **#2a9d99** area=547531 hits=4 [chart(2), major_container(2)]

### Top 10 scored colors
1. **#000000** score=1.0075 area=74.28% util=no nav=yes [illustration×874, navigation×559, chart×380]
2. **#ffffff** score=0.6623 area=20.91% util=no nav=yes [navigation×101, chart×46, major_container×45]
3. **#097fe8** score=0.3004 area=0.01% util=no nav=yes [navigation×11, default×10, chart×4]
4. **#02093a** score=0.1774 area=0.6% util=no nav=yes [navigation×3, promo_content×3, logo×3]
5. **#455dd3** score=0.1514 area=0% util=no nav=yes [navigation×3, chart×1]
6. **#62aef0** score=0.1382 area=0.12% util=no nav=no [major_container×4, chart×2, illustration×2]
7. **#a39e98** score=0.1372 area=0% util=no nav=yes [illustration×24, navigation×10]
8. **#191918** score=0.0963 area=3.46% util=no nav=no [global_background×3, major_container×2, status_chip×1]
9. **#f77463** score=0.0779 area=0.06% util=no nav=no [chart×2, major_container×2]
10. **#2a9d99** score=0.0779 area=0.06% util=no nav=no [chart×2, major_container×2]

---
## Slack
URL: https://slack.com/
Samples: 2325 | Sections: 17 | Mode: brand

### Final palette
- **#000000** (foundation) score=1.007 area=97.6%
  - Dominant neutral surface (97.6% area share, 17 sections)
  - Sources: navigation×615, illustration×466, default×150
  - Curator hint: neutral
  - designSystemScore=1.007, brandConfidence=1.017
- **#3d0157** (primary) score=0.295 area=0%
  - Highest brand-confidence chromatic in curated set
  - Linked to CTA/button context
  - Sources: primary_button×52
  - Curator hint: accent
  - designSystemScore=0.295, brandConfidence=0.42
- **#611f69** (secondary) score=0.316 area=0%
  - Additional chromatic hue family after primary deduplication
  - Sources: promo_content×17, navigation×17, default×5
  - Curator hint: primary
  - designSystemScore=0.316, brandConfidence=0.417
- **#1264a3** (secondary) score=0.152 area=0%
  - Additional chromatic hue family after primary deduplication
  - Sources: promo_content×51, card×21, default×10
  - Curator hint: secondary
  - designSystemScore=0.152, brandConfidence=0.168
- **#f6bbc1** (secondary) score=0.032 area=0%
  - Additional chromatic hue family after primary deduplication
  - Sources: promo_content×2
  - Curator hint: secondary
  - designSystemScore=0.032, brandConfidence=0.04
- **#1d1d1d** (neutral) score=0.638 area=0.1%
  - Neutral cluster ranked by area (0.1%) and design-system score
  - Sources: navigation×187, default×49, illustration×7
  - Curator hint: neutral
  - designSystemScore=0.638, brandConfidence=0.967
- **#ffffff** (neutral) score=0.591 area=0.5%
  - Neutral cluster ranked by area (0.5%) and design-system score
  - Sources: navigation×41, promo_content×14, default×13
  - Curator hint: neutral
  - designSystemScore=0.591, brandConfidence=1
- **#f9edff** (neutral) score=0.186 area=0.9%
  - Neutral cluster ranked by area (0.9%) and design-system score
  - Sources: repeated_section_bg×24, major_container×13, promo_content×6
  - Curator hint: neutral
  - designSystemScore=0.186, brandConfidence=0.181

### Top 10 raw colors (by area)
1. **#000000** area=1051538772 hits=1616 [navigation(615), illustration(466), default(150), promo_content(143)]
2. **#f9edff** area=8839992 hits=24 [repeated_section_bg(24)]
3. **#ffffff** area=5341744 hits=98 [navigation(41), promo_content(14), default(13), card(13)]
4. **#4a154b** area=5162400 hits=7 [repeated_section_bg(5), major_container(2)]
5. **#481a54** area=3685334 hits=33 [default(23), major_container(5), marketing_banner(4), navigation(1)]
6. **#1d1c1d** area=575417 hits=55 [default(48), illustration(7)]
7. **#1264a3** area=397794 hits=88 [promo_content(51), card(21), default(10), logo(4)]
8. **#f9f0ff** area=360147 hits=19 [major_container(13), promo_content(6)]
9. **#1d1d1d** area=333388 hits=189 [navigation(187), hero_cta(1), default(1)]
10. **#611f69** area=178642 hits=42 [promo_content(17), navigation(17), default(5), major_container(3)]

### Top 10 scored colors
1. **#000000** score=1.0075 area=97.59% util=no nav=yes [navigation×615, illustration×466, default×150]
2. **#1d1d1d** score=0.6376 area=0.08% util=no nav=yes [navigation×187, default×49, illustration×7]
3. **#ffffff** score=0.5908 area=0.5% util=no nav=yes [navigation×41, promo_content×14, default×13]
4. **#611f69** score=0.3164 area=0.02% util=no nav=yes [promo_content×17, navigation×17, default×5]
5. **#3d0157** score=0.2945 area=0.01% util=no nav=no [primary_button×52]
6. **#481a54** score=0.2812 area=0.82% util=no nav=yes [default×23, major_container×7, repeated_section_bg×5]
7. **#ebeaeb** score=0.2648 area=0% util=no nav=no [hero_cta×2, card×1]
8. **#f2defe** score=0.2083 area=0% util=no nav=no [primary_button×7]
9. **#f9f0ff** score=0.1857 area=0.85% util=no nav=no [repeated_section_bg×24, major_container×13, promo_content×6]
10. **#eac8fe** score=0.1682 area=0% util=no nav=no [default×13]

---
## Spotify
URL: https://www.spotify.com/
Samples: 760 | Sections: 1 | Mode: brand

### Final palette
- **#0000ee** (primary) score=0.31 area=0%
  - Highest brand-confidence chromatic in curated set
  - Present in website navigation
  - Sources: default×1, navigation×1
  - Curator hint: primary
  - designSystemScore=0.31, brandConfidence=0.417
- **#1ed760** (secondary) score=0.226 area=0.1%
  - Additional chromatic hue family after primary deduplication
  - Sources: major_container×10
  - Curator hint: secondary
  - designSystemScore=0.226, brandConfidence=0.217
- **#3d8282** (secondary) score=0.219 area=0.2%
  - Additional chromatic hue family after primary deduplication
  - Sources: major_container×2
  - Curator hint: secondary
  - designSystemScore=0.219, brandConfidence=0.217
- **#000000** (neutral) score=0.88 area=82.1%
  - Neutral cluster ranked by area (82.1%) and design-system score
  - Sources: illustration×280, navigation×50, primary_button×44
  - Curator hint: neutral
  - designSystemScore=0.88, brandConfidence=0.733
- **#b3b3b3** (neutral) score=0.579 area=3.3%
  - Neutral cluster ranked by area (3.3%) and design-system score
  - Sources: default×66, card×45, navigation×30
  - Curator hint: neutral
  - designSystemScore=0.579, brandConfidence=0.75
- **#1f1f1f** (neutral) score=0.437 area=0.5%
  - Neutral cluster ranked by area (0.5%) and design-system score
  - Sources: major_container×3, navigation×3, primary_button×1
  - Curator hint: neutral
  - designSystemScore=0.437, brandConfidence=0.683
- **#ffffff** (neutral) score=0.421 area=1.4%
  - Neutral cluster ranked by area (1.4%) and design-system score
  - Sources: card×69, default×25, illustration×15
  - Curator hint: neutral
  - designSystemScore=0.421, brandConfidence=0.5
- **#121212** (neutral) score=0.32 area=9.5%
  - Neutral cluster ranked by area (9.5%) and design-system score
  - Sources: global_background×2, navigation×1
  - Curator hint: neutral
  - designSystemScore=0.32, brandConfidence=0.417

### Top 10 raw colors (by area)
1. **#000000** area=20511879 hits=417 [illustration(280), navigation(50), primary_button(44), card(27)]
2. **#121212** area=2363664 hits=3 [global_background(2), navigation(1)]
3. **#b3b3b3** area=827257 hits=167 [default(66), card(45), navigation(30), illustration(20)]
4. **#ffffff** area=341432 hits=128 [card(69), default(25), illustration(15), navigation(12)]
5. **#535353** area=277760 hits=1 [major_container(1)]
6. **#1f1f1f** area=112749 hits=7 [major_container(3), navigation(3), primary_button(1)]
7. **#a76807** area=29412 hits=1 [major_container(1)]
8. **#083058** area=29412 hits=1 [major_container(1)]
9. **#318099** area=29412 hits=1 [major_container(1)]
10. **#7858d0** area=29412 hits=1 [major_container(1)]

### Top 10 scored colors
1. **#000000** score=0.88 area=82.06% util=no nav=yes [illustration×280, navigation×50, primary_button×44]
2. **#b3b3b3** score=0.5791 area=3.31% util=no nav=yes [default×66, card×45, navigation×30]
3. **#1f1f1f** score=0.4373 area=0.45% util=no nav=yes [major_container×3, navigation×3, primary_button×1]
4. **#ffffff** score=0.4206 area=1.37% util=no nav=yes [card×69, default×25, illustration×15]
5. **#7c7c7c** score=0.3392 area=0.15% util=no nav=yes [navigation×7, major_container×1]
6. **#121212** score=0.3195 area=9.46% util=no nav=yes [global_background×2, navigation×1]
7. **#0000ee** score=0.3101 area=0.01% util=no nav=yes [default×1, navigation×1]
8. **#1ed760** score=0.2259 area=0.09% util=no nav=no [major_container×10]
9. **#3d8282** score=0.2194 area=0.24% util=no nav=no [major_container×2]
10. **#535353** score=0.2187 area=1.11% util=no nav=no [major_container×1]

---
## Stripe
URL: https://stripe.com/
Samples: 3011 | Sections: 23 | Mode: brand

### Final palette
- **#000000** (foundation) score=0.887 area=95.7%
  - Dominant neutral surface (95.7% area share, 23 sections)
  - Sources: chart×922, illustration×508, promo_content×155
  - Curator hint: neutral
  - designSystemScore=0.887, brandConfidence=0.75
- **#533afd** (primary) score=0.302 area=0%
  - Highest brand-confidence chromatic in curated set
  - Appears in hero region
  - Present in website navigation
  - Sources: illustration×16, default×6, navigation×2
  - Curator hint: primary
  - designSystemScore=0.302, brandConfidence=0.561
- **#c2c8f1** (secondary) score=0.138 area=0%
  - Additional chromatic hue family after primary deduplication
  - Sources: primary_button×2
  - Curator hint: secondary
  - designSystemScore=0.138, brandConfidence=0.284
- **#ff6118** (secondary) score=0.075 area=0%
  - Additional chromatic hue family after primary deduplication
  - Sources: chart×10, illustration×9, card×8
  - Curator hint: secondary
  - designSystemScore=0.075, brandConfidence=0.093
- **#ffffff** (neutral) score=0.336 area=4%
  - Neutral cluster ranked by area (4%) and design-system score
  - Sources: illustration×100, chart×47, repeated_section_bg×20
  - Curator hint: neutral
  - designSystemScore=0.336, brandConfidence=0.414
- **#061b31** (neutral) score=0.276 area=0%
  - Neutral cluster ranked by area (0%) and design-system score
  - Sources: chart×132, card×54, navigation×15
  - Curator hint: neutral
  - designSystemScore=0.276, brandConfidence=0.353
- **#031323** (neutral) score=0.109 area=0%
  - Neutral cluster ranked by area (0%) and design-system score
  - Sources: navigation×1
  - Curator hint: neutral
  - designSystemScore=0.109, brandConfidence=0.225
- **#e5edf5** (neutral) score=0.015 area=0.2%
  - Neutral cluster ranked by area (0.2%) and design-system score
  - Sources: chart×66, major_container×12, illustration×5
  - Utility-heavy (36% utility sources)
  - Curator hint: neutral
  - designSystemScore=0.015, brandConfidence=0.111

### Top 10 raw colors (by area)
1. **#000000** area=2164488273 hits=1823 [chart(922), illustration(506), promo_content(155), default(150)]
2. **#ffffff** area=89574925 hits=156 [illustration(79), chart(27), repeated_section_bg(20), major_container(18)]
3. **#e5edf5** area=4648757 hits=77 [chart(58), major_container(12), illustration(3), logo(2)]
4. **#f8fafd** area=1454708 hits=13 [chart(13)]
5. **#061b31** area=569143 hits=226 [chart(132), card(54), navigation(15), illustration(13)]
6. **#64748d** area=255548 hits=99 [chart(46), default(29), card(18), illustration(6)]
7. **#81b81a** area=207591 hits=2 [promo_content(2)]
8. **#000eff** area=207591 hits=2 [promo_content(2)]
9. **#50617a** area=173615 hits=158 [chart(108), card(49), default(1)]
10. **#7d8ba4** area=66883 hits=11 [default(11)]

### Top 10 scored colors
1. **#000000** score=0.8875 area=95.68% util=no nav=yes [chart×922, illustration×508, promo_content×155]
2. **#ffffff** score=0.336 area=4.03% util=no nav=yes [illustration×100, chart×47, repeated_section_bg×20]
3. **#533afd** score=0.3021 area=0% util=no nav=yes [illustration×16, default×6, navigation×2]
4. **#061b31** score=0.2757 area=0.03% util=no nav=yes [chart×132, card×54, navigation×15]
5. **#c2c8f1** score=0.1384 area=0% util=no nav=no [primary_button×2]
6. **#031323** score=0.1085 area=0% util=no nav=yes [navigation×1]
7. **#64748d** score=0.0982 area=0.01% util=no nav=no [chart×50, default×29, card×22]
8. **#e5edf5** score=0.0981 area=0.21% util=yes nav=no [chart×66, major_container×12, illustration×5]
9. **#50617a** score=0.0915 area=0.01% util=yes nav=no [chart×117, card×63, default×1]
10. **#ff6201** score=0.075 area=0% util=no nav=no [chart×10, illustration×9, card×8]

---
## Vercel
URL: https://vercel.com/
Samples: 2193 | Sections: 3 | Mode: brand

### Final palette
- **#000000** (foundation) score=0.985 area=74.1%
  - Dominant neutral surface (74.1% area share, 3 sections)
  - Sources: navigation×700, illustration×317, default×16
  - Curator hint: neutral
  - designSystemScore=0.985, brandConfidence=0.967
- **#00dc82** (primary) score=0.309 area=0%
  - Highest brand-confidence chromatic in curated set
  - Present in website navigation
  - Sources: navigation×3
  - Curator hint: primary
  - designSystemScore=0.309, brandConfidence=0.417
- **#ff3e00** (secondary) score=0.309 area=0%
  - Additional chromatic hue family after primary deduplication
  - Sources: navigation×3
  - Curator hint: secondary
  - designSystemScore=0.309, brandConfidence=0.417
- **#7820bc** (secondary) score=0.148 area=0%
  - Additional chromatic hue family after primary deduplication
  - Sources: default×2
  - Curator hint: secondary
  - designSystemScore=0.148, brandConfidence=0.15
- **#171717** (neutral) score=0.704 area=2.5%
  - Neutral cluster ranked by area (2.5%) and design-system score
  - Sources: navigation×242, default×211, illustration×13
  - Curator hint: neutral
  - designSystemScore=0.704, brandConfidence=1
- **#ffffff** (neutral) score=0.595 area=22.4%
  - Neutral cluster ranked by area (22.4%) and design-system score
  - Sources: default×18, major_container×8, global_background×7
  - Curator hint: neutral
  - designSystemScore=0.595, brandConfidence=0.983
- **#4d4d4d** (neutral) score=0.56 area=1%
  - Neutral cluster ranked by area (1%) and design-system score
  - Sources: navigation×447, default×11, promo_content×6
  - Curator hint: neutral
  - designSystemScore=0.56, brandConfidence=0.483
- **#ededed** (neutral) score=0.317 area=0%
  - Neutral cluster ranked by area (0%) and design-system score
  - Sources: default×7, navigation×4
  - Curator hint: neutral
  - designSystemScore=0.317, brandConfidence=0.433

### Top 10 raw colors (by area)
1. **#000000** area=86466925 hits=1069 [navigation(700), illustration(317), default(16), blog_card(14)]
2. **#fafafa** area=22955474 hits=11 [global_background(6), marketing_banner(4), illustration(1)]
3. **#ffffff** area=3183775 hits=42 [default(18), major_container(8), illustration(5), navigation(4)]
4. **#171717** area=2895878 hits=492 [navigation(241), default(211), illustration(13), blog_card(10)]
5. **#4d4d4d** area=1112428 hits=469 [navigation(447), default(11), promo_content(6), blog_card(5)]
6. **#666666** area=77832 hits=63 [navigation(61), blog_card(2)]
7. **#ebebeb** area=7553 hits=7 [default(7)]
8. **#7820bc** area=6751 hits=2 [default(2)]
9. **#8f8f8f** area=2547 hits=6 [navigation(6)]
10. **#0070f3** area=2289 hits=2 [success_state(2)]

### Top 10 scored colors
1. **#000000** score=0.985 area=74.08% util=no nav=yes [navigation×700, illustration×317, default×16]
2. **#171717** score=0.7037 area=2.48% util=no nav=yes [navigation×242, default×211, illustration×13]
3. **#fafafa** score=0.5954 area=22.4% util=no nav=yes [default×18, major_container×8, global_background×7]
4. **#4d4d4d** score=0.5602 area=0.95% util=no nav=yes [navigation×447, default×11, promo_content×6]
5. **#ebebeb** score=0.317 area=0.01% util=no nav=yes [default×7, navigation×4]
6. **#00dc82** score=0.309 area=0% util=no nav=yes [navigation×3]
7. **#ff3e00** score=0.309 area=0% util=no nav=yes [navigation×3]
8. **#dbdbdb** score=0.2179 area=0% util=no nav=no [illustration×3]
9. **#a8a8a8** score=0.2176 area=0% util=no nav=no [default×12]
10. **#666666** score=0.2051 area=0.07% util=no nav=yes [navigation×61, blog_card×2]
