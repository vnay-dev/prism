import test from "node:test";
import assert from "node:assert/strict";
import {
  assignExclusiveUsageRoles,
  curateFonts,
  formatUsageRoleLabels,
  sampleUsageRole
} from "../src/core/curateFonts.js";
import {
  fontStackMatchesTarget,
  formatFontWeight,
  formatWeightsList,
  isEmojiFont,
  isMetricPlaceholderFont,
  normalizeFontKey,
  parseFontStack,
  previewFontWeight,
  resolvePrimaryFont,
  resolveRenderedFont,
  snapFontWeight
} from "../src/core/fontUtils.js";
import {
  estimateDataUrlBytes,
  MAX_FONT_PREVIEW_BYTES,
  pickBestPageFontFace
} from "../src/popup/fontPreview.js";

test("previewFontWeight prefers Medium then the lightest weight", () => {
  assert.equal(previewFontWeight([400, 500, 700]), 500);
  assert.equal(previewFontWeight([300, 400, 700]), 300);
  assert.equal(previewFontWeight([600, 700]), 600);
  assert.equal(previewFontWeight([]), 400);
  assert.equal(previewFontWeight(null, 700), 700);
});

test("estimateDataUrlBytes sizes base64 payloads and flags oversize vs preview cap", () => {
  const tiny = "data:font/woff2;base64,AAAA";
  assert.ok(estimateDataUrlBytes(tiny) < MAX_FONT_PREVIEW_BYTES);
  // ~3MB of 'A' base64 → well over the 2MB preview cap.
  const huge = `data:font/woff2;base64,${"A".repeat(4 * 1024 * 1024)}`;
  assert.ok(estimateDataUrlBytes(huge) > MAX_FONT_PREVIEW_BYTES);
});

test("pickBestPageFontFace prefers latin woff2 at the closest weight", () => {
  const faces = [
    {
      family: "Fredoka",
      weight: "600",
      url: "https://example.com/he.woff2",
      unicodeRange: "U+0590-05FF"
    },
    {
      family: "Fredoka",
      weight: "600",
      url: "https://example.com/latin.woff2",
      unicodeRange: "U+0-FF, U+131"
    },
    {
      family: "Fredoka",
      weight: "700",
      url: "https://example.com/latin-bold.woff2",
      unicodeRange: "U+0-FF"
    }
  ];
  const picked = pickBestPageFontFace(faces, "Fredoka", 600);
  assert.equal(picked?.url, "https://example.com/latin.woff2");
});

test("parseFontStack extracts quoted and unquoted families", () => {
  const stack = parseFontStack('"Inter", system-ui, -apple-system, sans-serif');
  assert.deepEqual(stack, ["Inter", "system-ui", "-apple-system", "sans-serif"]);
  assert.equal(resolvePrimaryFont(stack), "Inter");
});

test("fontStackMatchesTarget prefers first available face and avoids mid-stack false matches", () => {
  const available = new Set(["arial", "inter"]);
  const isAvailable = (family) => available.has(normalizeFontKey(family));

  const interStack = parseFontStack('Inter, Arial, sans-serif');
  assert.equal(fontStackMatchesTarget(interStack, "inter", isAvailable), true);
  assert.equal(fontStackMatchesTarget(interStack, "arial", isAvailable), false);

  // Unavailable primary with no later installed face → extraction primary-fallback.
  const hnOnly = parseFontStack('"Helvetica Neue", Helvetica, sans-serif');
  assert.equal(resolveRenderedFont(hnOnly, isAvailable), "Helvetica Neue");
  assert.equal(fontStackMatchesTarget(hnOnly, "helvetica neue", isAvailable), true);

  // Mid-stack unavailable face must not match when a later face paints.
  const appleStack = parseFontStack('"SF Pro Text", "Helvetica Neue", Arial, sans-serif');
  assert.equal(resolveRenderedFont(appleStack, isAvailable), "Arial");
  assert.equal(fontStackMatchesTarget(appleStack, "helvetica neue", isAvailable), false);
  assert.equal(fontStackMatchesTarget(appleStack, "arial", isAvailable), true);
  assert.equal(fontStackMatchesTarget(appleStack, "sf pro text", isAvailable), false);
});

