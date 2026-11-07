import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRuntimeMessageListener } from "../src/background/messageHandler.js";

const RUNTIME_ID = "abcdefghijklmnopqrstuvwxyzabcdef";
const root = dirname(dirname(fileURLToPath(import.meta.url)));

/** Extension-page / popup sender shape (chrome.runtime.MessageSender). */
function popupSender(overrides = {}) {
  return {
    id: RUNTIME_ID,
    url: `chrome-extension://${RUNTIME_ID}/src/popup/index.html`,
    origin: `chrome-extension://${RUNTIME_ID}`,
    ...overrides
  };
}

/** Content-script sender shape (e.g. imageLightbox.js). */
function contentScriptSender(overrides = {}) {
  return {
    id: RUNTIME_ID,
    url: "https://example.com/app",
    origin: "https://example.com",
    tab: { id: 42, url: "https://example.com/app" },
    frameId: 0,
    ...overrides
  };
}

function makeListener() {
  const generationCache = new Map();
  const colorViewMode = { value: "roles" };
  const downloads = [];
  const objectUrls = [];

  const deps = {
    generationCache,
    colorViewMode,
    runtimeId: RUNTIME_ID,
    downloadAsset: async (url, filename) => {
      downloads.push({ url, filename });
      return { ok: true, downloadId: downloads.length };
    },
    createObjectUrlFromBytes: (bytes, mime) => {
      if (bytes == null) return { error: "download-failed" };
      const objectUrl = `blob:mock-${objectUrls.length}-${mime}`;
      objectUrls.push(objectUrl);
      return {
        objectUrl,
        revoke: () => {
          const idx = objectUrls.indexOf(objectUrl);
          if (idx >= 0) objectUrls.splice(idx, 1);
        }
      };
    }
  };

  return {
    listener: createRuntimeMessageListener(deps),
    generationCache,
    colorViewMode,
    downloads,
    objectUrls
  };
}

/** Invoke the Chrome-style listener and capture sync or async sendResponse. */
function callListener(listener, message, sender) {
  return new Promise((resolve) => {
    let resolved = false;
    let keepChannel = false;
    const finish = (payload) => {
      if (resolved) return;
      resolved = true;
      resolve(payload);
    };
    const sendResponse = (response) => finish({ response, async: keepChannel });
    keepChannel = listener(message, sender, sendResponse) === true;
    if (!keepChannel) {
      queueMicrotask(() => {
        if (!resolved) finish({ response: undefined, async: false, missingResponse: true });
      });
    }
  });
}

test("listener wiring: popup sender can cache get/set and colour-view", async () => {
  const { listener, generationCache, colorViewMode } = makeListener();
  const sender = popupSender();
  const cache = { pageKey: "1::https://a.com", palette: [{ hex: "#abc" }] };

  const setResult = await callListener(
    listener,
    { type: "prism-generation-cache-set", pageKey: cache.pageKey, cache },
    sender
  );
  assert.deepEqual(setResult.response, { ok: true });
  assert.equal(generationCache.get(cache.pageKey), cache);

  const getResult = await callListener(
    listener,
    { type: "prism-generation-cache-get", pageKey: cache.pageKey },
    sender
  );
  assert.deepEqual(getResult.response, { cache });

  const viewSet = await callListener(
    listener,
    { type: "prism-color-view-set", mode: "stack" },
    sender
  );
  assert.deepEqual(viewSet.response, { ok: true });
  assert.equal(colorViewMode.value, "stack");

  const viewGet = await callListener(listener, { type: "prism-color-view-get" }, sender);
  assert.deepEqual(viewGet.response, { mode: "stack" });
});

test("listener wiring: content-script sender can close lightbox", async () => {
  const { listener } = makeListener();
  const result = await callListener(
    listener,
    { type: "prism-image-lightbox-closed" },
    contentScriptSender()
  );
  assert.deepEqual(result.response, { ok: true });
});

test("listener wiring: popup download-asset allowlist without real chrome.downloads", async () => {
  const { listener, downloads } = makeListener();
  const sender = popupSender();

  const rejected = await callListener(
    listener,
    { type: "prism-download-asset", url: "javascript:alert(1)" },
    sender
  );
  assert.equal(rejected.async, false);
  assert.deepEqual(rejected.response, { ok: false, error: "invalid-url" });
  assert.equal(downloads.length, 0);

  const accepted = await callListener(
    listener,
    {
      type: "prism-download-asset",
      url: "https://cdn.example.com/logo.svg",
      filename: "logo.svg"
    },
    sender
  );
  assert.equal(accepted.async, true);
  assert.deepEqual(accepted.response, { ok: true, downloadId: 1 });
  assert.deepEqual(downloads[0], {
    url: "https://cdn.example.com/logo.svg",
    filename: "logo.svg"
  });
});

test("listener wiring: download-bytes from popup uses blob URL mock only", async () => {
  const { listener, downloads, objectUrls } = makeListener();
  const result = await callListener(
    listener,
    {
      type: "prism-download-bytes",
      bytes: new Uint8Array([1, 2, 3]),
      mime: "application/zip",
      filename: "assets.zip"
    },
    popupSender()
  );
  assert.equal(result.async, true);
  assert.equal(result.response.ok, true);
  assert.equal(downloads[0].filename, "assets.zip");
  assert.match(downloads[0].url, /^blob:mock-/);
  assert.equal(objectUrls.length, 0);
});

test("listener rejects foreign sender id for cache and downloads", async () => {
  const { listener, generationCache, downloads } = makeListener();
  const foreign = contentScriptSender({ id: "other-extension-id" });

  const cache = await callListener(
    listener,
    { type: "prism-generation-cache-get", pageKey: "1::https://a.com" },
    foreign
  );
  assert.deepEqual(cache.response, { ok: false, error: "untrusted-sender" });

  const dl = await callListener(
    listener,
    { type: "prism-download-asset", url: "https://cdn.example.com/a.png" },
    foreign
  );
  assert.deepEqual(dl.response, { ok: false, error: "untrusted-sender" });
  assert.equal(generationCache.size, 0);
  assert.equal(downloads.length, 0);
});

test("listener rejects unknown types and malformed payloads", async () => {
  const { listener } = makeListener();
  const sender = popupSender();

  assert.deepEqual(
    (await callListener(listener, { type: "prism-not-a-thing" }, sender)).response,
    { ok: false, error: "unknown-type" }
  );
  assert.deepEqual(
    (await callListener(listener, { type: "prism-generation-cache-set", pageKey: "x" }, sender))
      .response,
    { ok: false, error: "invalid-payload" }
  );
  assert.deepEqual(
    (await callListener(listener, { type: "prism-color-view-set", mode: "grid" }, sender)).response,
    { ok: false, error: "invalid-payload" }
  );
  assert.deepEqual(
    (
      await callListener(listener, { type: "prism-download-asset", url: "file:///etc/passwd" }, sender)
    ).response,
    { ok: false, error: "invalid-url" }
  );
});

test("service-worker.js wires createRuntimeMessageListener", () => {
  const src = readFileSync(join(root, "src/background/service-worker.js"), "utf8");
  assert.match(src, /createRuntimeMessageListener/);
  assert.match(src, /chrome\.runtime\.onMessage\.addListener\(createRuntimeMessageListener\(/);
  assert.match(src, /from\s+["']\.\/messageHandler\.js["']/);
});
