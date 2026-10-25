/**
 * Parse CSS gradient functions into paint instructions for canvas export.
 * Color resolution (oklch → sRGB) is injected by the caller so Node tests stay pure.
 */

const COLOR_FN_RE =
  /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color)\(/i;
const NAMED_COLOR_RE =
  /^(transparent|currentcolor|white|black|red|blue|green|yellow|orange|purple|pink|gray|grey|silver|navy|teal|maroon|olive|lime|aqua|fuchsia|cyan|magenta)$/i;

/** Split a list on commas that are not inside parentheses. */
export function splitCssCommaList(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return [];
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      const part = trimmed.slice(start, i).trim();
      if (part) parts.push(part);
      start = i + 1;
    }
  }
  const last = trimmed.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

function unwrapGradientArgs(css) {
  const value = String(css || "")
    .trim()
    // Computed styles occasionally still carry a legacy prefix.
    .replace(/^-(?:webkit|moz|ms|o)-/i, "");
  const match = value.match(
    /^(repeating-)?(linear|radial|conic)-gradient\(([\s\S]*)\)$/i
  );
  if (!match) return null;
  return {
    repeating: Boolean(match[1]),
    type: match[2].toLowerCase(),
    inner: match[3].trim()
  };
}

function isNonColorHint(part) {
  const p = String(part || "").trim().toLowerCase();
  if (!p) return true;
  if (/^(to|from|in)\s+/.test(p)) return true;
  if (/^[\d.+-]+(?:deg|rad|turn|grad)\b/.test(p)) return true;
  if (/^(?:circle|ellipse)\b/.test(p)) return true;
  if (/^(?:closest|farthest)-(?:side|corner)\b/.test(p)) return true;
  if (/^at\s+/.test(p)) return true;
  return false;
}

function startsWithColor(part) {
  const p = String(part || "").trim();
  if (!p) return false;
  if (p.startsWith("#")) return true;
  if (COLOR_FN_RE.test(p)) return true;
  if (NAMED_COLOR_RE.test(p.split(/\s+/)[0])) return true;
  return false;
}

/** Pull leading color token (hex / function / named) and optional offsets. */
export function splitColorAndPositions(part) {
  const raw = String(part || "").trim();
  if (!raw) return null;

  let color = "";
  let rest = "";

  if (raw.startsWith("#")) {
    const m = raw.match(/^(#[0-9a-fA-F]{3,8})(.*)$/);
    if (!m) return null;
    color = m[1];
    rest = m[2].trim();
  } else if (COLOR_FN_RE.test(raw)) {
    let depth = 0;
    let end = -1;
    for (let i = 0; i < raw.length; i += 1) {
      if (raw[i] === "(") depth += 1;
      else if (raw[i] === ")") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end < 0) return null;
    color = raw.slice(0, end + 1);
    rest = raw.slice(end + 1).trim();
  } else {
    const m = raw.match(/^([a-zA-Z]+)(.*)$/);
    if (!m || !NAMED_COLOR_RE.test(m[1])) return null;
    color = m[1];
    rest = m[2].trim();
  }

  const positions = [];
  const posRe = /([+-]?[\d.]+(?:%|px|em|rem|vh|vw)?)/gi;
  let match;
  while ((match = posRe.exec(rest))) {
    positions.push(match[1]);
  }

  return { color, positions };
}

function parseCssAngle(token, fallback = 180) {
  const value = String(token || "").trim().toLowerCase();
  if (!value) return fallback;
  const m = value.match(/^([+-]?[\d.]+)(deg|rad|turn|grad)?$/i);
  if (!m) return fallback;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return fallback;
  const unit = (m[2] || "deg").toLowerCase();
  if (unit === "rad") return (n * 180) / Math.PI;
  if (unit === "turn") return n * 360;
  if (unit === "grad") return n * 0.9;
  return n;
}

function parseLinearDirection(hint) {
  const value = String(hint || "").trim().toLowerCase();
  if (!value) return 180;
  if (/^to\s+/.test(value)) {
    const dir = value.replace(/^to\s+/, "").replace(/\s+/g, " ").trim();
    const map = {
      top: 0,
      right: 90,
      bottom: 180,
      left: 270,
      "top right": 45,
      "right top": 45,
      "bottom right": 135,
      "right bottom": 135,
      "bottom left": 225,
      "left bottom": 225,
      "top left": 315,
      "left top": 315
    };
    if (Object.prototype.hasOwnProperty.call(map, dir)) return map[dir];
    return 180;
  }
  return parseCssAngle(value, 180);
}

function parseOffsetToUnit(offset, index, total) {
  if (offset == null || offset === "") {
    return total <= 1 ? 0 : index / (total - 1);
  }
  const value = String(offset).trim();
  if (value.endsWith("%")) {
    const n = Number(value.slice(0, -1));
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n / 100)) : null;
  }
  // Length units without a reference box — fall back to even spacing later.
  return null;
}

