/**
 * Full-viewport image lightbox on the host page (not inside the Prism panel).
 * Shows only the image + a close control anchored just above the image.
 */
(function initPrismImageLightbox() {
  const ROOT_ID = "prism-image-lightbox";
  const STYLE_ID = "prism-image-lightbox-style";

  function ensureStyles() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.documentElement.appendChild(style);
    }
    // Keep a clear inset from the browser chrome so tall images never edge-flush,
    // and reserve a row above the image for the close control.
    style.textContent = `
      #${ROOT_ID} {
        --prism-lightbox-inset: 56px;
        --prism-lightbox-close-size: 36px;
        --prism-lightbox-close-gap: 10px;
        --prism-lightbox-radius: 8px;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--prism-lightbox-inset);
        box-sizing: border-box;
        background: rgba(10, 12, 18, 0.72);
        cursor: default;
      }
      #${ROOT_ID} .prism-lightbox-stage {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: var(--prism-lightbox-close-gap);
        max-width: min(100%, calc(100vw - (var(--prism-lightbox-inset) * 2)));
        max-height: calc(100vh - (var(--prism-lightbox-inset) * 2));
        box-sizing: border-box;
        cursor: default;
      }
      #${ROOT_ID} .prism-lightbox-close {
        flex: 0 0 auto;
        width: var(--prism-lightbox-close-size);
        height: var(--prism-lightbox-close-size);
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: var(--prism-lightbox-radius);
        background: rgba(255, 255, 255, 0.95);
        color: #111827;
        cursor: pointer;
        display: grid;
        place-items: center;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
      }
      #${ROOT_ID} .prism-lightbox-close:hover {
        background: #ffffff;
      }
      #${ROOT_ID} .prism-lightbox-close:focus,
      #${ROOT_ID} .prism-lightbox-close:focus-visible {
        outline: none;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
      }
      #${ROOT_ID} .prism-lightbox-close svg {
        display: block;
        width: 16px;
        height: 16px;
      }
      #${ROOT_ID} .prism-lightbox-image {
        display: block;
        flex: 0 1 auto;
        max-width: 100%;
        max-height: calc(
          100vh
          - (var(--prism-lightbox-inset) * 2)
          - var(--prism-lightbox-close-size)
          - var(--prism-lightbox-close-gap)
        );
        width: auto;
        height: auto;
        object-fit: contain;
        border-radius: var(--prism-lightbox-radius);
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        background: transparent;
      }
    `;
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      window.__prismCloseImageLightbox();
    }
  }

  function notifyLightboxClosed() {
    try {
      chrome?.runtime?.sendMessage?.(
        { type: "prism-image-lightbox-closed" },
        () => {
          void chrome.runtime.lastError;
        }
      );
    } catch {
      /* popup may be closed */
    }
  }

  window.__prismCloseImageLightbox = function closePrismImageLightbox(options = {}) {
    const root = document.getElementById(ROOT_ID);
    const wasOpen = Boolean(root);
    if (root) root.remove();
    document.removeEventListener("keydown", onKeyDown, true);
    if (wasOpen && options.notify !== false) {
      notifyLightboxClosed();
    }
    return { closed: wasOpen };
  };

  window.__prismOpenImageLightbox = function openPrismImageLightbox(url) {
    if (!url || typeof url !== "string") return { ok: false };
    // Replace without notifying — opening a new preview isn't a user dismiss.
    window.__prismCloseImageLightbox({ notify: false });
    ensureStyles();

    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Image preview");

    const stage = document.createElement("div");
    stage.className = "prism-lightbox-stage";
    stage.addEventListener("click", (event) => event.stopPropagation());

    const img = document.createElement("img");
    img.className = "prism-lightbox-image";
    img.src = url;
    img.alt = "";

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "prism-lightbox-close";
    closeBtn.setAttribute("aria-label", "Close preview");
    closeBtn.title = "Close";
    closeBtn.innerHTML =
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 3.2a.75.75 0 0 1 1.06 0L8 6.94l3.74-3.74a.75.75 0 1 1 1.06 1.06L9.06 8l3.74 3.74a.75.75 0 1 1-1.06 1.06L8 9.06l-3.74 3.74a.75.75 0 0 1-1.06-1.06L6.94 8 3.2 4.26a.75.75 0 0 1 0-1.06z" fill="currentColor"/></svg>';
    closeBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      window.__prismCloseImageLightbox();
    });

    root.addEventListener("click", () => {
      window.__prismCloseImageLightbox();
    });

    stage.append(closeBtn, img);
    root.appendChild(stage);
    document.documentElement.appendChild(root);
    document.addEventListener("keydown", onKeyDown, true);
    return { ok: true };
  };
})();
