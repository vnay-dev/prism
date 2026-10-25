const RESTRICTED_PREFIXES = ["chrome://", "chrome-extension://", "edge://", "about:", "devtools://"];

const IS_DEV_BUILD = /\bdev\b/i.test(chrome.runtime.getManifest().name);

/** In-memory page results so reopening Prism on the same tab can skip a re-scan. */
const generationCacheByPage = new Map();
const colorViewModeByExtension = { value: "roles" };

function applyBuildBadge() {
  if (!IS_DEV_BUILD) return;
  chrome.action.setBadgeText({ text: "DEV" });
  chrome.action.setBadgeBackgroundColor({ color: "#d92d20" });
  chrome.action.setBadgeTextColor?.({ color: "#ffffff" });
}

chrome.runtime.onInstalled.addListener(applyBuildBadge);
chrome.runtime.onStartup.addListener(applyBuildBadge);
applyBuildBadge();

/** Track download completion so the popup never claims success on failure. */
const pendingDownloads = new Map();
const downloadsApi = chrome.downloads;

function settleDownload(downloadId, result) {
  const pending = pendingDownloads.get(downloadId);
  if (!pending) return;
  pendingDownloads.delete(downloadId);
  clearTimeout(pending.timer);
  pending.resolve(result);
}

if (downloadsApi?.onChanged) {
  downloadsApi.onChanged.addListener((delta) => {
    if (!pendingDownloads.has(delta.id)) return;
    if (delta.state?.current === "complete") {
      settleDownload(delta.id, { ok: true, downloadId: delta.id });
      return;
    }
    if (delta.state?.current === "interrupted") {
      settleDownload(delta.id, {
        ok: false,
        error: delta.error?.current === "USER_CANCELED" ? "denied" : "interrupted"
      });
    }
  });
}

function downloadAssetViaApi(url, filename) {
  return new Promise((resolve) => {
    if (!downloadsApi?.download) {
      resolve({ ok: false, error: "unavailable" });
      return;
    }

    if (!url || typeof url !== "string") {
      resolve({ ok: false, error: "invalid-url" });
      return;
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      resolve({ ok: false, error: "invalid-url" });
      return;
    }

    if (!["http:", "https:", "data:", "blob:"].includes(parsed.protocol)) {
      resolve({ ok: false, error: "invalid-url" });
      return;
    }

    const options = {
      url,
      conflictAction: "uniquify",
      saveAs: false
    };
    if (filename && typeof filename === "string") {
      options.filename = filename.replace(/^[/\\]+/, "");
    }

    try {
      downloadsApi.download(options, (downloadId) => {
        if (chrome.runtime.lastError || typeof downloadId !== "number") {
          const message = chrome.runtime.lastError?.message || "";
          const lower = message.toLowerCase();
          let error = "download-failed";
          if (lower.includes("invalid") || lower.includes("not allowed")) error = "invalid-url";
          else if (lower.includes("network") || lower.includes("server")) error = "inaccessible";
          else if (lower.includes("denied") || lower.includes("cancel")) error = "denied";
          resolve({ ok: false, error });
          return;
        }

        const timer = setTimeout(() => {
          settleDownload(downloadId, { ok: false, error: "interrupted" });
        }, 60000);

        pendingDownloads.set(downloadId, {
          resolve,
          timer
        });
      });
    } catch (error) {
      resolve({ ok: false, error: error?.message || "download-failed" });
    }
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type;
  if (type === "prism-generation-cache-get") {
    sendResponse({ cache: generationCacheByPage.get(message.pageKey) || null });
    return false;
  }
  if (type === "prism-generation-cache-set") {
    if (message.pageKey && message.cache) {
      generationCacheByPage.set(message.pageKey, message.cache);
    }
    sendResponse({ ok: true });
    return false;
  }
  if (type === "prism-generation-cache-clear") {
    if (message.pageKey) generationCacheByPage.delete(message.pageKey);
    sendResponse({ ok: true });
    return false;
  }
  if (type === "prism-color-view-get") {
    sendResponse({ mode: colorViewModeByExtension.value || "roles" });
    return false;
  }
  if (type === "prism-color-view-set") {
    if (message.mode) colorViewModeByExtension.value = message.mode;
    sendResponse({ ok: true });
    return false;
  }
  if (type === "prism-download-asset") {
    downloadAssetViaApi(message.url, message.filename).then(sendResponse);
    return true;
  }
  if (type === "prism-download-bytes") {
    const bytes = message.bytes;
    if (!bytes) {
      sendResponse({ ok: false, error: "invalid-url" });
      return false;
    }
    const mime =
      typeof message.mime === "string" && message.mime.includes("/")
        ? message.mime
        : "application/octet-stream";
    let objectUrl = null;
    try {
      const blob = new Blob([bytes], { type: mime });
      objectUrl = URL.createObjectURL(blob);
    } catch {
      sendResponse({ ok: false, error: "download-failed" });
      return false;
    }
    downloadAssetViaApi(objectUrl, message.filename)
      .then((result) => {
        if (objectUrl) {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch {
            /* ignore */
          }
        }
        sendResponse(result);
      })
      .catch(() => {
        if (objectUrl) {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch {
            /* ignore */
          }
        }
        sendResponse({ ok: false, error: "download-failed" });
      });
    return true;
  }
  // Popup listens for lightbox close to clear tile selection; acknowledge here.
  if (type === "prism-image-lightbox-closed") {
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id) return;

  const url = tab.url || "";
  const isRestricted =
    !url ||
    url === "about:blank" ||
    RESTRICTED_PREFIXES.some((prefix) => url.startsWith(prefix));
  const popupUrl = chrome.runtime.getURL(
    isRestricted ? "src/popup/index.html?context=restricted" : "src/popup/index.html"
  );

  if (isRestricted) {
    await chrome.windows.create({
      url: popupUrl,
      type: "popup",
      width: 396,
      height: 220,
      focused: true
    });
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/content/togglePanel.js"]
    });
  } catch (_error) {
    const fallbackUrl = `${popupUrl}${popupUrl.includes("?") ? "&" : "?"}tabId=${tab.id}`;
    await chrome.windows.create({
      url: fallbackUrl,
      type: "popup",
      width: 412,
      height: 520,
      focused: true
    });
  }
});
