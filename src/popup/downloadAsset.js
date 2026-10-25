/**
 * Download helpers for page assets. Uses chrome.downloads via the service
 * worker so original remote URLs can be saved without host_permissions.
 * Multi-select packs files into a ZIP when bytes can be read in-page.
 */

import { buildZipStore } from "../core/zipStore.js";

export function buildDownloadFilename(asset) {
  if (!asset) return "asset.bin";
  const name = asset.filename || "asset";
  return String(name).replace(/^[/\\]+/, "");
}

/** Deduplicate filenames inside a ZIP (`a.png`, `a-2.png`, …). */
export function uniqueZipEntryNames(assets) {
  const used = new Map();
  return (assets || []).map((asset) => {
    const base = buildDownloadFilename(asset) || "asset.bin";
    const next = (used.get(base) || 0) + 1;
    used.set(base, next);
    if (next === 1) return base;
    const dot = base.lastIndexOf(".");
    if (dot > 0) return `${base.slice(0, dot)}-${next}${base.slice(dot)}`;
    return `${base}-${next}`;
  });
}

function sendDownloadMessage(payload) {
  if (!chrome?.runtime?.sendMessage) {
    return Promise.resolve({ ok: false, error: "unavailable" });
  }

  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(payload, (result) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message || "runtime-error" });
          return;
        }
        resolve(result || { ok: false, error: "no-response" });
      });
    } catch (error) {
      resolve({ ok: false, error: error?.message || "send-failed" });
    }
  });
}

/**
 * Ask the background service worker to download `asset.url` with the original
 * filename when available. Resolves `{ ok, error? }` — never reports success
 * when the browser marks the download interrupted or denied.
 */
export async function downloadAsset(asset) {
  if (!asset?.url) {
    return { ok: false, error: "missing-url" };
  }

  const filename = buildDownloadFilename(asset);
  const response = await sendDownloadMessage({
    type: "prism-download-asset",
    url: asset.url,
    filename
  });

  if (!response?.ok) {
    return {
      ok: false,
      error: response?.error || "download-failed"
    };
  }
  return { ok: true, downloadId: response.downloadId };
}

async function downloadZipBytes(bytes, filename) {
  const buffer =
    bytes instanceof Uint8Array
      ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      : bytes;

  const response = await sendDownloadMessage({
    type: "prism-download-bytes",
    bytes: buffer,
    filename,
    mime: "application/zip"
  });

  if (!response?.ok) {
    return { ok: false, error: response?.error || "download-failed" };
  }
  return { ok: true, downloadId: response.downloadId };
}

/**
 * Read asset bytes in the page (same-origin + CORS-allowed). Data/blob URLs
 * are fetched from the extension context.
 * @returns {Promise<Map<string, Uint8Array|null>>}
 */
export async function fetchAssetBytes(assets, tabId) {
  const byId = new Map();
  const needPage = [];

  for (const asset of assets || []) {
    if (!asset?.id) continue;
    const url = asset.url;
    if (!url || typeof url !== "string") {
      byId.set(asset.id, null);
      continue;
    }

    if (url.startsWith("data:") || url.startsWith("blob:")) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("bad-status");
        byId.set(asset.id, new Uint8Array(await res.arrayBuffer()));
      } catch {
        byId.set(asset.id, null);
      }
      continue;
    }

    needPage.push({ id: asset.id, url });
  }

  if (!needPage.length) return byId;

  if (!tabId || !chrome?.scripting?.executeScript) {
    for (const item of needPage) byId.set(item.id, null);
    return byId;
  }

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async (items) => {
        const out = [];
        for (const item of items) {
          try {
            const res = await fetch(item.url, {
              credentials: "include",
              cache: "force-cache",
              mode: "cors"
            });
            if (!res.ok) throw new Error("bad-status");
            const buffer = await res.arrayBuffer();
            out.push({ id: item.id, ok: true, buffer });
          } catch {
            out.push({ id: item.id, ok: false });
          }
        }
        return out;
      },
      args: [needPage]
    });

    for (const row of result || []) {
      if (!row?.id) continue;
      if (row.ok && row.buffer) {
        byId.set(row.id, new Uint8Array(row.buffer));
      } else {
        byId.set(row.id, null);
      }
    }
  } catch {
    for (const item of needPage) byId.set(item.id, null);
  }

  return byId;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Pack selected assets into one ZIP when possible. Falls back to individual
 * chrome.downloads when no bytes can be read (typical CORS blocks).
 */
export async function downloadAssetsAsZip(assets, { tabId, zipFilename } = {}) {
  const list = Array.isArray(assets) ? assets.filter(Boolean) : [];
  if (!list.length) return { ok: false, error: "missing-url", mode: "none" };

  const names = uniqueZipEntryNames(list);
  const bytesById = await fetchAssetBytes(list, tabId);
  const entries = [];
  let missed = 0;

  list.forEach((asset, index) => {
    const data = bytesById.get(asset.id);
    if (data?.byteLength) {
      entries.push({ name: names[index], data });
    } else {
      missed += 1;
    }
  });

  if (!entries.length) {
    let failed = 0;
    for (const asset of list) {
      const result = await downloadAsset(asset);
      if (!result.ok) failed += 1;
      await delay(120);
    }
    return {
      ok: failed < list.length,
      mode: "individual",
      packed: 0,
      failed,
      total: list.length
    };
  }

  const zipBytes = buildZipStore(entries);
  const filename = (zipFilename || "prism-assets.zip").replace(/^[/\\]+/, "");
  const response = await downloadZipBytes(zipBytes, filename);

  if (!response.ok) {
    return {
      ok: false,
      mode: "zip",
      error: response.error || "download-failed",
      packed: entries.length,
      failed: missed,
      total: list.length
    };
  }

  // Assets blocked by CORS still go through chrome.downloads one-by-one.
  let leftoverFailed = 0;
  if (missed > 0) {
    for (const asset of list) {
      const data = bytesById.get(asset.id);
      if (data?.byteLength) continue;
      const single = await downloadAsset(asset);
      if (!single.ok) leftoverFailed += 1;
      await delay(120);
    }
  }

  return {
    ok: true,
    mode: "zip",
    packed: entries.length,
    failed: leftoverFailed,
    skippedFromZip: missed,
    total: list.length,
    downloadId: response.downloadId
  };
}

export function downloadErrorMessage(code) {
  switch (code) {
    case "missing-url":
      return "This asset has no downloadable URL.";
    case "invalid-url":
      return "This asset URL can’t be downloaded.";
    case "inaccessible":
      return "This asset couldn’t be reached (blocked, private, or unavailable).";
    case "interrupted":
      return "The download was interrupted before it finished.";
    case "denied":
      return "The download was blocked by the browser.";
    case "unavailable":
      return "Downloads aren’t available in this context.";
    default:
      return "Download failed. Try opening the asset URL in a new tab.";
  }
}
