import { hexToRgb, rgbToHex, rgbToHsl } from "../core/colorLab.js";

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function rgbToHsv({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta > 0) {
    if (max === rn) h = ((gn - bn) / delta + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / delta + 2) * 60;
    else h = ((rn - gn) / delta + 4) * 60;
  }
  const s = max === 0 ? 0 : (delta / max) * 100;
  return { h, s, v: max * 100 };
}

function hsvToRgb({ h, s, v }) {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp(s, 0, 100) / 100;
  const vv = clamp(v, 0, 100) / 100;
  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255)
  };
}

function pureHueRgb(h) {
  return hsvToRgb({ h, s: 100, v: 100 });
}

function colorFromState(state) {
  const rgb = hsvToRgb(state);
  const hex = rgbToHex(rgb);
  return { hex, rgb, hsl: rgbToHsl(rgb) };
}

let activePicker = null;

function stopDragListeners(move, up) {
  window.removeEventListener("pointermove", move);
  window.removeEventListener("pointerup", up);
  window.removeEventListener("pointercancel", up);
}

/**
 * Opens a Figma-style color picker anchored near `anchorEl`.
 * Returns a close() function.
 */
export function openColorPicker({
  hex,
  anchorEl,
  container = document.body,
  onInput,
  onCommit,
  onClose
}) {
  closeColorPicker();

  const rgb = hexToRgb(hex) || { r: 0, g: 198, b: 0 };
  const hsv = rgbToHsv(rgb);
  const state = { h: hsv.h, s: hsv.s, v: hsv.v };

  const root = document.createElement("div");
  root.className = "color-picker";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Color picker");
  root.innerHTML = `
    <div class="cp-header">
      <button type="button" class="cp-close" aria-label="Close color picker" title="Close">
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </div>
    <div class="cp-sv-wrap">
      <div class="cp-sv" aria-hidden="true"></div>
      <div class="cp-sv-thumb" aria-hidden="true"></div>
      <div class="cp-sv-hit" tabindex="0" aria-label="Saturation and brightness"></div>
    </div>
    <div class="cp-controls">
      <div class="cp-slider cp-hue" tabindex="0" aria-label="Hue">
        <div class="cp-slider-thumb" aria-hidden="true"></div>
      </div>
    </div>
    <div class="cp-fields">
      <label class="cp-hex-field">
        <span class="cp-hex-prefix" aria-hidden="true">#</span>
        <input class="cp-hex" type="text" spellcheck="false" maxlength="7" autocomplete="off" aria-label="Hex color" />
      </label>
      <button type="button" class="cp-eyedropper" title="Eyedropper" aria-label="Pick color from screen">
        <span class="material-symbols-outlined" aria-hidden="true">colorize</span>
      </button>
    </div>
  `;

  const closeBtn = root.querySelector(".cp-close");
  const svWrap = root.querySelector(".cp-sv-wrap");
  const svEl = root.querySelector(".cp-sv");
  const svThumb = root.querySelector(".cp-sv-thumb");
  const svHit = root.querySelector(".cp-sv-hit");
  const hueEl = root.querySelector(".cp-hue");
  const hueThumb = hueEl.querySelector(".cp-slider-thumb");
  const eyedropperBtn = root.querySelector(".cp-eyedropper");
  const hexInput = root.querySelector(".cp-hex");

  if (!window.EyeDropper) {
    eyedropperBtn.hidden = true;
  }

  closeBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    close();
  });

  function emit(kind) {
    const color = colorFromState(state);
    if (kind === "input") onInput?.(color);
    if (kind === "commit") onCommit?.(color);
  }

  function syncUi({ syncHex = true } = {}) {
    const pure = pureHueRgb(state.h);
    const pureHex = rgbToHex(pure);
    const current = colorFromState(state);

    svEl.style.backgroundColor = pureHex;
    svThumb.style.left = `${state.s}%`;
    svThumb.style.top = `${100 - state.v}%`;
    svThumb.style.backgroundColor = current.hex;

    hueThumb.style.left = `${(state.h / 360) * 100}%`;
    hueThumb.style.backgroundColor = pureHex;

    if (syncHex) hexInput.value = current.hex.replace("#", "").toUpperCase();
  }

  function expandHex(raw) {
    const value = String(raw || "").replace(/[^0-9a-fA-F]/g, "").toUpperCase();
    if (value.length === 3) {
      return value
        .split("")
        .map((ch) => ch + ch)
        .join("");
    }
    if (value.length === 6) return value;
    return null;
  }

  function setFromHex(nextHex, { commit = false, syncHex = true } = {}) {
    const expanded = expandHex(nextHex.startsWith("#") ? nextHex.slice(1) : nextHex);
    if (!expanded) return false;
    const parsed = hexToRgb(`#${expanded}`);
    if (!parsed) return false;
    const next = rgbToHsv(parsed);
    state.h = next.h;
    state.s = next.s;
    state.v = next.v;
    syncUi({ syncHex });
    emit("input");
    if (commit) emit("commit");
    return true;
  }

  function sanitizeHexInput(preserveCaret = true) {
    const previous = hexInput.value;
    const caret = hexInput.selectionStart ?? previous.length;
    const stripped = previous.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase();
    if (stripped === previous) return stripped;

    const removedBeforeCaret = (previous.slice(0, caret).match(/[^0-9a-fA-F]/g) || []).length;
    hexInput.value = stripped;
    if (preserveCaret) {
      const nextCaret = Math.min(stripped.length, Math.max(0, caret - removedBeforeCaret));
      hexInput.setSelectionRange(nextCaret, nextCaret);
    }
    return stripped;
  }

  function applyHexFromInput({ commit = false } = {}) {
    const raw = sanitizeHexInput(!commit);
    const expanded = expandHex(raw);
    if (!expanded) {
      if (commit) syncUi();
      return false;
    }
    return setFromHex(expanded, { commit, syncHex: false });
  }

  function bindDrag(el, onMove) {
    const onPointerDown = (event) => {
      if (event.button != null && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      el.setPointerCapture?.(event.pointerId);
      onMove(event);
      const move = (e) => onMove(e);
      const up = () => {
        stopDragListeners(move, up);
        emit("commit");
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    };
    el.addEventListener("pointerdown", onPointerDown);
  }

  bindDrag(svHit, (event) => {
    const rect = svWrap.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    state.s = x * 100;
    state.v = (1 - y) * 100;
    syncUi();
    emit("input");
  });

  bindDrag(hueEl, (event) => {
    const rect = hueEl.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    state.h = x * 360;
    syncUi();
    emit("input");
  });

  hexInput.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });

  hexInput.addEventListener("input", () => {
    applyHexFromInput();
  });

  hexInput.addEventListener("blur", () => {
    applyHexFromInput({ commit: true });
  });

  hexInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyHexFromInput({ commit: true });
      hexInput.blur();
    }
  });

  eyedropperBtn.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!window.EyeDropper) return;
    try {
      const result = await new window.EyeDropper().open();
      if (result?.sRGBHex) setFromHex(result.sRGBHex, { commit: true });
    } catch {
      /* user cancelled */
    }
  });

  function onDocPointerDown(event) {
    if (root.contains(event.target)) return;
    if (anchorEl?.contains?.(event.target)) return;
    close();
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  function position() {
    const pad = 12;
    const pickerWidth = 240;
    const pickerHeight = root.offsetHeight || 280;
    const host = container.getBoundingClientRect();
    let left = pad;
    let top = pad;

    if (anchorEl) {
      const anchor = anchorEl.getBoundingClientRect();
      left = anchor.left - host.left;
      top = anchor.bottom - host.top + 8;
      if (top + pickerHeight > host.height - pad) {
        top = anchor.top - host.top - pickerHeight - 8;
      }
      if (top < pad) top = pad;
      if (left + pickerWidth > host.width - pad) {
        left = host.width - pickerWidth - pad;
      }
      if (left < pad) left = pad;
    } else {
      left = Math.max(pad, (host.width - pickerWidth) / 2);
      top = Math.max(pad, (host.height - pickerHeight) / 2);
    }

    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
  }

  function close() {
    if (activePicker !== api) return;
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    root.remove();
    activePicker = null;
    onClose?.();
  }

  const api = { close, root, setHex: setFromHex };

  container.style.position = container.style.position || "relative";
  container.appendChild(root);
  syncUi();
  position();
  requestAnimationFrame(position);

  document.addEventListener("pointerdown", onDocPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  activePicker = api;
  return api;
}

export function closeColorPicker() {
  if (activePicker) activePicker.close();
}
