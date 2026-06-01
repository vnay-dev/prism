/**
 * Resolve the website tab the user intended to scan.
 * Embedded panel: last focused browser window. Fallback popup: ?tabId= from service worker.
 */
export async function getTargetTab() {
  const tabIdParam = new URLSearchParams(location.search).get("tabId");
  if (tabIdParam) {
    const id = Number(tabIdParam);
    if (Number.isInteger(id) && id > 0) {
      try {
        return await chrome.tabs.get(id);
      } catch {
        /* tab closed — fall through */
      }
    }
  }

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}