test("Framer metric placeholders are skipped for resolve and highlight", () => {
  assert.equal(isMetricPlaceholderFont("Inter Placeholder"), true);
  assert.equal(isMetricPlaceholderFont("Fredoka Fallback"), true);
  assert.equal(isMetricPlaceholderFont("Inter"), false);

  // Placeholder is "available" but must not beat the design face.
  const onlyPlaceholder = (family) =>
    normalizeFontKey(family) === "inter placeholder";
  const stack = parseFontStack('Inter, "Inter Placeholder", sans-serif');
  assert.equal(resolveRenderedFont(stack, onlyPlaceholder), "Inter");
  assert.equal(resolvePrimaryFont(stack), "Inter");
  assert.equal(fontStackMatchesTarget(stack, "inter", onlyPlaceholder), true);
  assert.equal(fontStackMatchesTarget(stack, "inter placeholder", onlyPlaceholder), false);

  // Once Inter loads, still match Inter and never the placeholder card.
  const both = (family) =>
    ["inter", "inter placeholder"].includes(normalizeFontKey(family));
  assert.equal(resolveRenderedFont(stack, both), "Inter");
  assert.equal(fontStackMatchesTarget(stack, "inter", both), true);
  assert.equal(fontStackMatchesTarget(stack, "inter placeholder", both), false);
});

test("snapFontWeight normalizes observed weights to standard CSS weights", () => {
  assert.equal(snapFontWeight(401), 400);
  assert.equal(snapFontWeight(437), 400);
  assert.equal(snapFontWeight(527), 500);
  assert.equal(snapFontWeight("normal"), 400);
  assert.equal(snapFontWeight("bold"), 700);
});

test("sampleUsageRole maps heading levels and contexts", () => {
  assert.equal(sampleUsageRole({ headingLevel: 1, context: "heading" }), "h1");
  assert.equal(sampleUsageRole({ headingLevel: 3, context: "heading" }), "h3");
  assert.equal(sampleUsageRole({ context: "heading" }), "heading");
  assert.equal(sampleUsageRole({ context: "text" }), "body");
  assert.equal(sampleUsageRole({ context: "button" }), "button");
  assert.equal(sampleUsageRole({ context: "link", sourceCategory: "navigation" }), "link");
  assert.equal(sampleUsageRole({ context: "other" }), null);
});

test("formatUsageRoleLabels collapses consecutive headings", () => {
  assert.deepEqual(formatUsageRoleLabels(["h1", "h2", "h3", "body", "button"]), [
    "H1–H3",
    "Body",
    "Button"
  ]);
  assert.deepEqual(formatUsageRoleLabels(["h1", "h3", "body"]), ["H1", "H3", "Body"]);
  assert.deepEqual(formatUsageRoleLabels(["body", "link"]), ["Body", "Link"]);
});

test("curateFonts exposes usage role labels per family", () => {
  const result = curateFonts({
    sectionCount: 2,
    fontSamples: [
      {
        family: "Söhne",
        weight: 700,
        fontSize: 48,
        textLength: 20,
        headingLevel: 1,
        viewportVisible: true,
        area: 10000,
        context: "heading",
        contentZone: "website_chrome",
        importance: 800,
        rawImportance: 100,
        brandWeight: 8,
        sourceCategory: "hero_cta",
        sectionId: "section-0"
      },
      {
        family: "Söhne",
        weight: 600,
        fontSize: 28,
        textLength: 18,
        headingLevel: 2,
        viewportVisible: true,
        area: 6000,
        context: "heading",
        contentZone: "website_chrome",
        importance: 400,
        rawImportance: 60,
        brandWeight: 8,
        sourceCategory: "hero_cta",
        sectionId: "section-0"
      },
      {
        family: "Inter",
        weight: 400,
        fontSize: 16,
        textLength: 200,
        headingLevel: null,
        viewportVisible: true,
        area: 40000,
        context: "text",
        contentZone: "page_content",
        importance: 100,
        rawImportance: 10,
        brandWeight: 3,
        sourceCategory: "default",
        sectionId: "section-1"
      },
      {
        family: "Inter",
        weight: 500,
        fontSize: 14,
        textLength: 10,
        headingLevel: null,
        viewportVisible: true,
        area: 2000,
        context: "button",
        contentZone: "website_chrome",
        importance: 200,
        rawImportance: 40,
        brandWeight: 6,
        sourceCategory: "primary_button",
        sectionId: "section-0"
      }
    ]
  });

  const sohne = result.fonts.find((font) => font.family === "Söhne");
  const inter = result.fonts.find((font) => font.family === "Inter");
  assert.ok(sohne);
  assert.ok(inter);
  assert.deepEqual(sohne.usageRoles, ["H1–H2"]);
  assert.ok(inter.usageRoles.includes("Body"));
  assert.ok(inter.usageRoles.includes("Button"));
  assert.ok(!inter.usageRoles.some((label) => /H\d/.test(label)));
});

