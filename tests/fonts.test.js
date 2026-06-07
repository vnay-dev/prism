import test from "node:test";
import assert from "node:assert/strict";
import { curateFonts } from "../src/core/curateFonts.js";
import {
  formatFontWeight,
  formatWeightsList,
  isEmojiFont,
  normalizeFontKey,
  parseFontStack,
  resolvePrimaryFont,
  snapFontWeight
} from "../src/core/fontUtils.js";

test("parseFontStack extracts quoted and unquoted families", () => {
  const stack = parseFontStack('"Inter", system-ui, -apple-system, sans-serif');
  assert.deepEqual(stack, ["Inter", "system-ui", "-apple-system", "sans-serif"]);
  assert.equal(resolvePrimaryFont(stack), "Inter");
});

test("snapFontWeight normalizes observed weights to standard CSS weights", () => {
  assert.equal(snapFontWeight(401), 400);
  assert.equal(snapFontWeight(437), 400);
  assert.equal(snapFontWeight(527), 500);
  assert.equal(snapFontWeight("normal"), 400);
  assert.equal(snapFontWeight("bold"), 700);
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
