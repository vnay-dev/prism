import { hexToRgb, rgbToHex, rgbToHsl, hslToRgb } from "../core/colorLab.js";

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

function relativeLuminance({ r, g, b }) {
  const toLinear = (c) => {
    const n = c / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function isLightSurface(rgb) {
  return relativeLuminance(rgb) > 0.72;
}

function isDarkSurface(rgb) {
  return relativeLuminance(rgb) < 0.28;
}

let activePicker = null;

function stopDragListeners(move, up) {
  window.removeEventListener("pointermove", move);
  window.removeEventListener("pointerup", up);
  window.removeEventListener("pointercancel", up);
}

/**
 * Opens a Figma-style color picker mounted in-flow inside `mountEl`.
 * Returns { close, root, setHex }.
 */
export function openColorPicker({
  hex,
  mountEl,
  onInput,
  onCommit,
  onClose,
  animateClose
}) {
  closeColorPicker({ immediate: true });

  const host = mountEl || document.body;
  const rgb = hexToRgb(hex) || { r: 0, g: 198, b: 0 };
  const hsv = rgbToHsv(rgb);
  const state = { h: hsv.h, s: hsv.s, v: hsv.v };
  let applied = false;

  const root = document.createElement("div");
  root.className = "color-picker";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Color picker");
  root.innerHTML = `
    <div class="cp-sv-wrap">
      <div class="cp-sv" aria-hidden="true"></div>
      <div class="cp-sv-thumb" aria-hidden="true"></div>
      <div class="cp-sv-hit" tabindex="0" aria-label="Saturation and brightness"></div>
    </div>
    <div class="cp-dock">
      <div class="cp-controls">
        <button type="button" class="cp-eyedropper" title="Eyedropper" aria-label="Pick color from screen">
          <span class="material-symbols-outlined" aria-hidden="true">colorize</span>
        </button>
        <div class="cp-slider cp-hue" tabindex="0" aria-label="Hue">
          <div class="cp-slider-thumb" aria-hidden="true"></div>
        </div>
      </div>
      <div class="cp-fields">
        <div class="cp-swatch-preview" aria-hidden="true"></div>
        <div class="cp-value" data-format="hex">
          <label class="cp-hex-field cp-value-hex">
            <span class="cp-hex-prefix" aria-hidden="true">#</span>
            <input class="cp-hex" type="text" spellcheck="false" maxlength="6" autocomplete="off" aria-label="Hex color" />
          </label>
          <div class="cp-value-rgb" hidden>
            <label class="cp-channel"><span>R</span><input class="cp-rgb-r" type="number" min="0" max="255" inputmode="numeric" aria-label="Red" /></label>
            <label class="cp-channel"><span>G</span><input class="cp-rgb-g" type="number" min="0" max="255" inputmode="numeric" aria-label="Green" /></label>
            <label class="cp-channel"><span>B</span><input class="cp-rgb-b" type="number" min="0" max="255" inputmode="numeric" aria-label="Blue" /></label>
          </div>
          <div class="cp-value-hsl" hidden>
            <label class="cp-channel"><span>H</span><input class="cp-hsl-h" type="number" min="0" max="360" inputmode="numeric" aria-label="Hue" /></label>
            <label class="cp-channel"><span>S</span><input class="cp-hsl-s" type="number" min="0" max="100" inputmode="numeric" aria-label="Saturation" /></label>
            <label class="cp-channel"><span>L</span><input class="cp-hsl-l" type="number" min="0" max="100" inputmode="numeric" aria-label="Lightness" /></label>
          </div>
        </div>
        <div class="cp-format-carousel" role="group" aria-label="Color format">
          <button type="button" class="cp-format-step" data-dir="-1" aria-label="Previous format">
            <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>
          </button>
          <span class="cp-format-viewport">
            <span class="cp-format-label" aria-live="polite">HEX</span>
          </span>
          <button type="button" class="cp-format-step" data-dir="1" aria-label="Next format">
            <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </button>
        </div>
      </div>
    </div>
    <button type="button" class="cp-done btn btn-primary btn-block">
      <span class="material-symbols-outlined" aria-hidden="true">check</span>
      <span>Apply color</span>
    </button>
  `;

  const doneBtn = root.querySelector(".cp-done");
  const svWrap = root.querySelector(".cp-sv-wrap");
  const svEl = root.querySelector(".cp-sv");
  const svThumb = root.querySelector(".cp-sv-thumb");
  const svHit = root.querySelector(".cp-sv-hit");
  const hueEl = root.querySelector(".cp-hue");
  const hueThumb = hueEl.querySelector(".cp-slider-thumb");
  const eyedropperBtn = root.querySelector(".cp-eyedropper");
  const valueEl = root.querySelector(".cp-value");
  const previewEl = root.querySelector(".cp-swatch-preview");
  const hexField = root.querySelector(".cp-value-hex");
  const rgbFields = root.querySelector(".cp-value-rgb");
  const hslFields = root.querySelector(".cp-value-hsl");
  const hexInput = root.querySelector(".cp-hex");
  const rgbInputs = {
    r: root.querySelector(".cp-rgb-r"),
    g: root.querySelector(".cp-rgb-g"),
    b: root.querySelector(".cp-rgb-b")
  };
  const hslInputs = {
    h: root.querySelector(".cp-hsl-h"),
    s: root.querySelector(".cp-hsl-s"),
    l: root.querySelector(".cp-hsl-l")
  };
  const formatCarousel = root.querySelector(".cp-format-carousel");
  const formatViewport = root.querySelector(".cp-format-viewport");
  let formatLabel = root.querySelector(".cp-format-label");
  const formatStepBtns = [...root.querySelectorAll(".cp-format-step")];
  const FORMAT_ORDER = ["hex", "rgb", "hsl"];
  const FORMAT_SLIDE_MS = 240;

  let activeFormat = "hex";
  let formatAnimating = false;

  if (!window.EyeDropper) {
    eyedropperBtn.hidden = true;
  }

  doneBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    applied = true;
    emit("commit");
    close();
  });

  function emit(kind) {
    const color = colorFromState(state);
    if (kind === "input") onInput?.(color);
    if (kind === "commit") onCommit?.(color);
  }

  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  }

  function applyFormat(format, { updateLabel = true } = {}) {
    activeFormat = format;
    valueEl.dataset.format = format;
    hexField.hidden = format !== "hex";
    rgbFields.hidden = format !== "rgb";
    hslFields.hidden = format !== "hsl";
    if (updateLabel && formatLabel) formatLabel.textContent = format.toUpperCase();
    syncUi();
  }

  function setFormat(format) {
    if (format !== "rgb" && format !== "hsl" && format !== "hex") return;
    applyFormat(format);
  }

  function slideFormatLabel(nextFormat, direction) {
    if (!formatLabel || !formatViewport || prefersReducedMotion() || !direction) {
      applyFormat(nextFormat);
      return;
    }

    formatAnimating = true;
    applyFormat(nextFormat, { updateLabel: false });

    const outgoing = formatLabel;
    const incoming = document.createElement("span");
    incoming.className = "cp-format-label is-incoming";
    incoming.textContent = nextFormat.toUpperCase();
    incoming.setAttribute("aria-hidden", "true");
    formatViewport.appendChild(incoming);

    const exitClass = direction > 0 ? "is-exit-next" : "is-exit-prev";
    const startClass = direction > 0 ? "is-start-next" : "is-start-prev";

    incoming.classList.add(startClass);
    void incoming.offsetWidth;

    outgoing.classList.add(exitClass);
    incoming.classList.remove(startClass);
    incoming.classList.add("is-settle");

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      outgoing.removeEventListener("transitionend", onEnd);
      outgoing.remove();
      incoming.classList.remove("is-incoming", "is-settle", startClass);
      incoming.removeAttribute("aria-hidden");
      incoming.setAttribute("aria-live", "polite");
      formatLabel = incoming;
      formatAnimating = false;
    };

    const onEnd = (event) => {
      if (event.target !== outgoing || event.propertyName !== "transform") return;
      finish();
    };

    outgoing.addEventListener("transitionend", onEnd);
    window.setTimeout(finish, FORMAT_SLIDE_MS + 40);
  }

  function stepFormat(delta) {
    if (formatAnimating || !delta) return;
    const idx = FORMAT_ORDER.indexOf(activeFormat);
    const next = FORMAT_ORDER[(idx + delta + FORMAT_ORDER.length) % FORMAT_ORDER.length];
    if (next === activeFormat) return;
    slideFormatLabel(next, delta);
  }

  formatStepBtns.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      stepFormat(Number(btn.dataset.dir) || 0);
    });
  });

  formatCarousel?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepFormat(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      stepFormat(1);
    }
  });

  function syncUi({ syncFields = true } = {}) {
    const pure = pureHueRgb(state.h);
    const pureHex = rgbToHex(pure);
    const current = colorFromState(state);

    svEl.style.backgroundColor = pureHex;
    root.classList.toggle("is-light", isLightSurface(current.rgb));
    root.classList.toggle("is-dark", isDarkSurface(current.rgb));

    svThumb.style.left = `${state.s}%`;
    svThumb.style.top = `${100 - state.v}%`;
    svThumb.style.backgroundColor = current.hex;

    hueThumb.style.left = `${(state.h / 360) * 100}%`;
    hueThumb.style.backgroundColor = pureHex;

    if (previewEl) {
      previewEl.style.backgroundColor = current.hex;
      previewEl.classList.toggle("is-light", isLightSurface(current.rgb));
    }

    if (!syncFields) return;

    if (activeFormat === "hex") {
      hexInput.value = current.hex.replace("#", "").toUpperCase();
    } else if (activeFormat === "rgb") {
      rgbInputs.r.value = String(current.rgb.r);
      rgbInputs.g.value = String(current.rgb.g);
      rgbInputs.b.value = String(current.rgb.b);
    } else {
      const hsl = current.hsl;
      hslInputs.h.value = String(Math.round(hsl.h));
      hslInputs.s.value = String(Math.round(hsl.s));
      hslInputs.l.value = String(Math.round(hsl.l));
    }
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

  function setFromRgb(rgb, { commit = false, syncFields = true } = {}) {
    if (!rgb) return false;
    const next = rgbToHsv(rgb);
    state.h = next.h;
    state.s = next.s;
    state.v = next.v;
    syncUi({ syncFields });
    emit("input");
    if (commit) emit("commit");
    return true;
  }

  function setFromHex(nextHex, { commit = false, syncFields = true } = {}) {
    const expanded = expandHex(nextHex.startsWith("#") ? nextHex.slice(1) : nextHex);
    if (!expanded) return false;
    const parsed = hexToRgb(`#${expanded}`);
    if (!parsed) return false;
    return setFromRgb(parsed, { commit, syncFields });
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
    return setFromHex(expanded, { commit, syncFields: false });
  }

  function readChannel(input, min, max) {
    const n = Number(input.value);
    if (!Number.isFinite(n)) return null;
    return clamp(Math.round(n), min, max);
  }

  function applyRgbFromInputs({ commit = false } = {}) {
    const r = readChannel(rgbInputs.r, 0, 255);
    const g = readChannel(rgbInputs.g, 0, 255);
    const b = readChannel(rgbInputs.b, 0, 255);
    if (r == null || g == null || b == null) {
      if (commit) syncUi();
      return false;
    }
    rgbInputs.r.value = String(r);
    rgbInputs.g.value = String(g);
    rgbInputs.b.value = String(b);
    return setFromRgb({ r, g, b }, { commit, syncFields: false });
  }

  function applyHslFromInputs({ commit = false } = {}) {
    const h = readChannel(hslInputs.h, 0, 360);
    const s = readChannel(hslInputs.s, 0, 100);
    const l = readChannel(hslInputs.l, 0, 100);
    if (h == null || s == null || l == null) {
      if (commit) syncUi();
      return false;
    }
    hslInputs.h.value = String(h);
    hslInputs.s.value = String(s);
    hslInputs.l.value = String(l);
    return setFromRgb(hslToRgb({ h, s, l }), { commit, syncFields: false });
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

  function bindTextField(el, onInput, onCommit) {
    el.addEventListener("pointerdown", (event) => event.stopPropagation());
    el.addEventListener("input", () => onInput());
    el.addEventListener("blur", () => onCommit());
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onCommit();
        el.blur();
      }
    });
  }

  bindTextField(hexInput, () => applyHexFromInput(), () => applyHexFromInput({ commit: true }));
  for (const input of Object.values(rgbInputs)) {
    bindTextField(input, () => applyRgbFromInputs(), () => applyRgbFromInputs({ commit: true }));
  }
  for (const input of Object.values(hslInputs)) {
    bindTextField(input, () => applyHslFromInputs(), () => applyHslFromInputs({ commit: true }));
  }

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

  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  let closing = false;

  function finishClose() {
    root.remove();
    activePicker = null;
    onClose?.({ applied });
  }

  function close({ immediate = false } = {}) {
    if (activePicker !== api || closing) return;
    closing = true;
    document.removeEventListener("keydown", onKeyDown, true);

    if (immediate || !animateClose) {
      finishClose();
      return;
    }

    Promise.resolve(animateClose(root, { applied })).then(finishClose, finishClose);
  }

  const api = { close, root, setHex: setFromHex };

  host.appendChild(root);
  setFormat("hex");

  document.addEventListener("keydown", onKeyDown, true);
  activePicker = api;
  return api;
}

export function closeColorPicker({ immediate = false } = {}) {
  if (activePicker) activePicker.close({ immediate });
}
