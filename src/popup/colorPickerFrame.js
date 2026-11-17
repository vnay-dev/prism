import { openColorPicker, closeColorPicker } from "./colorPicker.js";
import { openGradientPicker, closeGradientPicker } from "./gradientPicker.js";

const cardEl = document.getElementById("colorPickerCard");
const titleEl = document.querySelector(".color-picker-card-title");
const mountEl = document.getElementById("colorPickerMount");
const closeBtn = document.getElementById("colorPickerClose");
let activeSwatchId = null;
let activeGradientId = null;
let activeEpoch = 0;
let activeMode = "solid";
let ignoreCloseNotify = false;
let pickerOpen = false;
let gradientApi = null;
let editingStopId = null;

function postToHost(payload) {
  window.parent.postMessage(payload, "*");
}

let lastReportedHeight = 0;

function reportHeight() {
  if (!cardEl) return;
  // Measure the card only — body/document scrollHeight tracks the iframe
  // viewport and prevents the shell from shrinking when content gets shorter.
  const cardRect = cardEl.getBoundingClientRect();
  let contentBottom = cardRect.top + Math.max(cardRect.height, cardEl.offsetHeight || 0);
  for (const menu of cardEl.querySelectorAll(".content-menu-list:not([hidden])")) {
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.bottom > contentBottom) contentBottom = menuRect.bottom;
  }
  const measured = Math.max(0, contentBottom - cardRect.top);
  // Small buffer avoids a 1px overflow → scrollbar → layout feedback loop.
  const height = Math.ceil(measured + 6);
  if (height > 0 && height !== lastReportedHeight) {
    lastReportedHeight = height;
    postToHost({ type: "prism-cp-resize", height });
  }
}

function setTitle(mode) {
  if (!titleEl) return;
  titleEl.textContent = mode === "gradient" ? "Gradient" : "Color picker";
}

function notifyClosed() {
  const swatchId = activeSwatchId;
  const gradientId = activeGradientId;
  const epoch = activeEpoch;
  const mode = activeMode;
  activeSwatchId = null;
  activeGradientId = null;
  editingStopId = null;
  pickerOpen = false;
  gradientApi = null;
  postToHost({ type: "prism-cp-closed", swatchId, gradientId, mode, epoch });
}

function teardownPickers() {
  ignoreCloseNotify = true;
  closeColorPicker({ immediate: true });
  closeGradientPicker({ immediate: true });
  ignoreCloseNotify = false;
  pickerOpen = false;
  gradientApi = null;
  editingStopId = null;
  if (mountEl) mountEl.replaceChildren();
}

function requestClose() {
  if (pickerOpen) {
    if (activeMode === "gradient") closeGradientPicker({ immediate: true });
    else closeColorPicker({ immediate: true });
    return;
  }
  notifyClosed();
}

function bootSolidPicker(hex, swatchId, { stopId = null } = {}) {
  activeMode = "solid";
  activeSwatchId = swatchId || null;
  activeGradientId = null;
  editingStopId = stopId;
  gradientApi = null;
  setTitle("solid");
  openColorPicker({
    hex,
    mountEl,
    onInput: (color) => {
      postToHost({
        type: "prism-cp-input",
        mode: stopId ? "stop-color" : "solid",
        hex: color.hex,
        swatchId: activeSwatchId,
        stopId
      });
    },
    onCommit: (color) => {
      postToHost({
        type: "prism-cp-commit",
        mode: stopId ? "stop-color" : "solid",
        hex: color.hex,
        swatchId: activeSwatchId,
        stopId
      });
    },
    onClose: () => {
      if (ignoreCloseNotify) return;
      notifyClosed();
    }
  });
  pickerOpen = true;
}

function bootGradientPicker(css, gradientId, stops) {
  activeMode = "gradient";
  activeGradientId = gradientId || null;
  activeSwatchId = null;
  editingStopId = null;
  setTitle("gradient");
  gradientApi = openGradientPicker({
    css,
    stops,
    mountEl,
    onInput: (payload) => {
      postToHost({
        type: "prism-cp-input",
        mode: "gradient",
        css: payload.css,
        gradientId: activeGradientId
      });
    },
    onCommit: (payload) => {
      postToHost({
        type: "prism-cp-commit",
        mode: "gradient",
        css: payload.css,
        gradientId: activeGradientId
      });
    },
    onEditStopColor: (stop) => {
      editingStopId = stop.id;
      postToHost({
        type: "prism-cp-edit-stop",
        stopId: stop.id,
        hex: stop.hex,
        gradientId: activeGradientId
      });
    },
    onCloseStopColor: () => {
      editingStopId = null;
      postToHost({ type: "prism-cp-close-stop-editor" });
    },
    onLayoutChange: () => {
      lastReportedHeight = 0;
      requestAnimationFrame(() => {
        reportHeight();
        requestAnimationFrame(reportHeight);
      });
    },
    onClose: () => {
      if (ignoreCloseNotify) return;
      postToHost({ type: "prism-cp-close-stop-editor" });
      notifyClosed();
    }
  });
  pickerOpen = true;
}

function bootPicker(payload = {}) {
  const {
    mode = "solid",
    hex,
    swatchId,
    css,
    gradientId,
    stops,
    stopId,
    epoch
  } = payload;
  activeEpoch = typeof epoch === "number" ? epoch : activeEpoch;
  lastReportedHeight = 0;
  teardownPickers();
  if (!mountEl) {
    notifyClosed();
    return;
  }

  if (mode === "gradient") {
    bootGradientPicker(typeof css === "string" ? css : "", gradientId, stops);
  } else {
    bootSolidPicker(typeof hex === "string" ? hex : "#00c600", swatchId, {
      stopId: typeof stopId === "string" ? stopId : null
    });
  }

  requestAnimationFrame(() => {
    reportHeight();
    requestAnimationFrame(reportHeight);
  });
}

if (cardEl && typeof ResizeObserver === "function") {
  const heightObserver = new ResizeObserver(() => {
    reportHeight();
  });
  heightObserver.observe(cardEl);
}

closeBtn?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  requestClose();
});

document.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Escape") return;
    // Let nested menus (e.g. gradient type) handle Escape first.
    if (cardEl?.querySelector(".content-menu.is-open")) return;
    event.preventDefault();
    requestClose();
  },
  true
);

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const data = event.data || {};
  if (data.type === "prism-cp-open") {
    bootPicker(data);
    return;
  }
  if (data.type === "prism-cp-set-stop") {
    if (!gradientApi || typeof data.stopId !== "string" || typeof data.hex !== "string") return;
    editingStopId = data.stopId;
    gradientApi.setStopHex?.(data.stopId, data.hex, { commit: Boolean(data.commit) });
    return;
  }
  if (data.type === "prism-cp-stop-editor-closed") {
    editingStopId = null;
    gradientApi?.clearStopColorEdit?.();
    return;
  }
  if (data.type === "prism-cp-close") {
    requestClose();
  }
});

postToHost({ type: "prism-cp-ready" });