/**
 * @returns {{ type: string, repeating: boolean, angle: number, stops: { color: string, offset: number|null }[] } | null}
 */
export function parseCssGradient(css) {
  const meta = unwrapGradientArgs(String(css || "").trim());
  if (!meta) return null;

  const parts = splitCssCommaList(meta.inner);
  if (!parts.length) return null;

  let angle = meta.type === "linear" ? 180 : 0;
  let index = 0;

  // Consume leading direction / interpolation hints.
  while (index < parts.length && isNonColorHint(parts[index]) && !startsWithColor(parts[index])) {
    const hint = parts[index];
    if (meta.type === "linear" && !/^in\s+/i.test(hint)) {
      angle = parseLinearDirection(hint);
    } else if (meta.type === "conic") {
      const fromMatch = hint.match(/from\s+([^\s]+)/i);
      if (fromMatch) angle = parseCssAngle(fromMatch[1], 0);
      else if (/^[\d.+-]+(?:deg|rad|turn|grad)?$/i.test(hint.trim())) {
        angle = parseCssAngle(hint, 0);
      }
    }
    index += 1;
  }

  const stops = [];
  for (; index < parts.length; index += 1) {
    if (!startsWithColor(parts[index])) continue;
    const parsed = splitColorAndPositions(parts[index]);
    if (!parsed?.color) continue;
    const offset =
      parsed.positions.length > 0 ? parsed.positions[0] : null;
    stops.push({
      color: parsed.color,
      offset: parseOffsetToUnit(offset, stops.length, 0)
    });
  }

  if (stops.length < 2) return null;

  // Fill missing offsets evenly between defined neighbors.
  const resolved = stops.map((stop) => ({ ...stop }));
  if (resolved[0].offset == null) resolved[0].offset = 0;
  if (resolved[resolved.length - 1].offset == null) {
    resolved[resolved.length - 1].offset = 1;
  }
  let i = 0;
  while (i < resolved.length) {
    if (resolved[i].offset != null) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < resolved.length && resolved[j].offset == null) j += 1;
    const left = resolved[i - 1].offset;
    const right = resolved[j].offset;
    const gap = j - i + 1;
    for (let k = i; k < j; k += 1) {
      const t = (k - i + 1) / gap;
      resolved[k].offset = left + (right - left) * t;
    }
    i = j;
  }

  return {
    type: meta.type,
    repeating: meta.repeating,
    angle,
    stops: resolved
  };
}

/** CSS angle (0deg = up) → gradient line covering a w×h box, origin top-left. */
export function cssLinearEndpoints(angleDeg, width, height) {
  const α = ((((Number(angleDeg) || 0) % 360) + 360) % 360) * (Math.PI / 180);
  const sin = Math.sin(α);
  const cos = Math.cos(α);
  const halfW = width / 2;
  const halfH = height / 2;
  const halfLength = Math.abs(halfW * sin) + Math.abs(halfH * cos);
  const cx = halfW;
  const cy = halfH;
  return {
    x1: cx - sin * halfLength,
    y1: cy + cos * halfLength,
    x2: cx + sin * halfLength,
    y2: cy - cos * halfLength
  };
}

/**
 * Paint a parsed gradient into an existing canvas context (clipped by caller).
 * @param {CanvasRenderingContext2D} ctx
 * @param {NonNullable<ReturnType<typeof parseCssGradient>>} parsed
 * @param {(raw: string) => string|null} resolveColor returns #rrggbb or rgba()
 */
export function paintParsedGradient(ctx, parsed, x, y, width, height, resolveColor) {
  if (!ctx || !parsed?.stops?.length) return false;

  const stops = [];
  for (const stop of parsed.stops) {
    const color = resolveColor(stop.color);
    if (!color) continue;
    stops.push({
      color,
      offset: Math.max(0, Math.min(1, Number(stop.offset) || 0))
    });
  }
  if (stops.length < 2) return false;

  // Canvas requires monotonically increasing offsets.
  for (let i = 1; i < stops.length; i += 1) {
    if (stops[i].offset < stops[i - 1].offset) {
      stops[i].offset = stops[i - 1].offset;
    }
  }

  let gradient;
  if (parsed.type === "radial") {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const radius = Math.hypot(width, height) / 2;
    gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, radius));
  } else if (parsed.type === "conic" && typeof ctx.createConicGradient === "function") {
    const start = ((parsed.angle || 0) * Math.PI) / 180;
    gradient = ctx.createConicGradient(start, x + width / 2, y + height / 2);
  } else {
    const line = cssLinearEndpoints(parsed.angle, width, height);
    gradient = ctx.createLinearGradient(x + line.x1, y + line.y1, x + line.x2, y + line.y2);
  }

  for (const stop of stops) {
    try {
      gradient.addColorStop(stop.offset, stop.color);
    } catch {
      /* skip invalid stop */
    }
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);
  return true;
}
