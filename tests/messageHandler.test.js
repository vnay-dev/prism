import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_DOWNLOAD_PROTOCOLS,
  dispatchExtensionMessage,
  isTrustedExtensionSender,
  validateDownloadUrl,
  validateMessageShape
} from "../src/background/messageHandler.js";

const RUNTIME_ID = "test-extension-id";

function makeDeps(overrides = {}) {
  const generationCache = new Map();
  const colorViewMode = { value: "roles" };
  const downloads = [];
  return {
    generationCache,
    colorViewMode,
    downloads,
    deps: {
      generationCache,
      colorViewMode,
      downloadAsset: async (url, filename) => {
        downloads.push({ url, filename });
        return { ok: true, downloadId: downloads.length };
      },
      createObjectUrlFromBytes: (bytes, mime) => {
        if (bytes == null) return { error: "download-failed" };
        return {
          objectUrl: `blob:mock-${mime}`,
          revoke: () => {}
        };
      },
      runtimeId: RUNTIME_ID,
      ...overrides
    }
  };
}

test("trusted sender requires matching runtime id", () => {
  assert.equal(isTrustedExtensionSender({ id: RUNTIME_ID }, RUNTIME_ID), true);
  assert.equal(isTrustedExtensionSender({ id: "other" }, RUNTIME_ID), false);
  assert.equal(isTrustedExtensionSender({}, RUNTIME_ID), false);
  assert.equal(isTrustedExtensionSender(null, RUNTIME_ID), false);
});

test("download URL allowlist accepts http(s)/data/blob only", () => {
  assert.deepEqual(ALLOWED_DOWNLOAD_PROTOCOLS, ["http:", "https:", "data:", "blob:"]);
  assert.equal(validateDownloadUrl("https://cdn.example/a.png").ok, true);
  assert.equal(validateDownloadUrl("http://cdn.example/a.png").ok, true);
  assert.equal(validateDownloadUrl("data:image/png;base64,aa").ok, true);
  assert.equal(validateDownloadUrl("blob:https://x/1").ok, true);
  assert.equal(validateDownloadUrl("javascript:alert(1)").ok, false);
  assert.equal(validateDownloadUrl("file:///etc/passwd").ok, false);
  assert.equal(validateDownloadUrl("ftp://x/a").ok, false);
  assert.equal(validateDownloadUrl(null).ok, false);
});

test("unknown message types and malformed payloads are rejected", () => {
  assert.equal(validateMessageShape({ type: "prism-evil" }).error, "unknown-type");
  assert.equal(validateMessageShape(null).error, "invalid-message");
  assert.equal(
    validateMessageShape({ type: "prism-generation-cache-get" }).error,
    "invalid-payload"
  );
  assert.equal(
    validateMessageShape({ type: "prism-generation-cache-set", pageKey: "1::x" }).error,
    "invalid-payload"
  );
  assert.equal(
    validateMessageShape({ type: "prism-color-view-set", mode: "grid" }).error,
    "invalid-payload"
  );
  assert.equal(
    validateMessageShape({ type: "prism-download-asset", url: "javascript:1" }).error,
    "invalid-url"
  );
});

test("untrusted sender cannot read or write the generation cache", () => {
  const { deps, generationCache } = makeDeps();
  generationCache.set("1::https://a.com", { palette: [{ hex: "#fff" }] });

  const denied = dispatchExtensionMessage(
    { type: "prism-generation-cache-get", pageKey: "1::https://a.com" },
    { id: "attacker" },
    deps
  );
  assert.deepEqual(denied.response, { ok: false, error: "untrusted-sender" });

  const setDenied = dispatchExtensionMessage(
    {
      type: "prism-generation-cache-set",
      pageKey: "1::https://evil",
      cache: { palette: [] }
    },
    { id: "attacker" },
    deps
  );
  assert.deepEqual(setDenied.response, { ok: false, error: "untrusted-sender" });
  assert.equal(generationCache.has("1::https://evil"), false);
});

