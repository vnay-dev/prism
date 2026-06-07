export const ERROR_MESSAGES = {
  NO_TAB:
    "No active tab was found. Click a website tab in Chrome, open Prism again, then click Extract palette.",
  UNSUPPORTED_PAGE:
    "This tab can't be scanned (blank page, New Tab, or a Chrome internal page). Open any regular website (https://…), click the Prism icon on that tab, then click Extract palette.",
  INJECTION_FAILED:
    "Prism couldn't read colors on this tab. Refresh the page, or switch to a different website tab and try again.",
  TIMEOUT:
    "This page took too long to scan. Try a shorter page, or click Extract palette again.",
  NO_PALETTE:
    "No usable brand colors were found on this page. Try a homepage or marketing page with richer design, then click Extract palette again.",
  NO_FONTS:
    "No font families were found on this page. Try a homepage or marketing page with more text, then click Extract font families again.",
  EXTRACTION_FAILED:
    "Something unexpected went wrong. Refresh the page and click Extract palette again.",
  COPY_FAILED:
    "Allow clipboard access for this extension, then click Copy palette again."
};

export const GUIDANCE_COPY = {
  title: "Can't scan this tab",
  message:
    "Open any regular website (https://…), click the Prism icon on that tab, then click Extract palette."
};

export const ERROR_BANNER_TITLE = "Couldn't extract palette";

const RESTRICTED_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "edge://",
  "about:",
  "devtools://",
  "view-source:",
  "file://",
  "data:",
  "blob:"
];

export function isUnsupportedPageUrl(url) {
  if (!url || typeof url !== "string") return true;
  const normalized = url.trim().toLowerCase();
  if (!normalized || normalized === "about:blank") return true;
  return RESTRICTED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function normalizeUserMessage(value) {
  if (value == null) return "";
  let text = value;
  if (value instanceof Error) text = value.message;
  else if (typeof value !== "string") return "";

  const trimmed = text.trim();
  if (!trimmed || trimmed === "undefined" || trimmed === "null") return "";
  return trimmed;
}

export function classifyExtractionError(error, context = {}) {
  if (context.unsupportedPage) return ERROR_MESSAGES.UNSUPPORTED_PAGE;
  if (context.noTab) return ERROR_MESSAGES.NO_TAB;
  if (context.noPalette) return ERROR_MESSAGES.NO_PALETTE;
  if (context.noFonts) return ERROR_MESSAGES.NO_FONTS;
  if (context.injectionFailed) return ERROR_MESSAGES.INJECTION_FAILED;
  if (context.timedOut) return ERROR_MESSAGES.TIMEOUT;

  const raw = normalizeUserMessage(error?.message ?? error);
  const lower = raw.toLowerCase();

  if (lower.includes("timed out") || lower.includes("timeout")) {
    return ERROR_MESSAGES.TIMEOUT;
  }

  if (
    lower.includes("cannot access") ||
    lower.includes("cannot be scripted") ||
    lower.includes("extension manifest") ||
    lower.includes("showing error page") ||
    lower.includes("frame was removed") ||
    lower.includes("receiving end does not exist") ||
    lower.includes("scripting") ||
    lower.includes("injection")
  ) {
    return ERROR_MESSAGES.INJECTION_FAILED;
  }

  if (raw && !raw.includes("Next:")) {
    return `${raw} Refresh the page and click Extract palette again.`;
  }

  if (raw) return raw;
  return ERROR_MESSAGES.EXTRACTION_FAILED;
}

export function isExtractionResultEmpty(result) {
  if (!result || typeof result !== "object") return true;
  if (!Array.isArray(result.samples) || result.samples.length === 0) return true;
  return false;
}

export function isFontExtractionEmpty(result) {
  if (!result || typeof result !== "object") return true;
  if (!Array.isArray(result.fontSamples) || result.fontSamples.length === 0) return true;
  return false;
}

export function isRestrictedPopupContext() {
  if (typeof location === "undefined") return false;
  return new URLSearchParams(location.search).get("context") === "restricted";
}
