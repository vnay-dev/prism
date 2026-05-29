import { readFileSync, writeFileSync } from "fs";
import { chromium } from "playwright";

const extractorSrc = readFileSync(new URL("../src/content/extractInPage.js", import.meta.url), "utf8");
const OUT = new URL("./benchmark-extractions/", import.meta.url);

const retries = [
  { file: "air-india.json", url: "https://www.airindia.in/" },
  { file: "spotify.json", url: "https://www.spotify.com/us/" }
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

for (const site of retries) {
  const page = await ctx.newPage();
  try {
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(4000);
    for (const sel of ["#onetrust-accept-btn-handler", 'button[id*="accept" i]', 'button:has-text("Accept")']) {
      const el = page.locator(sel).first();
      if (await el.count()) {
        await el.click({ timeout: 2000 }).catch(() => {});
        break;
      }
    }
    await page.evaluate(extractorSrc);
    const result = await page.evaluate(async () => window.__prismExtractPalette({ maxMillis: 20000 }));
    writeFileSync(new URL(site.file, OUT), JSON.stringify(result));
    console.log(site.file, result.sampledElements, result.sectionCount);
  } catch (e) {
    console.error(site.file, e.message);
  }
  await page.close();
}
await browser.close();
