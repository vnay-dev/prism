import { hexToRgb, rgbToHex } from "../core/colorLab.js";
import { parseCssGradient } from "../core/paintGradient.js";

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function expandHex(raw) {
  const value = String(raw || "")
    .replace(/[^0-9a-fA-F]/g, "")
    .toUpperCase();
  if (value.length === 3) {
    return value
      .split("")
      .map((ch) => ch + ch)
      .join("");
  }
  if (value.length === 6) return value;
  return null;
}

function parseCssColorToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return { hex: "#808080", alpha: 1 };
  if (/^transparent$/i.test(raw)) return { hex: "#000000", alpha: 0 };

  const hexMatch = raw.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
  if (hexMatch) {
    const value = hexMatch[1];
    if (value.length === 8) {
      const expanded = value.slice(0, 6).toUpperCase();
      const alpha = clamp(parseInt(value.slice(6, 8), 16) / 255, 0, 1);
      return { hex: `#${expanded}`, alpha: Number.isFinite(alpha) ? alpha : 1 };
    }
    const expanded = expandHex(value);
    return { hex: `#${expanded}`, alpha: 1 };
  }

  const rgba = raw.match(
    /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)\s*(?:,\s*([0-9.]+)\s*)?\)$/i
  );
  if (rgba) {
    const r = clamp(Math.round(Number(rgba[1])), 0, 255);
    const g = clamp(Math.round(Number(rgba[2])), 0, 255);
    const b = clamp(Math.round(Number(rgba[3])), 0, 255);
    const alpha = rgba[4] == null ? 1 : clamp(Number(rgba[4]), 0, 1);
    return { hex: rgbToHex({ r, g, b }), alpha: Number.isFinite(alpha) ? alpha : 1 };
  }

  // Modern space-separated rgb/rgba, e.g. rgb(255 0 0 / 0.5)
  const modern = raw.match(
    /^rgba?\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+%?))?\s*\)$/i
  );
  if (modern) {
    const r = clamp(Math.round(Number(modern[1])), 0, 255);
    const g = clamp(Math.round(Number(modern[2])), 0, 255);
    const b = clamp(Math.round(Number(modern[3])), 0, 255);
    let alpha = 1;
    if (modern[4] != null) {
      const token = modern[4];
      alpha = token.endsWith("%")
        ? clamp(Number(token.slice(0, -1)) / 100, 0, 1)
        : clamp(Number(token), 0, 1);
    }
    return { hex: rgbToHex({ r, g, b }), alpha: Number.isFinite(alpha) ? alpha : 1 };
  }

  return { hex: "#808080", alpha: 1 };
}

