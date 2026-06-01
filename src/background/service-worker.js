const RESTRICTED_PREFIXES = ["chrome://", "chrome-extension://", "edge://", "about:", "devtools://"];

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