test("trusted cache get/set/clear preserve existing operations", () => {
  const { deps, generationCache } = makeDeps();
  const sender = { id: RUNTIME_ID };
  const cache = { pageKey: "1::https://a.com", palette: [{ hex: "#111" }] };

  const setResult = dispatchExtensionMessage(
    { type: "prism-generation-cache-set", pageKey: cache.pageKey, cache },
    sender,
    deps
  );
  assert.deepEqual(setResult.response, { ok: true });
  assert.equal(generationCache.get(cache.pageKey), cache);

  const getResult = dispatchExtensionMessage(
    { type: "prism-generation-cache-get", pageKey: cache.pageKey },
    sender,
    deps
  );
  assert.deepEqual(getResult.response, { cache });

  const clearResult = dispatchExtensionMessage(
    { type: "prism-generation-cache-clear", pageKey: cache.pageKey },
    sender,
    deps
  );
  assert.deepEqual(clearResult.response, { ok: true });
  assert.equal(generationCache.has(cache.pageKey), false);
});

test("color view get/set only accept roles and stack", () => {
  const { deps, colorViewMode } = makeDeps();
  const sender = { id: RUNTIME_ID };

  assert.deepEqual(
    dispatchExtensionMessage({ type: "prism-color-view-set", mode: "stack" }, sender, deps)
      .response,
    { ok: true }
  );
  assert.equal(colorViewMode.value, "stack");

  assert.deepEqual(
    dispatchExtensionMessage({ type: "prism-color-view-get" }, sender, deps).response,
    { mode: "stack" }
  );

  assert.deepEqual(
    dispatchExtensionMessage({ type: "prism-color-view-set", mode: "organized" }, sender, deps)
      .response,
    { ok: false, error: "invalid-payload" }
  );
  assert.equal(colorViewMode.value, "stack");
});

test("download-asset dispatches only for allowlisted protocols without real downloads", async () => {
  const { deps, downloads } = makeDeps();
  const sender = { id: RUNTIME_ID };

  const bad = dispatchExtensionMessage(
    { type: "prism-download-asset", url: "file:///tmp/x" },
    sender,
    deps
  );
  assert.deepEqual(bad.response, { ok: false, error: "invalid-url" });
  assert.equal(downloads.length, 0);

  const good = dispatchExtensionMessage(
    { type: "prism-download-asset", url: "https://cdn.example/icon.svg", filename: "icon.svg" },
    sender,
    deps
  );
  assert.equal(good.async, true);
  const result = await good.promise;
  assert.deepEqual(result, { ok: true, downloadId: 1 });
  assert.deepEqual(downloads[0], {
    url: "https://cdn.example/icon.svg",
    filename: "icon.svg"
  });
});

test("lightbox closed and download-bytes remain available to trusted senders", async () => {
  const { deps, downloads } = makeDeps();
  const sender = { id: RUNTIME_ID };

  assert.deepEqual(
    dispatchExtensionMessage({ type: "prism-image-lightbox-closed" }, sender, deps).response,
    { ok: true }
  );

  const bytesMsg = dispatchExtensionMessage(
    {
      type: "prism-download-bytes",
      bytes: new Uint8Array([1, 2, 3]),
      mime: "application/zip",
      filename: "assets.zip"
    },
    sender,
    deps
  );
  assert.equal(bytesMsg.async, true);
  const result = await bytesMsg.promise;
  assert.equal(result.ok, true);
  assert.equal(downloads[0].url.startsWith("blob:mock-"), true);
  assert.equal(downloads[0].filename, "assets.zip");

  const base64Msg = dispatchExtensionMessage(
    {
      type: "prism-download-bytes",
      base64: "AQID",
      mime: "application/zip",
      filename: "icons.zip"
    },
    sender,
    deps
  );
  assert.equal(base64Msg.async, true);
  const base64Result = await base64Msg.promise;
  assert.equal(base64Result.ok, true);
  assert.equal(downloads[1].filename, "icons.zip");
});
