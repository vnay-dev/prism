/**
 * Validated service-worker message dispatch for Prism.
 * Pure logic — injectable deps so unit tests never hit chrome.downloads.
 */

export const ALLOWED_DOWNLOAD_PROTOCOLS = Object.freeze(["http:", "https:", "data:", "blob:"]);

export const COLOR_VIEW_MODES = Object.freeze(["roles", "stack"]);

export const MESSAGE_TYPES = Object.freeze([
  "prism-generation-cache-get",
  "prism-generation-cache-set",
  "prism-generation-cache-clear",
  "prism-color-view-get",
  "prism-color-view-set",
  "prism-download-asset",
  "prism-download-bytes",
  "prism-image-lightbox-closed"
]);

/**
 * Extension-runtime messages must come from this extension.
 * @param {chrome.runtime.MessageSender | null | undefined} sender
 * @param {string} runtimeId
 */
export function isTrustedExtensionSender(sender, runtimeId) {
  if (!runtimeId || typeof runtimeId !== "string") return false;
  return Boolean(sender && sender.id === runtimeId);
}

/**
 * @param {unknown} url
 * @returns {{ ok: true, parsed: URL } | { ok: false, error: string }}
 */
export function validateDownloadUrl(url) {
  if (!url || typeof url !== "string") {
    return { ok: false, error: "invalid-url" };
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "invalid-url" };
  }
  if (!ALLOWED_DOWNLOAD_PROTOCOLS.includes(parsed.protocol)) {
    return { ok: false, error: "invalid-url" };
  }
  return { ok: true, parsed };
}

/**
 * @param {unknown} mode
 * @returns {string | null}
 */
export function normalizeColorViewMode(mode) {
  const value = String(mode || "").toLowerCase();
  return COLOR_VIEW_MODES.includes(value) ? value : null;
}

/**
 * @param {unknown} message
 * @returns {{ ok: true, type: string } | { ok: false, error: string }}
 */
export function validateMessageShape(message) {
  if (!message || typeof message !== "object") {
    return { ok: false, error: "invalid-message" };
  }
  const type = message.type;
  if (typeof type !== "string" || !MESSAGE_TYPES.includes(type)) {
    return { ok: false, error: "unknown-type" };
  }

  switch (type) {
    case "prism-generation-cache-get":
      if (typeof message.pageKey !== "string" || !message.pageKey) {
        return { ok: false, error: "invalid-payload" };
      }
      break;
    case "prism-generation-cache-set":
      if (typeof message.pageKey !== "string" || !message.pageKey) {
        return { ok: false, error: "invalid-payload" };
      }
      if (!message.cache || typeof message.cache !== "object") {
        return { ok: false, error: "invalid-payload" };
      }
      break;
    case "prism-generation-cache-clear":
      if (message.pageKey !== undefined && typeof message.pageKey !== "string") {
        return { ok: false, error: "invalid-payload" };
      }
      break;
    case "prism-color-view-set":
      if (!normalizeColorViewMode(message.mode)) {
        return { ok: false, error: "invalid-payload" };
      }
      break;
    case "prism-download-asset": {
      const urlCheck = validateDownloadUrl(message.url);
      if (!urlCheck.ok) return { ok: false, error: urlCheck.error };
      if (message.filename !== undefined && typeof message.filename !== "string") {
        return { ok: false, error: "invalid-payload" };
      }
      break;
    }
    case "prism-download-bytes": {
      const hasBytes = message.bytes != null;
      const hasBase64 = typeof message.base64 === "string" && message.base64.length > 0;
      if (!hasBytes && !hasBase64) {
        return { ok: false, error: "invalid-payload" };
      }
      if (message.filename !== undefined && typeof message.filename !== "string") {
        return { ok: false, error: "invalid-payload" };
      }
      if (message.mime !== undefined && typeof message.mime !== "string") {
        return { ok: false, error: "invalid-payload" };
      }
      break;
    }
    default:
      break;
  }

  return { ok: true, type };
}

