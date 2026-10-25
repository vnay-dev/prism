/**
 * Render Images / Icons result grids and wire select / inspect / download.
 */

import {
  formatDimensions,
  formatFileSize,
  formatLabel
} from "../core/assetUtils.js";

export function renderAssetGrid(
  container,
  assets,
  {
    onDownload,
    onPreview,
    onToggleSelect,
    selectedAssetIds = null
  } = {}
) {
  if (!container) return;
  container.innerHTML = "";

  if (!assets?.length) {
    const empty = document.createElement("p");
    empty.className = "assets-empty";
    empty.textContent = "No downloadable assets found on this page.";
    container.appendChild(empty);
    return;
  }

  const selected = selectedAssetIds instanceof Set ? selectedAssetIds : new Set();

  for (const asset of assets) {
    container.appendChild(
      createAssetCard(asset, {
        onDownload,
        onPreview,
        onToggleSelect,
        checked: selected.has(asset.id)
      })
    );
  }
}

function refreshEmptyState(container) {
  if (!container || container.querySelector(".asset-card")) return;
  if (container.querySelector(".assets-empty")) return;
  const empty = document.createElement("p");
  empty.className = "assets-empty";
  empty.textContent = "No downloadable assets found on this page.";
  container.appendChild(empty);
}

export function syncAssetCardSelectionState(containers, { selectedAssetIds = null } = {}) {
  const selected = selectedAssetIds instanceof Set ? selectedAssetIds : new Set();
  for (const grid of containers || []) {
    grid?.querySelectorAll(".asset-card").forEach((card) => {
      const checked = selected.has(card.dataset.assetId);
      card.classList.toggle("is-checked", checked);
      const preview = card.querySelector(".asset-preview");
      if (preview) {
        preview.title = checked ? "Unselect" : "Select";
        preview.setAttribute(
          "aria-label",
          checked ? "Unselect asset" : "Select asset"
        );
      }
    });
  }
}

function createIconButton({ className, icon, title, ariaLabel, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = title;
  button.setAttribute("aria-label", ariaLabel);
  button.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">${icon}</span>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick?.(event);
  });
  return button;
}

export function createAssetCard(
  asset,
  {
    onDownload,
    onPreview,
    onToggleSelect,
    checked = false
  } = {}
) {
  const card = document.createElement("article");
  card.className = "asset-card";
  if (checked) card.classList.add("is-checked");
  card.dataset.assetId = asset.id;
  if (asset.format) card.dataset.format = asset.format;

  const preview = document.createElement("button");
  preview.type = "button";
  preview.className = "asset-preview";
  preview.setAttribute(
    "aria-label",
    checked ? `Unselect ${asset.filename || "asset"}` : `Select ${asset.filename || "asset"}`
  );
  preview.title = checked ? "Unselect" : "Select";
  preview.addEventListener("click", (event) => {
    event.preventDefault();
    preview.blur();
    onToggleSelect?.(asset);
  });

  const skeleton = document.createElement("span");
  skeleton.className = "asset-skeleton";
  skeleton.setAttribute("aria-hidden", "true");

  const img = document.createElement("img");
  img.className = "asset-thumb";
  img.loading = "lazy";
  img.decoding = "async";
  img.alt = "";

  const markLoaded = () => {
    card.classList.remove("is-loading");
    card.classList.add("is-loaded");
  };

  img.addEventListener("load", markLoaded);
  img.addEventListener("error", () => {
    const grid = card.parentElement;
    card.remove();
    refreshEmptyState(grid);
  });

  card.classList.add("is-loading");
  img.src = asset.url;
  if (img.complete && img.naturalWidth > 0) {
    markLoaded();
  }

  preview.append(skeleton, img);

  const info = document.createElement("div");
  info.className = "asset-info";

  const meta = document.createElement("div");
  meta.className = "asset-meta";

  const format =
    asset.format && asset.format !== "unknown" ? formatLabel(asset.format) : null;
  const dims = formatDimensions(asset.width, asset.height) || asset.viewBox || null;
  const size = formatFileSize(asset.fileSize);

  if (format) {
    const formatEl = document.createElement("p");
    formatEl.className = "asset-format";
    formatEl.textContent = format;
    meta.appendChild(formatEl);
  }
  if (dims) {
    const dimsEl = document.createElement("p");
    dimsEl.className = "asset-dims";
    dimsEl.textContent = dims;
    meta.appendChild(dimsEl);
  }
  if (size) {
    const sizeEl = document.createElement("p");
    sizeEl.className = "asset-size";
    sizeEl.textContent = size;
    meta.appendChild(sizeEl);
  }

  const downloadBtn = createIconButton({
    className: "asset-download-btn",
    icon: "download",
    title: "Download original",
    ariaLabel: `Download ${asset.filename || "asset"}`,
    onClick: () => onDownload?.(asset, downloadBtn)
  });

  info.append(meta, downloadBtn);
  card.append(preview, info);

  if (onPreview) {
    const actions = document.createElement("div");
    actions.className = "asset-actions";
    actions.appendChild(
      createIconButton({
        className: "asset-inspect-btn",
        icon: "visibility",
        title: "Inspect image",
        ariaLabel: `Inspect ${asset.filename || "image"}`,
        onClick: () => onPreview(asset)
      })
    );
    card.appendChild(actions);
  }

  return card;
}

export function flashAssetDownloadFeedback(button, success) {
  if (!button) return;
  clearTimeout(button._downloadFeedbackTimer);
  const previous = button.innerHTML;
  const icon = success ? "check" : "error";
  button.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">${icon}</span>`;
  button.classList.toggle("is-success", success);
  button.classList.toggle("is-error", !success);
  button._downloadFeedbackTimer = window.setTimeout(() => {
    button.innerHTML = previous;
    button.classList.remove("is-success", "is-error");
    button._downloadFeedbackTimer = null;
  }, 2000);
}
