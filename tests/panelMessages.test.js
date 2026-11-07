import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PANEL_CHILD_MESSAGE_TYPES,
  PANEL_HOST_MESSAGE_TYPES,
  isKnownChildMessageType,
  isKnownHostMessageType,
  isTrustedIframeSource,
  isTrustedParentSource,
  shouldAcceptChildPanelMessage,
  shouldAcceptHostPanelMessage
} from "../src/core/panelMessages.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function parseTogglePanelHostTypes(source) {
  const match = source.match(
    /HOST_MESSAGE_TYPES\s*=\s*new Set\(\[\s*([\s\S]*?)\]\s*\)/
  );
  assert.ok(match, "togglePanel.js must declare HOST_MESSAGE_TYPES = new Set([...])");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

test("host messages require the iframe contentWindow as source", () => {
  const iframeWindow = { id: "iframe" };
  const other = { id: "other" };
  assert.equal(isTrustedIframeSource({ source: iframeWindow }, iframeWindow), true);
  assert.equal(isTrustedIframeSource({ source: other }, iframeWindow), false);
  assert.equal(isTrustedIframeSource({ source: null }, iframeWindow), false);
});

test("child messages require the embedding parent as source", () => {
  const parent = { id: "parent" };
  assert.equal(isTrustedParentSource({ source: parent }, parent), true);
  assert.equal(isTrustedParentSource({ source: { id: "spoof" } }, parent), false);
});

test("panel message type allowlists stay narrow", () => {
  assert.equal(isKnownHostMessageType("prism-close"), true);
  assert.equal(isKnownHostMessageType("prism-resize"), true);
  assert.equal(isKnownHostMessageType("prism-request-resize"), false);
  assert.equal(isKnownChildMessageType("prism-request-resize"), true);
  assert.equal(isKnownChildMessageType("prism-close"), false);
});

test("togglePanel.js host allowlist stays in parity with PANEL_HOST_MESSAGE_TYPES", () => {
  const source = readFileSync(join(root, "src/content/togglePanel.js"), "utf8");
  const fromToggle = parseTogglePanelHostTypes(source).sort();
  const fromModule = [...PANEL_HOST_MESSAGE_TYPES].sort();
  assert.deepEqual(
    fromToggle,
    fromModule,
    "Update both togglePanel.js HOST_MESSAGE_TYPES and panelMessages.js PANEL_HOST_MESSAGE_TYPES together"
  );
  assert.match(
    source,
    /Keep in sync with PANEL_HOST_MESSAGE_TYPES/,
    "togglePanel should document the parity requirement"
  );
});

test("shouldAcceptHostPanelMessage enforces source, origin, and type", () => {
  const iframe = { id: "iframe" };
  const origin = "chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef";
  const good = {
    source: iframe,
    origin,
    data: { type: "prism-close" }
  };
  assert.equal(shouldAcceptHostPanelMessage(good, iframe, origin), true);
  assert.equal(
    shouldAcceptHostPanelMessage({ ...good, data: { type: "prism-resize" } }, iframe, origin),
    true
  );

  assert.equal(
    shouldAcceptHostPanelMessage({ ...good, source: { id: "other" } }, iframe, origin),
    false,
    "reject wrong source"
  );
  assert.equal(
    shouldAcceptHostPanelMessage({ ...good, origin: "https://evil.example" }, iframe, origin),
    false,
    "reject wrong origin"
  );
  assert.equal(
    shouldAcceptHostPanelMessage(
      { ...good, data: { type: "prism-request-resize" } },
      iframe,
      origin
    ),
    false,
    "reject child-only type on host"
  );
  assert.equal(
    shouldAcceptHostPanelMessage({ ...good, data: { type: "prism-evil" } }, iframe, origin),
    false,
    "reject unknown type"
  );
});

test("shouldAcceptChildPanelMessage enforces parent source and type", () => {
  const parent = { id: "parent" };
  assert.equal(
    shouldAcceptChildPanelMessage(
      { source: parent, data: { type: "prism-request-resize" } },
      parent
    ),
    true
  );
  assert.equal(
    shouldAcceptChildPanelMessage({ source: parent, data: { type: "prism-close" } }, parent),
    false
  );
  assert.equal(
    shouldAcceptChildPanelMessage(
      { source: { id: "spoof" }, data: { type: "prism-request-resize" } },
      parent
    ),
    false
  );
  assert.deepEqual([...PANEL_CHILD_MESSAGE_TYPES], ["prism-request-resize"]);
});

test("App.js embedded listener uses shouldAcceptChildPanelMessage", () => {
  const src = readFileSync(join(root, "src/popup/App.js"), "utf8");
  assert.match(src, /shouldAcceptChildPanelMessage/);
  assert.match(src, /shouldAcceptChildPanelMessage\(event,\s*window\.parent\)/);
});
