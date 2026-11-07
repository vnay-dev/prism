# Privacy Policy — Prism

**Last updated:** November 7, 2026  
**Version:** 0.6.4

Prism (“the extension”) is a Chrome extension that helps designers extract color palettes, font families, images, and icons from web pages. This policy describes what the extension accesses and how that information is handled.

## Summary

- Prism runs **entirely in your browser**. Extraction and curation do not send page data to our servers.
- We do **not** sell, rent, or share your data with third parties for advertising or profiling.
- We do **not** use analytics or tracking in the extension.

## What data the extension accesses

When you use Prism on a website tab, the extension may access:

- **Rendered page styles** on the tab you selected, only while you run extraction:
  - **Colors** — background, text, border, and SVG fill/stroke colors from computed styles
  - **Gradients** — CSS gradient values from computed backgrounds
  - **Typography** — `font-family`, `font-weight`, and related computed font properties on visible text elements
- **Page asset URLs** (and inline SVG markup for icons) for images and icons you browse or download in the Images / Icons tabs.
- **Page metadata** used for export labels (document title, hostname, and optional `og:site_name` / `application-name` meta tags).
- **Tab information** for the active tab you invoked the extension on (such as URL and title), only to run extraction and label exports.

Prism does not read passwords, form fields, or browsing history beyond the tab you are working with, or data from other tabs in the background. Prism does **not** read or extract the browser cookie store directly. When you start a multi-asset ZIP or batch download, the extension may fetch those asset URLs **in the page context** with `credentials: "include"` so same-origin or cookie-gated assets the page could already load can be packaged — that uses the site’s existing cookies for those requests only, under your download action (see [Network connections](#network-connections)).

## What the extension does not do

- No account sign-in or user profiles.
- No collection of personal information for marketing.
- No transmission of extracted palettes, font lists, or raw page samples to Prism developers or third-party backends operated by us.

## Network connections

**Extraction** does not require network access and does not upload page content.

The extension **UI** loads typography from Google Fonts (`fonts.googleapis.com` and `fonts.gstatic.com`) when you open the panel. Those requests are made by Chrome to Google’s servers and may include standard connection metadata (such as IP address) as described in [Google’s Privacy Policy](https://policies.google.com/privacy). No page content is sent as part of font loading.

**User-initiated downloads:** single-asset saves use Chrome’s `downloads` API with the asset URL you selected (`http:`, `https:`, `data:`, or `blob:`). Multi-select ZIP / batch packaging may additionally `fetch` those URLs inside the active tab (page context) with the site’s cookies included where the browser would normally send them for that page. Prism does not upload those bytes to Prism servers; they are assembled locally for your download.

## Permissions (why they exist)

| Permission | Purpose |
|------------|---------|
| `activeTab` | Access the tab you clicked the extension icon on, only while you use Prism |
| `scripting` | Inject a short-lived script to sample colors, gradients, typography, and asset URLs on that tab |
| `clipboardWrite` | Copy the generated palette PNG or a font family name when you click copy |
| `downloads` | Save an image/icon (or a zip of your multi-select) to your Downloads folder when you click Download |

`web_accessible_resources` allows the in-page panel (iframe) to load the extension UI on sites you visit. It does not grant ongoing access to all sites without your action.

## Data retention

Extracted palettes, fonts, gradients, and asset lists are kept **only on your device** (never on Prism remote servers). Clipboard and Downloads copies you create remain under your control.

**In-session reuse:** after an extraction, the extension service worker may hold a generation cache for that page key (`tabId` + URL) in an **in-memory `Map`**. Closing the in-page panel does **not** by itself clear that cache, so reopening Prism on the same tab/URL can reuse results without immediately re-scanning while that service worker stays alive. Chrome may terminate the service worker when idle; there is **no fixed retention timer** enforced by Prism.

**Invalidation / clearing (verified behaviour):**

- Navigating to a different URL (or tab) uses a different page key; prior keys are not automatically deleted from the map but are no longer selected for that session UI.
- **Reset** in the panel clears that mode’s results in the UI and persists the updated cache snapshot for the current page key (it does not wipe unrelated keys).
- The worker’s `prism-generation-cache-clear` message can delete one page key when invoked; the panel close path does not currently send it.
- Full process / worker restart drops the in-memory map.

Prism does not write generation results to `chrome.storage` or disk beyond what you explicitly download or copy.

## Children

Prism is not directed at children under 13, and we do not knowingly collect personal information from children.

## Changes

We may update this policy for new features or legal requirements. The “Last updated” date at the top will change when we do.

## Contact

For privacy questions about this extension, open an issue on the project repository or contact the developer listed on the Chrome Web Store listing.
