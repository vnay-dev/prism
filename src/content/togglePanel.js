(function togglePrismPanel() {
  const HOST_ID = "prism-panel-host";
  const existing = document.getElementById(HOST_ID);
  if (existing) {
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
    }
  `;

  host.appendChild(style);
  document.documentElement.appendChild(host);

  backdrop.addEventListener("click", () => host.remove());

  iframe.addEventListener("load", () => {
    iframe.contentWindow?.postMessage({ type: "prism-request-resize" }, "*");
  });

  window.addEventListener("message", (event) => {
    if (event.source !== iframe.contentWindow) return;
    const { type, height } = event.data || {};
    if (type === "prism-close") {
      host.remove();
      return;
    }
    if (type === "prism-resize" && typeof height === "number") {
      iframe.style.height = `${Math.min(Math.max(height, 1), 720)}px`;
    }
  });
})();
