(function togglePrismPanel() {
  const HOST_ID = "prism-panel-host";
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    window.__prismClearFontHighlight?.();
    window.__prismClearColorPreview?.();
    window.__prismClearAssetHighlight?.();
    window.__prismCloseImageLightbox?.();
    existing.remove();
    return;
  }

  const panelUrl = chrome.runtime.getURL("src/popup/index.html");
  const pickerUrl = chrome.runtime.getURL("src/popup/colorPickerFrame.html");
  const host = document.createElement("div");
  host.id = HOST_ID;

  const backdrop = document.createElement("div");
  backdrop.className = "prism-panel-backdrop";

  const shell = document.createElement("div");
  shell.className = "prism-panel-shell";

  const iframe = document.createElement("iframe");
  iframe.className = "prism-panel-frame";
  iframe.src = panelUrl;
  iframe.title = "Prism";
  iframe.setAttribute("allow", "clipboard-write");

  const pickerShell = document.createElement("div");
  pickerShell.className = "prism-color-picker-shell";
  pickerShell.hidden = true;

  const pickerFrame = document.createElement("iframe");
  pickerFrame.className = "prism-color-picker-frame";
  pickerFrame.src = pickerUrl;
  pickerFrame.title = "Prism color picker";
  pickerFrame.scrolling = "no";
  pickerFrame.setAttribute("allow", "clipboard-write");

  const stopPickerShell = document.createElement("div");
  stopPickerShell.className = "prism-color-picker-shell prism-stop-color-picker-shell";
  stopPickerShell.hidden = true;

  const stopPickerFrame = document.createElement("iframe");
  stopPickerFrame.className = "prism-color-picker-frame";
  stopPickerFrame.src = pickerUrl;
  stopPickerFrame.title = "Prism stop color picker";
  stopPickerFrame.scrolling = "no";
  stopPickerFrame.setAttribute("allow", "clipboard-write");

  pickerShell.appendChild(pickerFrame);
  stopPickerShell.appendChild(stopPickerFrame);
  shell.appendChild(iframe);
  host.appendChild(backdrop);
  host.appendChild(shell);
  host.appendChild(pickerShell);
  host.appendChild(stopPickerShell);

  const style = document.createElement("style");
  style.textContent = `
    #${HOST_ID} {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      pointer-events: none;
      font-family: system-ui, sans-serif;
    }
    #${HOST_ID} .prism-panel-backdrop {
      position: fixed;
      inset: 0;
      pointer-events: auto;
      background: transparent;
    }
    #${HOST_ID} .prism-panel-shell {
      --prism-panel-inset: 12px;
      position: fixed;
      top: var(--prism-panel-inset);
      right: var(--prism-panel-inset);
      width: 380px;
      pointer-events: auto;
      border-radius: 12px;
      overflow: hidden;
      background: #fefefe;
      box-shadow:
        0 8px 28px rgba(15, 23, 42, 0.14),
        0 2px 8px rgba(15, 23, 42, 0.08);
      border: 1px solid rgba(15, 23, 42, 0.06);
    }
    #${HOST_ID} .prism-panel-shell.is-dragging {
      box-shadow:
        0 18px 48px rgba(15, 23, 42, 0.22),
        0 6px 16px rgba(15, 23, 42, 0.12);
    }
    #${HOST_ID} .prism-panel-frame {
      display: block;
      width: 380px;
      /* Placeholder height until the iframe reports its real size — keeps the
         panel visible immediately instead of a 0-height flash on heavy pages. */
      height: 220px;
      border: 0;
      border-radius: 12px;
      background: #fefefe;
      vertical-align: top;
    }
    #${HOST_ID} .prism-color-picker-shell {
      position: fixed;
      width: 280px;
      height: auto;
      pointer-events: auto;
      background: transparent;
      border: 0;
      box-shadow: none;
      overflow: visible;
      z-index: 1;
    }
    #${HOST_ID} .prism-stop-color-picker-shell {
      z-index: 2;
    }
    #${HOST_ID} .prism-color-picker-shell[hidden] {
      display: none !important;
    }
    #${HOST_ID} .prism-color-picker-frame {
      display: block;
      box-sizing: border-box;
      width: 280px;
      height: 200px;
      border: 1px solid rgba(15, 23, 42, 0.08);
      border-radius: 12px;
      background: #fefefe;
      box-shadow:
        0 8px 28px rgba(15, 23, 42, 0.16),
        0 2px 8px rgba(15, 23, 42, 0.08);
      vertical-align: top;
      overflow: hidden;
    }
  `;

  host.appendChild(style);
  document.documentElement.appendChild(host);

  backdrop.addEventListener("click", () => {
    window.__prismClearFontHighlight?.();
    window.__prismClearColorPreview?.();
    window.__prismClearAssetHighlight?.();
    window.__prismCloseImageLightbox?.();
    host.remove();
  });

  const extensionOrigin = new URL(chrome.runtime.getURL("/")).origin;

  iframe.addEventListener("load", () => {
    iframe.contentWindow?.postMessage({ type: "prism-request-resize" }, extensionOrigin);
  });

  let hasSized = false;
  let pickerReady = false;
  let pendingPickerOpen = null;
  let activePickerAnchor = null;
  let activePickerSwatchId = null;
  let pickerHeight = 200;
  let suppressPickerClosedNotify = false;
  let pickerEpoch = 0;
  let stopPickerReady = false;
  let pendingStopPickerOpen = null;
  let stopPickerHeight = 280;
  let suppressStopPickerClosedNotify = false;
  let stopPickerEpoch = 0;
  let activeStopId = null;
  const PICKER_WIDTH = 280;
  const PICKER_GAP = 10;

  // Dragging state. The panel opens pinned to the top-right via `right`/`top`.
  // On the first drag we switch to explicit `left`/`top` coordinates so the
  // user can move it anywhere and keep their extraction results visible.
  const EDGE_GAP = 8;
  const PANEL_INSET = 12; // matches --prism-panel-inset
  const PANEL_MAX_HEIGHT = 720;
  let dragLeft = null;
  let dragTop = null;

  /** Keep the panel inside the laptop viewport so footer CTAs stay reachable. */
  function maxPanelHeight() {
    return Math.min(
      PANEL_MAX_HEIGHT,
      Math.max(180, window.innerHeight - PANEL_INSET * 2)
    );
  }

  function clampToViewport(left, top) {
    const width = shell.offsetWidth || 380;
    const height = shell.offsetHeight || 0;
    const maxLeft = Math.max(window.innerWidth - width - EDGE_GAP, EDGE_GAP);
    const maxTop = Math.max(window.innerHeight - height - EDGE_GAP, EDGE_GAP);
    return {
      left: Math.min(Math.max(left, EDGE_GAP), maxLeft),
      top: Math.min(Math.max(top, EDGE_GAP), maxTop)
    };
  }

  function applyDragPosition() {
    if (dragLeft === null || dragTop === null) return;
    const { left, top } = clampToViewport(dragLeft, dragTop);
    dragLeft = left;
    dragTop = top;
    shell.style.left = `${left}px`;
    shell.style.top = `${top}px`;
    shell.style.right = "auto";
    positionColorPicker();
  }

  function beginDrag() {
    const rect = shell.getBoundingClientRect();
    dragLeft = rect.left;
    dragTop = rect.top;
    shell.classList.add("is-dragging");
    applyDragPosition();
  }

  function moveDrag(dx, dy) {
    if (dragLeft === null || dragTop === null) return;
    dragLeft += dx;
    dragTop += dy;
    applyDragPosition();
  }

  function endDrag() {
    shell.classList.remove("is-dragging");
  }

  function postToPanel(payload) {
    iframe.contentWindow?.postMessage(payload, extensionOrigin);
  }

  function postToPicker(payload) {
    pickerFrame.contentWindow?.postMessage(payload, extensionOrigin);
  }

  function postToStopPicker(payload) {
    stopPickerFrame.contentWindow?.postMessage(payload, extensionOrigin);
  }

  function closeStopColorPicker({ notifyGradient = true } = {}) {
    const wasOpen = !stopPickerShell.hidden;
    stopPickerShell.hidden = true;
    pendingStopPickerOpen = null;
    const stopId = activeStopId;
    activeStopId = null;
    suppressStopPickerClosedNotify = Boolean(notifyGradient === false && stopPickerReady);
    if (stopPickerReady) {
      postToStopPicker({ type: "prism-cp-close", epoch: stopPickerEpoch });
    } else {
      suppressStopPickerClosedNotify = false;
    }
    if (wasOpen && notifyGradient) {
      postToPicker({ type: "prism-cp-stop-editor-closed", stopId });
    }
  }

  function closeColorPicker({ notifyPanel = true } = {}) {
    closeStopColorPicker({ notifyGradient: false });
    const wasOpen = !pickerShell.hidden;
    pickerShell.hidden = true;
    pendingPickerOpen = null;
    activePickerAnchor = null;
    const swatchId = activePickerSwatchId;
    activePickerSwatchId = null;
    // Panel-initiated dismiss already cleared editing state; ignore the
    // picker's follow-up closed event so a quick reopen isn't wiped out.
    // If the frame never answers (not ready), don't leave suppress stuck.
    suppressPickerClosedNotify = Boolean(notifyPanel === false && pickerReady);
    if (pickerReady) {
      postToPicker({ type: "prism-cp-close", epoch: pickerEpoch });
    } else {
      suppressPickerClosedNotify = false;
    }
    if (wasOpen && notifyPanel) {
      postToPanel({ type: "prism-color-picker-closed", swatchId });
    }
  }

  function positionColorPicker() {
    if (pickerShell.hidden || !activePickerAnchor) return;
    const frameRect = iframe.getBoundingClientRect();
    const tileTop = frameRect.top + activePickerAnchor.top;
    const tileLeft = frameRect.left + activePickerAnchor.left;
    const tileRight = tileLeft + activePickerAnchor.width;
    const tileCenterY = tileTop + activePickerAnchor.height / 2;

    const height = Math.max(120, pickerHeight || 200);
    pickerFrame.style.height = `${height}px`;

    // Prefer the open side of the panel (usually left), aligned to the tile.
    const leftCandidate = frameRect.left - PICKER_WIDTH - PICKER_GAP;
    const rightCandidate = frameRect.right + PICKER_GAP;
    const preferLeft = leftCandidate >= EDGE_GAP;
    let left = preferLeft ? leftCandidate : rightCandidate;
    if (left + PICKER_WIDTH > window.innerWidth - EDGE_GAP) {
      left = Math.max(EDGE_GAP, window.innerWidth - PICKER_WIDTH - EDGE_GAP);
    }
    if (left < EDGE_GAP) left = EDGE_GAP;

    let top = Math.round(tileCenterY - height / 2);
    const tileAlignedTop = Math.round(tileTop);
    if (Math.abs(top - tileAlignedTop) < 24) top = tileAlignedTop;
    const maxTop = Math.max(EDGE_GAP, window.innerHeight - height - EDGE_GAP);
    top = Math.min(Math.max(top, EDGE_GAP), maxTop);

    // Nudge horizontally toward the tile if both sides were cramped.
    if (!preferLeft && rightCandidate + PICKER_WIDTH > window.innerWidth - EDGE_GAP) {
      left = Math.min(
        Math.max(EDGE_GAP, tileRight + PICKER_GAP),
        Math.max(EDGE_GAP, window.innerWidth - PICKER_WIDTH - EDGE_GAP)
      );
    }

    pickerShell.style.left = `${Math.round(left)}px`;
    pickerShell.style.top = `${Math.round(top)}px`;
    positionStopColorPicker();
  }

  function positionStopColorPicker() {
    if (stopPickerShell.hidden) return;
    const height = Math.max(120, stopPickerHeight || 200);
    stopPickerFrame.style.height = `${height}px`;

    // Prefer sitting immediately left of the gradient picker card.
    const gradientLeft = parseFloat(pickerShell.style.left);
    const gradientTop = parseFloat(pickerShell.style.top);
    const hasGradientPos =
      !pickerShell.hidden && Number.isFinite(gradientLeft) && Number.isFinite(gradientTop);

    let left;
    let top;
    if (hasGradientPos) {
      left = gradientLeft - PICKER_WIDTH - PICKER_GAP;
      if (left < EDGE_GAP) {
        left = gradientLeft + PICKER_WIDTH + PICKER_GAP;
      }
      top = gradientTop;
    } else if (activePickerAnchor) {
      const frameRect = iframe.getBoundingClientRect();
      left = frameRect.left - PICKER_WIDTH * 2 - PICKER_GAP * 2;
      top = Math.round(frameRect.top + activePickerAnchor.top);
    } else {
      left = EDGE_GAP;
      top = EDGE_GAP;
    }

    left = Math.min(
      Math.max(EDGE_GAP, left),
      Math.max(EDGE_GAP, window.innerWidth - PICKER_WIDTH - EDGE_GAP)
    );
    top = Math.min(
      Math.max(EDGE_GAP, top),
      Math.max(EDGE_GAP, window.innerHeight - height - EDGE_GAP)
    );

    stopPickerShell.style.left = `${Math.round(left)}px`;
    stopPickerShell.style.top = `${Math.round(top)}px`;
  }

  function openStopColorPicker({ stopId, hex } = {}) {
    if (!stopId || typeof hex !== "string") return;
    if (activeStopId === stopId && !stopPickerShell.hidden) {
      closeStopColorPicker({ notifyGradient: true });
      return;
    }

    suppressStopPickerClosedNotify = false;
    stopPickerEpoch += 1;
    const epoch = stopPickerEpoch;
    activeStopId = stopId;
    stopPickerShell.hidden = false;
    positionStopColorPicker();

    const openPayload = {
      type: "prism-cp-open",
      mode: "solid",
      hex,
      stopId,
      epoch
    };

    if (!stopPickerReady) {
      pendingStopPickerOpen = openPayload;
      return;
    }
    postToStopPicker(openPayload);
  }

  function openColorPicker(payload) {
    const mode = payload?.mode === "gradient" ? "gradient" : "solid";
    const hex = typeof payload?.hex === "string" ? payload.hex : "#00c600";
    const swatchId = payload?.swatchId || null;
    const gradientId = payload?.gradientId || null;
    const css = typeof payload?.css === "string" ? payload.css : "";
    const stops = Array.isArray(payload?.stops) ? payload.stops : [];
    const anchor = payload?.anchor;
    if (
      !anchor ||
      typeof anchor.left !== "number" ||
      typeof anchor.top !== "number" ||
      typeof anchor.width !== "number" ||
      typeof anchor.height !== "number"
    ) {
      return;
    }

    // A fresh open always owns the shell again.
    suppressPickerClosedNotify = false;
    pickerEpoch += 1;
    const epoch = pickerEpoch;
    activePickerAnchor = {
      left: anchor.left,
      top: anchor.top,
      width: anchor.width,
      height: anchor.height
    };
    activePickerSwatchId = swatchId || gradientId;
    pickerShell.hidden = false;
    positionColorPicker();

    const openPayload = {
      type: "prism-cp-open",
      mode,
      hex,
      swatchId,
      gradientId,
      css,
      stops,
      epoch
    };

    if (!pickerReady) {
      pendingPickerOpen = openPayload;
      return;
    }
    postToPicker(openPayload);
  }

  window.addEventListener("resize", () => {
    // Keep a dragged panel on-screen when the viewport changes.
    applyDragPosition();
    positionColorPicker();
    positionStopColorPicker();
  });

  // Keep in sync with PANEL_HOST_MESSAGE_TYPES in src/core/panelMessages.js
  // (classic inject cannot import that ES module; tests/panelMessages.test.js enforces parity).
  const HOST_MESSAGE_TYPES = new Set([
    "prism-close",
    "prism-drag-start",
    "prism-drag-move",
    "prism-drag-end",
    "prism-resize",
    "prism-color-picker-open",
    "prism-color-picker-close"
  ]);

  window.addEventListener("message", (event) => {
    if (event.origin !== extensionOrigin) return;

    // Stop-color picker frame → host → gradient picker frame.
    if (event.source === stopPickerFrame.contentWindow) {
      const data = event.data || {};
      const { type } = data;
      if (type === "prism-cp-ready") {
        stopPickerReady = true;
        if (pendingStopPickerOpen) {
          postToStopPicker(pendingStopPickerOpen);
          pendingStopPickerOpen = null;
        }
        return;
      }
      if (type === "prism-cp-resize" && typeof data.height === "number") {
        stopPickerHeight = Math.min(Math.max(Math.ceil(data.height), 120), 560);
        positionStopColorPicker();
        return;
      }
      if (type === "prism-cp-input" || type === "prism-cp-commit") {
        const stopId =
          typeof data.stopId === "string" && data.stopId
            ? data.stopId
            : activeStopId;
        if (!stopId || typeof data.hex !== "string" || !data.hex) return;
        postToPicker({
          type: "prism-cp-set-stop",
          stopId,
          hex: data.hex,
          commit: type === "prism-cp-commit"
        });
        return;
      }
      if (type === "prism-cp-closed") {
        if (typeof data.epoch === "number" && data.epoch !== stopPickerEpoch) {
          return;
        }
        if (suppressStopPickerClosedNotify) {
          suppressStopPickerClosedNotify = false;
          return;
        }
        stopPickerShell.hidden = true;
        activeStopId = null;
        postToPicker({ type: "prism-cp-stop-editor-closed" });
      }
      return;
    }

    // Color picker frame → host → panel relay.
    if (event.source === pickerFrame.contentWindow) {
      const data = event.data || {};
      const { type } = data;
      if (type === "prism-cp-ready") {
        pickerReady = true;
        if (pendingPickerOpen) {
          postToPicker(pendingPickerOpen);
          pendingPickerOpen = null;
        }
        return;
      }
      if (type === "prism-cp-resize" && typeof data.height === "number") {
        pickerHeight = Math.min(Math.max(Math.ceil(data.height), 120), 560);
        positionColorPicker();
        return;
      }
      if (type === "prism-cp-edit-stop") {
        openStopColorPicker({
          stopId: data.stopId,
          hex: data.hex,
          gradientId: data.gradientId
        });
        return;
      }
      if (type === "prism-cp-close-stop-editor") {
        closeStopColorPicker({ notifyGradient: false });
        return;
      }
      if (type === "prism-cp-input") {
        postToPanel({
          type: "prism-color-picker-input",
          mode: data.mode,
          hex: data.hex,
          css: data.css,
          swatchId: data.swatchId,
          gradientId: data.gradientId
        });
        return;
      }
      if (type === "prism-cp-commit") {
        postToPanel({
          type: "prism-color-picker-commit",
          mode: data.mode,
          hex: data.hex,
          css: data.css,
          swatchId: data.swatchId,
          gradientId: data.gradientId
        });
        return;
      }
      if (type === "prism-cp-closed") {
        // Ignore stale closes from a previous open/close cycle.
        if (typeof data.epoch === "number" && data.epoch !== pickerEpoch) {
          return;
        }
        if (suppressPickerClosedNotify) {
          suppressPickerClosedNotify = false;
          return;
        }
        closeStopColorPicker({ notifyGradient: false });
        pickerShell.hidden = true;
        activePickerAnchor = null;
        const swatchId = data.swatchId || null;
        const gradientId = data.gradientId || null;
        activePickerSwatchId = null;
        postToPanel({
          type: "prism-color-picker-closed",
          mode: data.mode,
          swatchId,
          gradientId
        });
      }
      return;
    }

    // Only the Prism popup iframe may drive host chrome (close / drag / resize).
    // Filters match shouldAcceptHostPanelMessage() in panelMessages.js.
    if (event.source !== iframe.contentWindow) return;
    const { type, height, dx, dy } = event.data || {};
    if (!HOST_MESSAGE_TYPES.has(type)) return;
    if (type === "prism-close") {
      window.__prismClearFontHighlight?.();
      window.__prismClearColorPreview?.();
      window.__prismClearAssetHighlight?.();
      window.__prismCloseImageLightbox?.();
      host.remove();
      return;
    }
    if (type === "prism-drag-start") {
      beginDrag();
      return;
    }
    if (type === "prism-drag-move") {
      moveDrag(typeof dx === "number" ? dx : 0, typeof dy === "number" ? dy : 0);
      return;
    }
    if (type === "prism-drag-end") {
      endDrag();
      return;
    }
    if (type === "prism-color-picker-open") {
      closeStopColorPicker({ notifyGradient: false });
      openColorPicker(event.data);
      return;
    }
    if (type === "prism-color-picker-close") {
      // Panel already cleared local editing state; don't echo closed back.
      closeColorPicker({ notifyPanel: false });
      return;
    }
    if (type === "prism-resize" && typeof height === "number") {
      // Hug content, but never exceed the visible viewport on small laptops.
      const px = Math.min(Math.max(Math.ceil(height), 1), maxPanelHeight());
      const nextHeight = `${px}px`;
      const prevHeight = parseInt(iframe.style.height, 10) || 0;
      hasSized = true;
      iframe.style.height = nextHeight;

      // Second pass after the iframe viewport changes — content can only be
      // measured correctly once the frame is no longer taller than the UI.
      if (Math.abs(px - prevHeight) > 1) {
        requestAnimationFrame(() => {
          iframe.contentWindow?.postMessage({ type: "prism-request-resize" }, extensionOrigin);
        });
      }

      // If the user has dragged the panel, re-clamp so a taller panel does not
      // grow off the bottom of the screen.
      requestAnimationFrame(() => {
        applyDragPosition();
        positionColorPicker();
      });
    }
  });

  window.addEventListener("resize", () => {
    if (!hasSized) return;
    const current = parseInt(iframe.style.height, 10) || 0;
    const max = maxPanelHeight();
    if (current > max) iframe.style.height = `${max}px`;
    iframe.contentWindow?.postMessage({ type: "prism-request-resize" }, extensionOrigin);
    requestAnimationFrame(() => {
      applyDragPosition();
      positionColorPicker();
    });
  });
})();
