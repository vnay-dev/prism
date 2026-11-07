import { createDownloadUrlFromBytes } from "../core/downloadBytesUrl.js";
import { createRuntimeMessageListener, validateDownloadUrl } from "./messageHandler.js";

const RESTRICTED_PREFIXES = ["chrome://", "chrome-extension://", "edge://", "about:", "devtools://"];

const IS_DEV_BUILD = /\bdev\b/i.test(chrome.runtime.getManifest().name);

/** In-memory page results so reopening Prism on the same tab can skip a re-scan. */
const generationCacheByPage = new Map();
const colorViewModeByExtension = { value: "roles" };

function applyBuildBadge() {
  if (!IS_DEV_BUILD) return;
  chrome.action.setBadgeText({ text: "DEV" });
  chrome.action.setBadgeBackgroundColor({ color: "#d92d20" });
  chrome.action.setBadgeTextColor?.({ color: "#fdfdfd" });
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

    const urlCheck = validateDownloadUrl(url);
    if (!urlCheck.ok) {
      resolve({ ok: false, error: urlCheck.error });
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

const messageDeps = {
  generationCache: generationCacheByPage,
  colorViewMode: colorViewModeByExtension,
  downloadAsset: downloadAssetViaApi,
  createObjectUrlFromBytes: createDownloadUrlFromBytes,
  runtimeId: chrome.runtime.id
};

chrome.runtime.onMessage.addListener(createRuntimeMessageListener(messageDeps));

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
      files: ["src/content/togglePanel.js"],
      // Don't wait for a busy page's document_idle — open the shell right away.
      injectImmediately: true
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
