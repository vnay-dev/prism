# Privacy Policy — Prism Palette Extractor

**Last updated:** June 6, 2026  
**Version:** 0.2.0

Prism Palette Extractor (“Prism”, “the extension”) is a Chrome extension that helps designers extract color palettes and font families from web pages. This policy describes what the extension accesses and how that information is handled.

## Summary

- Prism runs **entirely in your browser**. Extraction and curation do not send page data to our servers.
- We do **not** sell, rent, or share your data with third parties for advertising or profiling.
- We do **not** use analytics or tracking in the extension.

## What data the extension accesses

When you use Prism on a website tab, the extension may access:

- **Rendered page styles** on the tab you selected, only while you run extraction:
  - **Colors** — background, text, border, and SVG fill/stroke colors from computed styles
  - **Typography** — `font-family`, `font-weight`, and related computed font properties on visible text elements
- **Page metadata** used for export labels (document title, hostname, and optional `og:site_name` / `application-name` meta tags).
- **Tab information** for the active tab you invoked the extension on (such as URL and title), only to run extraction and label exports.

Prism does not read passwords, form fields, cookies, browsing history beyond the tab you are working with, or data from other tabs in the background.

## What the extension does not do

- No account sign-in or user profiles.
- No collection of personal information for marketing.
- No transmission of extracted palettes, font lists, or raw page samples to Prism developers or third-party backends operated by us.

## Network connections

**Extraction** does not require network access and does not upload page content.

The extension **UI** loads typography from Google Fonts (`fonts.googleapis.com` and `fonts.gstatic.com`) when you open the panel. Those requests are made by Chrome to Google’s servers and may include standard connection metadata (such as IP address) as described in [Google’s Privacy Policy](https://policies.google.com/privacy). No page content is sent as part of font loading.

## Permissions (why they exist)

| Permission | Purpose |
|------------|---------|
| `activeTab` | Access the tab you clicked the extension icon on, only while you use Prism |
| `scripting` | Inject a short-lived script to sample colors and typography on that tab |
| `clipboardWrite` | Copy the generated palette PNG or a font family name when you click copy |

`web_accessible_resources` allows the in-page panel (iframe) to load the extension UI on sites you visit. It does not grant ongoing access to all sites without your action.

## Data retention

Extracted palettes and font results exist only in extension memory and your clipboard until you close the panel or copy elsewhere. Prism does not store results on remote servers.

## Children

Prism is not directed at children under 13, and we do not knowingly collect personal information from children.

## Changes

We may update this policy for new features or legal requirements. The “Last updated” date at the top will change when we do.

## Contact

For privacy questions about this extension, open an issue on the project repository or contact the developer listed on the Chrome Web Store listing.