function colorCss({ hex, alpha }) {
  const rgb = hexToRgb(hex) || { r: 128, g: 128, b: 128 };
  const rawAlpha = Number(alpha);
  const a = clamp(Number.isFinite(rawAlpha) ? rawAlpha : 1, 0, 1);
  if (a >= 0.999) return hex.toUpperCase();
  const rounded = Math.round(a * 1000) / 1000;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${rounded})`;
}

function sortedStopCss(stops) {
  return [...(stops || [])]
    .map((stop) => ({
      ...stop,
      offset: clamp(Number(stop.offset) || 0, 0, 1)
    }))
    .sort((a, b) => a.offset - b.offset)
    .map((stop) => `${colorCss(stop)} ${Math.round(stop.offset * 100)}%`)
    .join(", ");
}

/** Horizontal strip used only by the stop tracker (ignores type/angle). */
export function serializeStopTrackCss(state) {
  const stopCss = sortedStopCss(state?.stops);
  if (!stopCss) return "";
  return `linear-gradient(90deg, ${stopCss})`;
}

function radialPositionFromAngle(angleDeg) {
  const angle = ((((Number(angleDeg) || 0) % 360) + 360) % 360) * (Math.PI / 180);
  // 0deg → top, matching CSS gradient angle conventions.
  const x = 50 + Math.sin(angle) * 35;
  const y = 50 - Math.cos(angle) * 35;
  return `${Math.round(x)}% ${Math.round(y)}%`;
}

export function serializeGradientCss(state) {
  const stops = [...(state.stops || [])]
    .map((stop) => ({
      ...stop,
      offset: clamp(Number(stop.offset) || 0, 0, 1)
    }))
    .sort((a, b) => a.offset - b.offset);

  if (stops.length < 2) return "";

  const stopCss = sortedStopCss(stops);
  const angle = Math.round((((Number(state.angle) || 0) % 360) + 360) % 360);

  if (state.type === "radial") {
    return `radial-gradient(circle at ${radialPositionFromAngle(angle)}, ${stopCss})`;
  }
  return `linear-gradient(${angle}deg, ${stopCss})`;
}

export function gradientStateFromCss(css, fallbackStops = []) {
  const parsed = parseCssGradient(css);
  if (parsed?.stops?.length >= 2) {
    return {
      type: parsed.type === "radial" ? "radial" : "linear",
      angle: Number.isFinite(parsed.angle) ? parsed.angle : 180,
      stops: parsed.stops.map((stop, index) => {
        const color = parseCssColorToken(stop.color);
        return {
          id: `stop-${index + 1}`,
          hex: color.hex,
          alpha: color.alpha,
          offset: clamp(Number(stop.offset) || 0, 0, 1)
        };
      })
    };
  }

  const colors = (fallbackStops || []).map(parseCssColorToken);
  const stops =
    colors.length >= 2
      ? colors.map((color, index) => ({
          id: `stop-${index + 1}`,
          hex: color.hex,
          alpha: color.alpha,
          offset: index / (colors.length - 1)
        }))
      : [
          { id: "stop-1", hex: "#CF9C25", alpha: 1, offset: 0 },
          { id: "stop-2", hex: "#694F13", alpha: 1, offset: 1 }
        ];

  return { type: "linear", angle: 180, stops };
}

let activeGradientPicker = null;

function stopDragListeners(move, up) {
  window.removeEventListener("pointermove", move);
  window.removeEventListener("pointerup", up);
  window.removeEventListener("pointercancel", up);
}

/**
 * Opens a gradient structure editor (type, preview bar, stops list).
 * Clicking a stop swatch asks the host to open a separate solid color picker.
 * Returns { close, root, getCss, setStopHex, clearStopColorEdit, isEditingStopColor }.
 */
export function openGradientPicker({
  css,
  stops: fallbackStops,
  mountEl,
  onInput,
  onCommit,
  onClose,
  onEditStopColor,
  onCloseStopColor,
  onLayoutChange
}) {
  closeGradientPicker({ immediate: true });

  const host = mountEl || document.body;
  const state = gradientStateFromCss(css, fallbackStops);
  let activeStopId = state.stops[0]?.id || null;
  let editingStopId = null;
  let closing = false;
  let stopSeq = state.stops.length;

  const TYPE_OPTIONS = [
    { value: "linear", label: "Linear" },
    { value: "radial", label: "Radial" }
  ];

  const root = document.createElement("div");
  root.className = "gradient-picker";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Gradient picker");
  root.innerHTML = `
    <div class="gp-structure">
      <div class="gp-toolbar">
        <div class="content-menu gp-type-menu" data-active="${state.type}">
          <button
            type="button"
            class="content-menu-btn gp-type-btn"
            aria-haspopup="listbox"
            aria-expanded="false"
            aria-controls="gpTypeMenuList"
            title="Gradient type"
          >
            <span class="gp-type-label">Linear</span>
            <span class="material-symbols-outlined content-menu-caret" aria-hidden="true">expand_more</span>
          </button>
          <div
            id="gpTypeMenuList"
            class="content-menu-list"
            role="listbox"
            aria-label="Gradient type"
            hidden
          >
            <button type="button" class="content-menu-option" role="option" data-type="linear">
              <span>Linear</span>
            </button>
            <button type="button" class="content-menu-option" role="option" data-type="radial">
              <span>Radial</span>
            </button>
          </div>
        </div>
        <div class="gp-toolbar-actions">
          <button type="button" class="gp-icon-btn gp-reverse" title="Reverse stops" aria-label="Reverse stops">
            <span class="material-symbols-outlined" aria-hidden="true">swap_horiz</span>
          </button>
          <button type="button" class="gp-icon-btn gp-rotate" title="Rotate" aria-label="Rotate gradient">
            <span class="material-symbols-outlined" aria-hidden="true">rotate_right</span>
          </button>
        </div>
      </div>
      <div class="gp-bar-wrap">
        <div class="gp-bar" aria-hidden="true"></div>
        <div class="gp-bar-handles"></div>
      </div>
      <div class="gp-stops-head">
        <span class="gp-stops-label">Stops</span>
        <button type="button" class="gp-icon-btn gp-add-stop" title="Add stop" aria-label="Add stop">
          <span class="material-symbols-outlined" aria-hidden="true">add</span>
        </button>
      </div>
      <div class="gp-stops" role="list"></div>
    </div>
  `;

  const typeMenu = root.querySelector(".gp-type-menu");
  const typeBtn = root.querySelector(".gp-type-btn");
  const typeList = root.querySelector(".content-menu-list");
  const typeLabel = root.querySelector(".gp-type-label");
  const reverseBtn = root.querySelector(".gp-reverse");
  const rotateBtn = root.querySelector(".gp-rotate");
  const barEl = root.querySelector(".gp-bar");
  const handlesEl = root.querySelector(".gp-bar-handles");
  const stopsEl = root.querySelector(".gp-stops");
  const addBtn = root.querySelector(".gp-add-stop");
  function emit(kind) {
    const nextCss = serializeGradientCss(state);
    if (kind === "input") onInput?.({ css: nextCss, state: snapshot() });
    if (kind === "commit") onCommit?.({ css: nextCss, state: snapshot() });
  }

  function snapshot() {
    return {
      type: state.type,
      angle: state.angle,
      stops: state.stops.map((stop) => ({ ...stop }))
    };
  }

  function sortedStops() {
    return [...state.stops].sort((a, b) => a.offset - b.offset);
  }

  function setTypeMenuOpen(open) {
    if (!typeMenu || !typeBtn || !typeList) return;
    typeMenu.classList.toggle("is-open", open);
    typeBtn.setAttribute("aria-expanded", open ? "true" : "false");
    typeList.hidden = !open;
    onLayoutChange?.();
  }

  function closeTypeMenu() {
    if (!typeMenu?.classList.contains("is-open") && typeList?.hidden) return;
    setTypeMenuOpen(false);
  }

  function applyTypeMenuUi() {
    const option = TYPE_OPTIONS.find((item) => item.value === state.type) || TYPE_OPTIONS[0];
    typeMenu.dataset.active = option.value;
    if (typeLabel) typeLabel.textContent = option.label;
    for (const btn of typeMenu.querySelectorAll("[data-type]")) {
      const active = btn.getAttribute("data-type") === option.value;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    }
    closeTypeMenu();
  }

  function syncChrome() {
    // Tracker is always a flat L→R strip so type/angle don't reshape it.
    barEl.style.backgroundImage = serializeStopTrackCss(state);
  }

  function renderHandles() {
    handlesEl.replaceChildren();
    for (const stop of sortedStops()) {
      const handle = document.createElement("button");
      handle.type = "button";
      handle.className = "gp-handle";
      handle.classList.toggle("is-active", stop.id === activeStopId);
      handle.style.left = `${stop.offset * 100}%`;
      handle.style.backgroundColor = colorCss(stop);
      handle.setAttribute("aria-label", `Stop at ${Math.round(stop.offset * 100)}%`);
      handle.addEventListener("pointerdown", (event) => {
        if (event.button != null && event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        activeStopId = stop.id;
        document.body.classList.add("gp-stop-dragging");
        renderStops();
        renderHandles();
        const rect = handlesEl.getBoundingClientRect();
        const move = (e) => {
          stop.offset = clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
          renderHandles();
          renderStops();
          syncChrome();
          emit("input");
        };
        const up = () => {
          document.body.classList.remove("gp-stop-dragging");
          stopDragListeners(move, up);
          emit("commit");
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      });
      handlesEl.appendChild(handle);
    }
  }

  function renderStops() {
    stopsEl.replaceChildren();
    for (const stop of sortedStops()) {
      const row = document.createElement("div");
      row.className = "gp-stop-row";
      row.classList.toggle("is-active", stop.id === activeStopId);
      row.setAttribute("role", "listitem");
      row.innerHTML = `
        <label class="gp-stop-offset">
          <input type="number" min="0" max="100" inputmode="numeric" aria-label="Stop position" />
          <span>%</span>
        </label>
        <button type="button" class="gp-stop-swatch" aria-label="Edit stop color"></button>
        <label class="gp-stop-hex">
          <span class="gp-hex-prefix" aria-hidden="true">#</span>
          <input type="text" spellcheck="false" maxlength="6" autocomplete="off" aria-label="Stop hex color" />
        </label>
        <label class="gp-stop-alpha">
          <input type="number" min="0" max="100" inputmode="numeric" aria-label="Stop opacity" />
          <span>%</span>
        </label>
        <button type="button" class="gp-icon-btn gp-remove-stop" title="Remove stop" aria-label="Remove stop">
          <span class="material-symbols-outlined" aria-hidden="true">remove</span>
        </button>
      `;

      const offsetInput = row.querySelector(".gp-stop-offset input");
      const swatchBtn = row.querySelector(".gp-stop-swatch");
      const hexInput = row.querySelector(".gp-stop-hex input");
      const alphaInput = row.querySelector(".gp-stop-alpha input");
      const removeBtn = row.querySelector(".gp-remove-stop");

      offsetInput.value = String(Math.round(stop.offset * 100));
      hexInput.value = stop.hex.replace("#", "").toUpperCase();
      alphaInput.value = String(Math.round(stop.alpha * 100));
      swatchBtn.style.backgroundColor = colorCss(stop);
      removeBtn.disabled = state.stops.length <= 2;

      const select = ({ redraw = true } = {}) => {
        activeStopId = stop.id;
        if (!redraw) return;
        renderStops();
        renderHandles();
      };

      row.addEventListener("pointerdown", (event) => {
        // Avoid remounting while interacting with controls — that cancels clicks.
        if (event.target.closest("input, button, label")) return;
        select();
      });

      // Use pointerdown (not click): row selection used to remount on
      // pointerdown and destroy this button before click could fire.
      swatchBtn.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        select({ redraw: false });
        requestStopColorEdit(stop);
      });
      swatchBtn.classList.toggle("is-editing", stop.id === editingStopId);

      offsetInput.addEventListener("input", () => {
        const next = Number(offsetInput.value);
        if (!Number.isFinite(next)) return;
        stop.offset = clamp(Math.round(next), 0, 100) / 100;
        renderHandles();
        syncChrome();
        emit("input");
      });
      offsetInput.addEventListener("change", () => emit("commit"));

      hexInput.addEventListener("input", () => {
        const expanded = expandHex(hexInput.value);
        if (!expanded) return;
        stop.hex = `#${expanded}`;
        swatchBtn.style.backgroundColor = colorCss(stop);
        renderHandles();
        syncChrome();
        emit("input");
      });
      hexInput.addEventListener("change", () => {
        const expanded = expandHex(hexInput.value);
        if (expanded) {
          stop.hex = `#${expanded}`;
          hexInput.value = expanded;
        } else {
          hexInput.value = stop.hex.replace("#", "").toUpperCase();
        }
        emit("commit");
      });

      alphaInput.addEventListener("input", () => {
        const next = Number(alphaInput.value);
        if (!Number.isFinite(next)) return;
        stop.alpha = clamp(Math.round(next), 0, 100) / 100;
        swatchBtn.style.backgroundColor = colorCss(stop);
        renderHandles();
        syncChrome();
        emit("input");
      });
      alphaInput.addEventListener("change", () => emit("commit"));

      removeBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (state.stops.length <= 2) return;
        state.stops = state.stops.filter((item) => item.id !== stop.id);
        if (activeStopId === stop.id) activeStopId = state.stops[0]?.id || null;
        if (editingStopId && !state.stops.some((item) => item.id === editingStopId)) {
          editingStopId = null;
          onCloseStopColor?.();
        }
        renderAll();
        emit("input");
        emit("commit");
        onLayoutChange?.();
      });

      stopsEl.appendChild(row);
    }
  }

  function renderAll() {
    syncChrome();
    renderHandles();
    renderStops();
  }

  typeBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const open = typeBtn.getAttribute("aria-expanded") !== "true";
    setTypeMenuOpen(open);
  });

  typeList?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-type]");
    if (!btn || !typeList.contains(btn)) return;
    event.preventDefault();
    const next = btn.getAttribute("data-type") === "radial" ? "radial" : "linear";
    if (state.type !== next) {
      state.type = next;
      applyTypeMenuUi();
      renderAll();
      emit("input");
      emit("commit");
    } else {
      closeTypeMenu();
    }
  });

  function onDocPointerDown(event) {
    if (!typeMenu?.classList.contains("is-open")) return;
    if (typeMenu.contains(event.target)) return;
    closeTypeMenu();
  }

  reverseBtn.addEventListener("click", (event) => {
    event.preventDefault();
    for (const stop of state.stops) stop.offset = 1 - stop.offset;
    renderAll();
    emit("input");
    emit("commit");
  });

  rotateBtn.addEventListener("click", (event) => {
    event.preventDefault();
    state.angle = (((Number(state.angle) || 0) + 90) % 360 + 360) % 360;
    renderAll();
    emit("input");
    emit("commit");
  });

  addBtn.addEventListener("click", (event) => {
    event.preventDefault();
    const sorted = sortedStops();
    let offset = 0.5;
    if (sorted.length >= 2) {
      let widest = 0;
      for (let i = 0; i < sorted.length - 1; i += 1) {
        const gap = sorted[i + 1].offset - sorted[i].offset;
        if (gap > widest) {
          widest = gap;
          offset = sorted[i].offset + gap / 2;
        }
      }
    }
    const donor = sorted[Math.floor(sorted.length / 2)] || sorted[0];
    stopSeq += 1;
    const next = {
      id: `stop-${stopSeq}`,
      hex: donor?.hex || "#808080",
      alpha: donor?.alpha ?? 1,
      offset
    };
    state.stops.push(next);
    activeStopId = next.id;
    renderAll();
    emit("input");
    emit("commit");
    onLayoutChange?.();
  });

  function applyStopHex(stopId, hex, { commit = false } = {}) {
    const stop = state.stops.find((item) => item.id === stopId);
    if (!stop || !hex) return;
    stop.hex = hex.startsWith("#") ? hex : `#${hex}`;
    // Solid picker has no alpha control — keep existing alpha, but never stay invisible.
    if (!(Number(stop.alpha) > 0)) stop.alpha = 1;
    renderAll();
    emit(commit ? "commit" : "input");
  }

  function clearStopColorEdit() {
    if (!editingStopId) return;
    editingStopId = null;
    renderStops();
    renderHandles();
  }

  function requestStopColorEdit(stop) {
    if (!stop?.id || closing) return;
    if (editingStopId === stop.id) {
      editingStopId = null;
      renderStops();
      renderHandles();
      onCloseStopColor?.();
      return;
    }
    editingStopId = stop.id;
    activeStopId = stop.id;
    renderStops();
    renderHandles();
    onEditStopColor?.({
      id: stop.id,
      hex: stop.hex,
      alpha: stop.alpha
    });
  }

  function onKeyDown(event) {
    if (event.key !== "Escape") return;
    if (typeMenu?.classList.contains("is-open")) {
      event.preventDefault();
      closeTypeMenu();
      return;
    }
    event.preventDefault();
    if (editingStopId) {
      editingStopId = null;
      renderStops();
      renderHandles();
      onCloseStopColor?.();
      return;
    }
    close();
  }

  function finishClose() {
    root.remove();
    activeGradientPicker = null;
    onClose?.({ css: serializeGradientCss(state) });
  }

  function close({ immediate = false } = {}) {
    if (activeGradientPicker !== api || closing) return;
    closing = true;
    document.body.classList.remove("gp-stop-dragging");
    if (editingStopId) {
      editingStopId = null;
      onCloseStopColor?.();
    }
    emit("commit");
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    void immediate;
    finishClose();
  }

  const api = {
    close,
    root,
    getCss: () => serializeGradientCss(state),
    setStopHex: applyStopHex,
    clearStopColorEdit,
    isEditingStopColor: () => Boolean(editingStopId)
  };

  host.appendChild(root);
  applyTypeMenuUi();
  renderAll();
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("pointerdown", onDocPointerDown, true);
  activeGradientPicker = api;
  return api;
}

export function closeGradientPicker({ immediate = false } = {}) {
  if (activeGradientPicker) activeGradientPicker.close({ immediate });
}