/**
 * @typedef {object} MessageHandlerDeps
 * @property {Map<string, object>} generationCache
 * @property {{ value: string }} colorViewMode
 * @property {(url: string, filename?: string) => Promise<{ ok: boolean, error?: string, downloadId?: number }>} downloadAsset
 * @property {(bytes: unknown, mime: string) => { objectUrl: string, revoke: () => void } | { error: string }} createObjectUrlFromBytes
 * @property {string} runtimeId
 */

/**
 * Handle a runtime message. Returns:
 * - `{ sync: true, response }` for immediate sendResponse
 * - `{ async: true, promise }` when the caller must return `true` and resolve later
 * - `{ ignored: true }` when the message should not be answered (untrusted / unknown after validation)
 *
 * @param {unknown} message
 * @param {chrome.runtime.MessageSender | null | undefined} sender
 * @param {MessageHandlerDeps} deps
 */
export function dispatchExtensionMessage(message, sender, deps) {
  if (!isTrustedExtensionSender(sender, deps.runtimeId)) {
    return { sync: true, response: { ok: false, error: "untrusted-sender" } };
  }

  const shape = validateMessageShape(message);
  if (!shape.ok) {
    return { sync: true, response: { ok: false, error: shape.error } };
  }

  const type = shape.type;
  const msg = /** @type {Record<string, unknown>} */ (message);

  switch (type) {
    case "prism-generation-cache-get":
      return {
        sync: true,
        response: { cache: deps.generationCache.get(/** @type {string} */ (msg.pageKey)) || null }
      };
    case "prism-generation-cache-set":
      deps.generationCache.set(/** @type {string} */ (msg.pageKey), /** @type {object} */ (msg.cache));
      return { sync: true, response: { ok: true } };
    case "prism-generation-cache-clear":
      if (typeof msg.pageKey === "string" && msg.pageKey) {
        deps.generationCache.delete(msg.pageKey);
      }
      return { sync: true, response: { ok: true } };
    case "prism-color-view-get":
      return {
        sync: true,
        response: { mode: normalizeColorViewMode(deps.colorViewMode.value) || "roles" }
      };
    case "prism-color-view-set": {
      const mode = normalizeColorViewMode(msg.mode);
      deps.colorViewMode.value = mode;
      return { sync: true, response: { ok: true } };
    }
    case "prism-download-asset":
      return {
        async: true,
        promise: deps.downloadAsset(
          /** @type {string} */ (msg.url),
          typeof msg.filename === "string" ? msg.filename : undefined
        )
      };
    case "prism-download-bytes": {
      const mime =
        typeof msg.mime === "string" && msg.mime.includes("/")
          ? msg.mime
          : "application/octet-stream";
      // Prefer base64 — ArrayBuffer can arrive corrupted/empty across SW messaging.
      const payload =
        typeof msg.base64 === "string" && msg.base64.length > 0 ? msg.base64 : msg.bytes;
      const created = deps.createObjectUrlFromBytes(payload, mime);
      if ("error" in created) {
        return { sync: true, response: { ok: false, error: created.error } };
      }
      const { objectUrl, revoke } = created;
      return {
        async: true,
        promise: deps
          .downloadAsset(objectUrl, typeof msg.filename === "string" ? msg.filename : undefined)
          .then((result) => {
            revoke();
            return result;
          })
          .catch(() => {
            revoke();
            return { ok: false, error: "download-failed" };
          })
      };
    }
    case "prism-image-lightbox-closed":
      return { sync: true, response: { ok: true } };
    default:
      return { sync: true, response: { ok: false, error: "unknown-type" } };
  }
}

/**
 * Chrome `runtime.onMessage` listener that wires `dispatchExtensionMessage`.
 * Returns the boolean Chrome expects for async `sendResponse`.
 *
 * @param {MessageHandlerDeps} deps
 * @returns {(message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => boolean}
 */
export function createRuntimeMessageListener(deps) {
  return function onRuntimeMessage(message, sender, sendResponse) {
    const result = dispatchExtensionMessage(message, sender, deps);
    if (result.async) {
      result.promise.then(sendResponse).catch(() => {
        sendResponse({ ok: false, error: "download-failed" });
      });
      return true;
    }
    if (result.sync) {
      sendResponse(result.response);
      return false;
    }
    return false;
  };
}