test("usage roles are exclusive across font cards", () => {
  const result = curateFonts({
    sectionCount: 2,
    fontSamples: [
      {
        family: "Display Face",
        weight: 700,
        fontSize: 48,
        textLength: 16,
        headingLevel: 1,
        viewportVisible: true,
        area: 12000,
        context: "heading",
        contentZone: "website_chrome",
        importance: 900,
        rawImportance: 100,
        brandWeight: 8,
        sourceCategory: "hero_cta",
        sectionId: "section-0"
      },
      {
        family: "Display Face",
        weight: 600,
        fontSize: 32,
        textLength: 14,
        headingLevel: 2,
        viewportVisible: true,
        area: 8000,
        context: "heading",
        contentZone: "website_chrome",
        importance: 500,
        rawImportance: 80,
        brandWeight: 8,
        sourceCategory: "hero_cta",
        sectionId: "section-0"
      },
      {
        family: "Body Face",
        weight: 400,
        fontSize: 16,
        textLength: 180,
        headingLevel: null,
        viewportVisible: true,
        area: 50000,
        context: "text",
        contentZone: "page_content",
        importance: 100,
        rawImportance: 10,
        brandWeight: 3,
        sourceCategory: "default",
        sectionId: "section-1"
      },
      // Weaker H2 usage on the body face — must not steal H2 from Display Face.
      {
        family: "Body Face",
        weight: 600,
        fontSize: 22,
        textLength: 12,
        headingLevel: 2,
        viewportVisible: true,
        area: 1500,
        context: "heading",
        contentZone: "page_content",
        importance: 40,
        rawImportance: 10,
        brandWeight: 3,
        sourceCategory: "default",
        sectionId: "section-1"
      }
    ]
  });

  const display = result.fonts.find((font) => font.family === "Display Face");
  const body = result.fonts.find((font) => font.family === "Body Face");
  assert.ok(display);
  assert.ok(body);
  assert.ok(display.usageRoles.includes("H1–H2") || display.usageRoles.includes("H2"));
  assert.ok(!body.usageRoles.some((label) => label === "H2" || label.includes("H2")));

  const seen = new Set();
  for (const font of result.fonts) {
    for (const label of font.usageRoles || []) {
      assert.ok(!seen.has(label), `role ${label} appears on multiple cards`);
      seen.add(label);
    }
  }
});

test("assignExclusiveUsageRoles picks the strongest family per role", () => {
  const roles = assignExclusiveUsageRoles([
    {
      family: "A",
      roleScores: new Map([
        ["h2", 10],
        ["body", 50]
      ])
    },
    {
      family: "B",
      roleScores: new Map([
        ["h2", 40],
        ["button", 20]
      ])
    }
  ]);
  assert.deepEqual(roles.get("a"), ["Body"]);
  assert.deepEqual(roles.get("b"), ["H2", "Button"]);
});

test("curateFonts keeps meaningful weights and drops insignificant outliers", () => {
  const samples = [];
  const pushSample = (weight, overrides = {}) => {
    samples.push({
      family: "Inter",
      weight,
      fontSize: 16,
      textLength: 120,
      headingLevel: null,
      viewportVisible: true,
      area: 1200,
      context: "text",
      contentZone: "page_content",
      importance: 30,
      rawImportance: 10,
      brandWeight: 3,
      sourceCategory: "default",
      sectionId: "section-0",
      ...overrides
    });
  };

  pushSample(400);
  pushSample(400);
  pushSample(400);
  pushSample(401);
  pushSample(500, { context: "button", importance: 180, rawImportance: 60, sourceCategory: "primary_button" });
  pushSample(600, { context: "heading", headingLevel: 2, importance: 800, rawImportance: 100, sourceCategory: "hero_cta", contentZone: "website_chrome" });
  pushSample(600, { context: "heading", headingLevel: 3, importance: 500, rawImportance: 60, sourceCategory: "default" });

  const result = curateFonts({ fontSamples: samples, sectionCount: 3 });
  assert.equal(result.fonts.length, 1);
  assert.deepEqual(result.fonts[0].weights, [400, 500, 600]);
  assert.equal(result.fonts[0].weightsLabel, "400, 500, 600");
  assert.ok(!result.fonts[0].weights.includes(401));
  assert.ok(!result.fonts[0].weights.includes(437));
});

