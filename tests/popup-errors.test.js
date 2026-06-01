import test from "node:test";
import assert from "node:assert/strict";
import {
  ERROR_MESSAGES,
  classifyExtractionError,
  isExtractionResultEmpty,
  isUnsupportedPageUrl,
  normalizeUserMessage
} from "../src/popup/errors.js";

test("normalizeUserMessage rejects nullish and junk strings", () => {
  assert.equal(normalizeUserMessage(null), "");
  assert.equal(normalizeUserMessage(undefined), "");
  assert.equal(normalizeUserMessage("undefined"), "");
  assert.equal(normalizeUserMessage("null"), "");
  assert.equal(normalizeUserMessage("  "), "");
  assert.equal(normalizeUserMessage("Could not scan page."), "Could not scan page.");
});

test("isUnsupportedPageUrl detects restricted browser pages", () => {
  assert.equal(isUnsupportedPageUrl("chrome://extensions"), true);
  assert.equal(isUnsupportedPageUrl("chrome-extension://abc/popup.html"), true);
  assert.equal(isUnsupportedPageUrl("edge://settings"), true);
  assert.equal(isUnsupportedPageUrl("about:blank"), true);
  assert.equal(isUnsupportedPageUrl("devtools://devtools"), true);
  assert.equal(isUnsupportedPageUrl("file:///C:/page.html"), true);
  assert.equal(isUnsupportedPageUrl(""), true);
  assert.equal(isUnsupportedPageUrl("https://linear.app/"), false);
  assert.equal(isUnsupportedPageUrl("https://www.notion.so/"), false);
});

test("classifyExtractionError maps no palette", () => {
  assert.equal(classifyExtractionError(null, { noPalette: true }), ERROR_MESSAGES.NO_PALETTE);
});

test("classifyExtractionError maps unsupported page", () => {
  assert.equal(
    classifyExtractionError(new Error("anything"), { unsupportedPage: true }),
    ERROR_MESSAGES.UNSUPPORTED_PAGE
  );
});

test("classifyExtractionError maps timeout", () => {
  assert.equal(
    classifyExtractionError(new Error("Scan timed out"), {}),
    ERROR_MESSAGES.TIMEOUT
  );
  assert.equal(classifyExtractionError(null, { timedOut: true }), ERROR_MESSAGES.TIMEOUT);
});

test("classifyExtractionError maps script injection failure", () => {
  assert.equal(
    classifyExtractionError(
      new Error("Cannot access contents of the page. Extension manifest must request permission."),
      {}
    ),
    ERROR_MESSAGES.INJECTION_FAILED
  );
  assert.equal(
    classifyExtractionError(new Error("boom"), { injectionFailed: true }),
    ERROR_MESSAGES.INJECTION_FAILED
  );
});

test("classifyExtractionError never returns undefined or null text", () => {
  const cases = [
    classifyExtractionError(null, {}),
    classifyExtractionError(undefined, {}),
    classifyExtractionError({ message: null }, {}),
    classifyExtractionError({ message: "undefined" }, {}),
    classifyExtractionError(new Error("null"), {})
  ];

  for (const message of cases) {
    assert.ok(typeof message === "string" && message.length > 0);
    assert.notEqual(message, "undefined");
    assert.notEqual(message, "null");
  }
});

test("classifyExtractionError appends next step for unmapped raw errors", () => {
  const message = classifyExtractionError(new Error("Network glitch"), {});
  assert.ok(message.includes("Refresh the page"));
  assert.ok(message.includes("Network glitch"));
});

test("isExtractionResultEmpty detects missing or empty samples", () => {
  assert.equal(isExtractionResultEmpty(null), true);
  assert.equal(isExtractionResultEmpty(undefined), true);
  assert.equal(isExtractionResultEmpty({}), true);
  assert.equal(isExtractionResultEmpty({ samples: [] }), true);
  assert.equal(isExtractionResultEmpty({ samples: [{ hex: "#fff" }] }), false);
});
