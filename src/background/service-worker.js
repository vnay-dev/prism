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
