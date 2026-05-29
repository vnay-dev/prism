/**
 * One-off benchmark extraction runner — does not modify src/.
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { chromium } from "playwright";

const SITES = [
  { file: "linear.json", url: "https://linear.app/" },
  { file: "stripe.json", url: "https://stripe.com/" },
  { file: "spotify.json", url: "https://www.spotify.com/" },
  { file: "vercel.json", url: "https://vercel.com/" },
  { file: "notion.json", url: "https://www.notion.so/" },
  { file: "framer.json", url: "https://www.framer.com/" },
  { file: "air-india.json", url: "https://www.airindia.com/" },
  { file: "apple.json", url: "https://www.apple.com/" },
  { file: "netflix.json", url: "https://www.netflix.com/" },
  { file: "slack.json", url: "https://slack.com/" }
];

const OUT_DIR = new URL("./benchmark-extractions/", import.meta.url);
const extractorSrc = readFileSync(new URL("../src/content/extractInPage.js", import.meta.url), "utf8");

mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

for (const site of SITES) {
  const outPath = new URL(site.file, OUT_DIR);
  console.log(`extracting ${site.file} from ${site.url}`);
  const page = await context.newPage();
  try {
    await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.evaluate(extractorSrc);
    const result = await page.evaluate(async () => {
      return await window.__prismExtractPalette({ maxMillis: 18000 });
    });
    writeFileSync(outPath, JSON.stringify(result));
    console.log(`  samples=${result.sampledElements} sections=${result.sectionCount}`);
  } catch (err) {
    console.error(`  FAILED ${site.file}:`, err.message);
    writeFileSync(outPath, JSON.stringify({ error: err.message, samples: [], sectionCount: 0 }));
  } finally {
    await page.close();
  }
}

await browser.close();
console.log("done");
