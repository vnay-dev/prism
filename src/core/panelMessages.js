/**
 * Helpers for the in-page panel iframe ↔ host page postMessage protocol.
 * Keep validation minimal and behaviour-preserving.
 *
 * Canonical host message types live here. `src/content/togglePanel.js` is a
 * classic injected script and cannot import this module — it inlines the same
 * allowlist. `tests/panelMessages.test.js` fails if the two diverge.
 */

/** Host page: only accept messages from the Prism popup iframe window. */
export function isTrustedIframeSource(event, iframeContentWindow) {
  return Boolean(iframeContentWindow && event && event.source === iframeContentWindow);
}

/**
 * Embedded popup: only accept control messages from the embedding parent
 * (the host page that owns the panel iframe).
 */
export function isTrustedParentSource(event, parentWindow) {
  return Boolean(parentWindow && event && event.source === parentWindow);
}

export const PANEL_HOST_MESSAGE_TYPES = Object.freeze([
  "prism-close",
  "prism-drag-start",
  "prism-drag-move",
  "prism-drag-end",
  "prism-resize"
]);

export const PANEL_CHILD_MESSAGE_TYPES = Object.freeze(["prism-request-resize"]);

export function isKnownHostMessageType(type) {
  return typeof type === "string" && PANEL_HOST_MESSAGE_TYPES.includes(type);
}

export function isKnownChildMessageType(type) {
  return typeof type === "string" && PANEL_CHILD_MESSAGE_TYPES.includes(type);
}

/**
 * Host-page gate (mirrors `togglePanel.js` listener filters).
 * @param {MessageEvent | { source?: unknown, origin?: string, data?: { type?: string } }} event
 * @param {Window | object | null | undefined} iframeContentWindow
 * @param {string} extensionOrigin
 */
export function shouldAcceptHostPanelMessage(event, iframeContentWindow, extensionOrigin) {
  if (!isTrustedIframeSource(event, iframeContentWindow)) return false;
  if (!extensionOrigin || event?.origin !== extensionOrigin) return false;
  return isKnownHostMessageType(event?.data?.type);
}

/**
 * Embedded popup gate for parent → iframe control messages.
 * @param {MessageEvent | { source?: unknown, data?: { type?: string } }} event
 * @param {Window | object | null | undefined} parentWindow
 */
export function shouldAcceptChildPanelMessage(event, parentWindow) {
  if (!isTrustedParentSource(event, parentWindow)) return false;
  return isKnownChildMessageType(event?.data?.type);
}
