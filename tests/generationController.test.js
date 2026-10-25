import test from "node:test";
import assert from "node:assert/strict";
import {
  makePageKey,
  createGenerationState,
  shouldAutoGenerate,
  canReuseModeResults,
  canReuseRawExtraction,
  beginRequest,
  isStaleRequest,
  setInFlight,
  clearInFlight,
  applyExtractionSuccess,
  resetMode,
  markModeForManualGenerate,
  invalidatePage,
  serializeGenerationCache,
  restoreGenerationCache
} from "../src/popup/generationController.js";

test("makePageKey combines tab id and url", () => {
  assert.equal(makePageKey({ id: 7, url: "https://x.com/" }), "7::https://x.com/");
  assert.equal(makePageKey(null), null);
  assert.equal(makePageKey({ url: "https://x.com/" }), null);
});

test("auto-generate runs on first open for a supported page", () => {
  const state = createGenerationState();
  assert.equal(
    shouldAutoGenerate(state, { mode: "colors", pageKey: "1::https://example.com" }),
    true
  );
  assert.equal(
    shouldAutoGenerate(state, { mode: "fonts", pageKey: "1::https://example.com" }),
    true
  );
});

test("auto-generate skips unsupported or restricted contexts", () => {
  const state = createGenerationState();
  assert.equal(
    shouldAutoGenerate(state, {
      mode: "colors",
      pageKey: "1::chrome://extensions",
      unsupported: true
    }),
    false
  );
  assert.equal(
    shouldAutoGenerate(state, { mode: "colors", pageKey: "1::https://x.com", restricted: true }),
    false
  );
});

test("cached results are reused for the same page without regenerating", () => {
  const state = createGenerationState({
    pageKey: "1::https://example.com",
    palette: [{ hex: "#fff" }],
    fonts: [{ family: "Inter" }]
  });
  assert.equal(
    canReuseModeResults(state, { mode: "colors", pageKey: "1::https://example.com" }),
    true
  );
  assert.equal(
    shouldAutoGenerate(state, { mode: "colors", pageKey: "1::https://example.com" }),
    false
  );
  assert.equal(
    canReuseModeResults(state, { mode: "colors", pageKey: "2::https://other.com" }),
    false
  );
});

test("Reset clears mode results and blocks silent regeneration", () => {
  let state = createGenerationState({
    pageKey: "1::https://example.com",
    palette: [{ hex: "#fff" }],
    gradients: [{ id: "grad-1", css: "linear-gradient(#f00,#00f)" }],
    fonts: [{ family: "Inter" }],
    images: [{ url: "https://example.com/a.png" }],
    icons: [{ url: "https://example.com/a.svg" }],
    rawExtraction: { samples: [1] }
  });

  state = resetMode(state, "colors");
  assert.deepEqual(state.palette, []);
  assert.deepEqual(state.gradients, []);
  assert.equal(state.dismissed.colors, true);
  assert.equal(state.fonts.length, 1);
  assert.equal(state.images.length, 1);
  assert.equal(state.rawExtraction.samples.length, 1);
  assert.equal(
    shouldAutoGenerate(state, { mode: "colors", pageKey: "1::https://example.com" }),
    false
  );
  assert.equal(
    shouldAutoGenerate(state, { mode: "fonts", pageKey: "1::https://example.com" }),
    false
  );
  assert.equal(
    canReuseModeResults(state, { mode: "fonts", pageKey: "1::https://example.com" }),
    true
  );

  state = resetMode(state, "images");
  assert.deepEqual(state.images, []);
  assert.equal(state.dismissed.images, true);
  assert.equal(state.icons.length, 1);
});
test("tab switch after Reset does not auto-generate the reset mode", () => {
  let state = createGenerationState({
    pageKey: "1::https://example.com",
    palette: [{ hex: "#fff" }],
    fonts: []
  });
  state = resetMode(state, "colors");
  assert.equal(
    shouldAutoGenerate(state, { mode: "colors", pageKey: "1::https://example.com" }),
    false
  );
  assert.equal(
    shouldAutoGenerate(state, { mode: "fonts", pageKey: "1::https://example.com" }),
    true
  );
});

test("manual Generate clears dismissed so extraction may apply again", () => {
  let state = resetMode(
    createGenerationState({ pageKey: "1::https://example.com", palette: [{ hex: "#fff" }] }),
    "colors"
  );
  state = markModeForManualGenerate(state, "colors");
  assert.equal(state.dismissed.colors, false);
  assert.equal(
    shouldAutoGenerate(state, { mode: "colors", pageKey: "1::https://example.com" }),
    true
  );
});

test("in-flight promise is shared and stale requests are ignored", () => {
  let state = createGenerationState();
  state = beginRequest(state);
  const firstId = state.requestId;
  const shared = Promise.resolve({ samples: [] });
  state = setInFlight(state, shared);
  assert.equal(state.inFlight, shared);

  state = beginRequest(state);
  assert.equal(isStaleRequest(state, firstId), true);
  assert.equal(isStaleRequest(state, state.requestId), false);

  const applied = applyExtractionSuccess(state, {
    pageKey: "1::https://example.com",
    rawExtraction: { samples: [1] },
    palette: [{ hex: "#111" }],
    fonts: [],
    requestId: firstId
  });
  assert.equal(applied.palette.length, 0);

  state = clearInFlight(state);
  const fresh = applyExtractionSuccess(state, {
    pageKey: "1::https://example.com",
    rawExtraction: { samples: [1] },
    palette: [{ hex: "#111" }],
    fonts: [{ family: "Inter" }],
    requestId: state.requestId
  });
  assert.equal(fresh.palette[0].hex, "#111");
  assert.equal(fresh.fonts[0].family, "Inter");
  assert.equal(canReuseRawExtraction(fresh, { pageKey: "1::https://example.com" }), true);
});

test("dismissed mode is not overwritten by a shared extraction success", () => {
  let state = createGenerationState({
    pageKey: "1::https://example.com",
    dismissed: { colors: true, fonts: false }
  });
  state = beginRequest(state);
  state = applyExtractionSuccess(state, {
    pageKey: "1::https://example.com",
    rawExtraction: { samples: [1], fontSamples: [1] },
    palette: [{ hex: "#fff" }],
    fonts: [{ family: "Inter" }],
    requestId: state.requestId
  });
  assert.deepEqual(state.palette, []);
  assert.equal(state.fonts[0].family, "Inter");
  assert.equal(state.dismissed.colors, true);
});

test("page key change invalidates cached generation state", () => {
  const state = createGenerationState({
    pageKey: "1::https://a.com",
    palette: [{ hex: "#fff" }],
    rawExtraction: { samples: [1] }
  });
  const next = invalidatePage(state, "2::https://b.com");
  assert.equal(next.pageKey, null);
  assert.equal(next.palette.length, 0);
  assert.equal(next.rawExtraction, null);
});

test("session cache serialization round-trips without the in-flight promise", () => {
  const state = setInFlight(
    createGenerationState({
      pageKey: "1::https://example.com",
      palette: [{ hex: "#abcabc" }],
      fonts: [{ family: "Inter" }],
      dismissed: { colors: false, fonts: true },
      rawExtraction: { samples: [{ hex: "#abcabc" }] }
    }),
    Promise.resolve(1)
  );
  const restored = restoreGenerationCache(serializeGenerationCache(state));
  assert.equal(restored.pageKey, "1::https://example.com");
  assert.equal(restored.palette[0].hex, "#abcabc");
  assert.equal(restored.dismissed.fonts, true);
  assert.equal(restored.inFlight, null);
  assert.equal(restored.rawExtraction.samples[0].hex, "#abcabc");
});
