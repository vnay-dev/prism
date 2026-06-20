(function togglePrismPanel() {
  const HOST_ID = "prism-panel-host";
  const existing = document.getElementById(HOST_ID);
  if (existing) {
    window.__prismClearFontHighlight?.();
    existing.remove();
    return;
  }

  const panelUrl = chrome.runtime.getURL("src/popup/index.html");
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

  shell.appendChild(iframe);
  host.appendChild(backdrop);
  host.appendChild(shell);

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
      height: 0;
      border: 0;
      border-radius: 12px;
      background: #fefefe;
      vertical-align: top;
      transition: height 220ms cubic-bezier(0.4, 0, 0.2, 1);
      will-change: height;
    }
    @media (prefers-reduced-motion: reduce) {
      #${HOST_ID} .prism-panel-frame {
        transition: none;
      }
    }
  `;

  host.appendChild(style);
  document.documentElement.appendChild(host);

  backdrop.addEventListener("click", () => {
    window.__prismClearFontHighlight?.();
    host.remove();
  });

  iframe.addEventListener("load", () => {
    iframe.contentWindow?.postMessage({ type: "prism-request-resize" }, "*");
  });

  let hasSized = false;

  // Dragging state. The panel opens pinned to the top-right via `right`/`top`.
  // On the first drag we switch to explicit `left`/`top` coordinates so the
  // user can move it anywhere and keep their extraction results visible.
  const EDGE_GAP = 8;
  let dragLeft = null;
  let dragTop = null;

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

  window.addEventListener("resize", () => {
    // Keep a dragged panel on-screen when the viewport changes.
    applyDragPosition();
  });

  window.addEventListener("message", (event) => {
    if (event.source !== iframe.contentWindow) return;
    const { type, height, dx, dy } = event.data || {};
    if (type === "prism-close") {
      window.__prismClearFontHighlight?.();
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
    if (type === "prism-resize" && typeof height === "number") {
      const nextHeight = `${Math.min(Math.max(height, 1), 720)}px`;

      if (!hasSized) {
        // Apply the initial size instantly so the panel opens at its natural
        // height instead of animating up from zero.
        hasSized = true;
        iframe.style.transition = "none";
        iframe.style.height = nextHeight;
        void iframe.offsetHeight;
        iframe.style.transition = "";
        return;
      }

      iframe.style.height = nextHeight;

      // If the user has dragged the panel, re-clamp so a taller panel does not
      // grow off the bottom of the screen.
      requestAnimationFrame(applyDragPosition);
    }
  });
})();