test("curateFonts assigns primary secondary tertiary from distinct families", () => {
  const result = curateFonts({
    sectionCount: 4,
    fontSamples: [
      {
        family: "Söhne",
        weight: 600,
        fontSize: 48,
        textLength: 24,
        headingLevel: 1,
        viewportVisible: true,
        area: 12000,
        context: "heading",
        contentZone: "website_chrome",
        importance: 800,
        rawImportance: 100,
        brandWeight: 8,
        sourceCategory: "hero_cta",
        sectionId: "section-0"
      },
      {
        family: "Inter",
        weight: 400,
        fontSize: 16,
        textLength: 220,
        headingLevel: null,
        viewportVisible: true,
        area: 48000,
        context: "text",
        contentZone: "page_content",
        importance: 120,
        rawImportance: 10,
        brandWeight: 3,
        sourceCategory: "default",
        sectionId: "section-1"
      },
      {
        family: "IBM Plex Mono",
        weight: 400,
        fontSize: 14,
        textLength: 12,
        headingLevel: null,
        viewportVisible: true,
        area: 3200,
        context: "button",
        contentZone: "website_chrome",
        importance: 540,
        rawImportance: 60,
        brandWeight: 9,
        sourceCategory: "primary_button",
        sectionId: "section-0"
      }
    ]
  });

  assert.equal(result.hasFonts, true);
  assert.equal(result.fonts.length, 3);
  assert.equal(result.fonts[0].role, "primary");
  assert.equal(result.fonts[0].family, "Söhne");
  assert.equal(result.fonts[1].role, "secondary");
  assert.equal(result.fonts[1].family, "Inter");
  assert.equal(result.fonts[2].role, "tertiary");
  assert.equal(result.fonts[2].family, "IBM Plex Mono");
  assert.deepEqual(result.fonts[1].weights, [400]);
  assert.ok(result.fonts[0].sectionsUsed >= 1);
  assert.ok(result.fonts[0].identityScore >= 0);
});

test("curateFonts collapses to one role when only one family is used", () => {
  const result = curateFonts({
    sectionCount: 2,
    fontSamples: [
      {
        family: "Inter",
        weight: 600,
        fontSize: 40,
        textLength: 20,
        headingLevel: 1,
        viewportVisible: true,
        area: 22000,
        context: "heading",
        contentZone: "website_chrome",
        importance: 500,
        rawImportance: 100,
        brandWeight: 8,
        sourceCategory: "hero_cta",
        sectionId: "section-0"
      },
      {
        family: "Inter",
        weight: 400,
        fontSize: 16,
        textLength: 180,
        headingLevel: null,
        viewportVisible: true,
        area: 64000,
        context: "text",
        contentZone: "page_content",
        importance: 90,
        rawImportance: 10,
        brandWeight: 3,
        sourceCategory: "default",
        sectionId: "section-1"
      }
    ]
  });

  assert.equal(result.fonts.length, 1);
  assert.equal(result.fonts[0].role, "primary");
  assert.equal(normalizeFontKey(result.fonts[0].family), "inter");
  assert.deepEqual(result.fonts[0].weights, [400, 600]);
});

test("curateFonts returns empty set when no font samples exist", () => {
  const result = curateFonts({ samples: [{ hex: "#111111" }] });
  assert.equal(result.hasFonts, false);
  assert.deepEqual(result.fonts, []);
});

test("formatFontWeight maps numeric weights to labels", () => {
  assert.equal(formatFontWeight(300), "Light");
  assert.equal(formatFontWeight(400), "Regular");
  assert.equal(formatFontWeight(500), "Medium");
  assert.equal(formatFontWeight(600), "Semibold");
  assert.equal(formatFontWeight(700), "Bold");
});

test("formatWeightsList renders sorted weight labels", () => {
  assert.equal(formatWeightsList([600, 400, 500]), "400, 500, 600");
});

test("curateFonts excludes emoji fonts from typography output", () => {
  const result = curateFonts({
    sectionCount: 2,
    fontSamples: [
      {
        family: "Inter",
        weight: 400,
        fontSize: 16,
        textLength: 120,
        viewportVisible: true,
        area: 12000,
        context: "text",
        contentZone: "page_content",
        importance: 120,
        rawImportance: 10,
        brandWeight: 3,
        sourceCategory: "default",
        sectionId: "section-0"
      },
      {
        family: "Apple Color Emoji",
        weight: 400,
        fontSize: 16,
        textLength: 4,
        viewportVisible: true,
        area: 8000,
        context: "text",
        contentZone: "page_content",
        importance: 90,
        rawImportance: 10,
        brandWeight: 3,
        sourceCategory: "default",
        sectionId: "section-1"
      }
    ]
  });

  assert.equal(isEmojiFont("Apple Color Emoji"), true);
  assert.equal(result.fonts.length, 1);
  assert.equal(result.fonts[0].family, "Inter");
});
