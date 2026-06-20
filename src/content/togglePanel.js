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
      background: #ffffff;
      box-shadow:
        0 8px 28px rgba(15, 23, 42, 0.14),
        0 2px 8px rgba(15, 23, 42, 0.08);
      border: 1px solid rgba(15, 23, 42, 0.06);
    }
    #${HOST_ID} .prism-panel-frame {
      display: block;
      width: 380px;
      height: 0;
      border: 0;
      border-radius: 12px;
      background: #ffffff;
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

  window.addEventListener("message", (event) => {
    if (event.source !== iframe.contentWindow) return;
    const { type, height } = event.data || {};
    if (type === "prism-close") {
      window.__prismClearFontHighlight?.();
      host.remove();
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
    }
  });
})();
