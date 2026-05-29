function roleTitle(role) {
  if (role === "foundation") return "Foundation";
  return role.slice(0, 1).toUpperCase() + role.slice(1);
}

export function renderPalettePng(swatches) {
  const width = 1200;
  const height = 720;
  const columns = 4;
  const rows = 2;
  const padding = 42;
  const gap = 24;
  const tileWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
  const tileHeight = (height - padding * 2 - gap * (rows - 1)) / rows;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#111111";
  ctx.font = "bold 34px Segoe UI";
  ctx.fillText("Website Palette", padding, 36);

  swatches.slice(0, 8).forEach((swatch, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = padding + col * (tileWidth + gap);
    const y = 76 + row * (tileHeight + gap);
    const cardHeight = tileHeight - 34;

    ctx.fillStyle = "#f7f8fb";
    ctx.fillRect(x, y, tileWidth, cardHeight);

    ctx.fillStyle = swatch.hex;
    ctx.fillRect(x, y, tileWidth, cardHeight - 74);

    ctx.fillStyle = "#16171b";
    ctx.font = "600 24px Segoe UI";
    ctx.fillText(roleTitle(swatch.role), x + 14, y + cardHeight - 36);
    ctx.font = "22px Consolas";
    ctx.fillText(swatch.hex.toUpperCase(), x + 14, y + cardHeight - 12);
  });

  return canvas;
}

export async function copyPaletteImage(swatches) {
  const canvas = renderPalettePng(swatches);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not render PNG.");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

export async function downloadPaletteImage(swatches) {
  const canvas = renderPalettePng(swatches);
  const dataUrl = canvas.toDataURL("image/png");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const host = tab?.url ? new URL(tab.url).hostname.replace(/[^a-z0-9.-]/gi, "_") : "palette";
  await chrome.downloads.download({
    url: dataUrl,
    filename: `prism-palette-${host}.png`,
    saveAs: true
  });
}
