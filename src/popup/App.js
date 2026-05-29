import { curatePalette } from "../core/scoreAndCluster.js";
import { assignRoles } from "../core/assignRoles.js";
import { copyPaletteImage } from "./exportPaletteImage.js";

const introEl = document.getElementById("intro");
const resultsEl = document.getElementById("results");
const extractBtn = document.getElementById("extractBtn");
const extractAgainBtn = document.getElementById("extractAgainBtn");
const copyBtn = document.getElementById("copyBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");
const swatchesEl = document.getElementById("swatches");

function setResultsUiVisible(visible) {
  introEl.hidden = visible;
  resultsEl.hidden = !visible;
}

function resetApp() {
  currentPalette = [];
  swatchesEl.innerHTML = "";
  statusEl.textContent = "";
  setResultsUiVisible(false);
}

let currentPalette = [];

const ROLE_ORDER = ["foundation", "primary", "secondary", "accent", "neutral"];
const HERO_HEIGHT = 100;
const ROW_HEIGHT = HERO_HEIGHT / 2;

function buildBentoRows(swatches) {
  const byRole = {};
  for (const role of ROLE_ORDER) byRole[role] = swatches.filter((s) => s.role === role);

  const rows = [];

  if (byRole.foundation.length) {
    rows.push({ tiles: byRole.foundation, height: HERO_HEIGHT });
  }

  if (byRole.primary.length) {
    rows.push({ tiles: byRole.primary, height: HERO_HEIGHT });
  }

  const loneTiles = [];
  for (const role of ROLE_ORDER.filter((r) => r !== "foundation" && r !== "primary")) {
    const tiles = byRole[role];
    if (tiles.length >= 2) {
      rows.push({ tiles, height: ROW_HEIGHT });
    } else if (tiles.length === 1) {
      loneTiles.push(tiles[0]);
    }
  }

  for (let i = 0; i < loneTiles.length; i += 4) {
    rows.push({ tiles: loneTiles.slice(i, i + 4), height: ROW_HEIGHT });
  }

  return rows;
}

function renderSwatches(swatches) {
  swatchesEl.innerHTML = "";
  setResultsUiVisible(swatches.length > 0);

  for (const { tiles, height } of buildBentoRows(swatches)) {
    const row = document.createElement("div");
    row.className = "bento-row";
    row.style.height = `${height}px`;

    for (const swatch of tiles) {
      const tile = document.createElement("article");
      tile.className = `swatch role-${swatch.role}`;
      tile.dataset.tooltip = swatch.hex;
      tile.setAttribute("aria-label", swatch.hex);
      tile.style.backgroundColor = swatch.hex;
      row.appendChild(tile);
    }

    swatchesEl.appendChild(row);
  }
}

async function extractPalette() {
  statusEl.textContent = "Scanning page sections…";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("Active tab not found.");

  const scriptPromise = (async () => {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["src/content/extractInPage.js"]
    });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () =>
        window.__prismExtractPalette({
          maxMillis: 18000,
          scrollPauseMs: 180,
          maxElementsPerSection: 1800
        })
    });
    return result;
  })();
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("Scan timed out. Try again on a shorter page.")), 22000);
  });
  const result = await Promise.race([scriptPromise, timeoutPromise]);
  statusEl.textContent = "Building palette…";

  const curated = curatePalette(result);
  const assigned = assignRoles(curated);
  if (!assigned.swatches.length) {
    throw new Error("Could not extract colors from this page. Try another tab or refresh and retry.");
  }
  currentPalette = assigned.swatches.slice(0, 8);
  renderSwatches(currentPalette);
  statusEl.textContent = "";
}

async function runExtraction() {
  try {
    await extractPalette();
  } catch (error) {
    statusEl.textContent = error.message || "Extraction failed.";
  }
}

extractBtn.addEventListener("click", runExtraction);
extractAgainBtn.addEventListener("click", runExtraction);

resetBtn.addEventListener("click", resetApp);

copyBtn.addEventListener("click", async () => {
  try {
    await copyPaletteImage(currentPalette);
    statusEl.textContent = "Copied. Paste in Figma.";
  } catch (_error) {
    statusEl.textContent = "Could not copy image.";
  }
});
