/** sRGB → CIE LAB for perceptual distance (Delta-E). */
export function rgbToLab({ r, g, b }) {
  let rn = r / 255;
  let gn = g / 255;
  let bn = b / 255;
  rn = rn <= 0.04045 ? rn / 12.92 : ((rn + 0.055) / 1.055) ** 2.4;
  gn = gn <= 0.04045 ? gn / 12.92 : ((gn + 0.055) / 1.055) ** 2.4;
  bn = bn <= 0.04045 ? bn / 12.92 : ((bn + 0.055) / 1.055) ** 2.4;

  const x = (rn * 0.4124 + gn * 0.3576 + bn * 0.1805) / 0.95047;
  const y = rn * 0.2126 + gn * 0.7152 + bn * 0.0722;
  const z = (rn * 0.0193 + gn * 0.1192 + bn * 0.9505) / 1.08883;

  const fx = x > 0.008856 ? x ** (1 / 3) : 7.787 * x + 16 / 116;
  const fy = y > 0.008856 ? y ** (1 / 3) : 7.787 * y + 16 / 116;
  const fz = z > 0.008856 ? z ** (1 / 3) : 7.787 * z + 16 / 116;

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

export function deltaE(lab1, lab2) {
  const dl = lab1.l - lab2.l;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

export function rgbToHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  const l = (max + min) / 2;
  let s = 0;
  if (delta > 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h: Math.round(h), s: Math.round((s || 0) * 100), l: Math.round(l * 100) };
}

export function hslToRgb({ h, s, l }) {
  const hh = ((h % 360) + 360) % 360;
  const ss = Math.max(0, Math.min(100, s)) / 100;
  const ll = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
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

export function rgbToHex({ r, g, b }) {
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function hexToRgb(hex) {
  const value = String(hex || "").replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

/**
 * Returns a lighter/darker sibling of `color` by shifting HSL lightness.
 * Clamps away from pure black/white so curated palettes stay useful.
 */
export function shadeColor(color, lightnessDelta) {
  const baseHsl = color.hsl || (color.rgb ? rgbToHsl(color.rgb) : null);
  if (!baseHsl) return null;

  const hsl = {
    h: baseHsl.h,
    s: baseHsl.s,
    l: Math.max(8, Math.min(92, baseHsl.l + lightnessDelta))
  };
  const rgb = hslToRgb(hsl);
  const hex = rgbToHex(rgb);
  if (isPureBlackOrWhite(hex)) return null;
  return { hex, rgb, hsl };
}

export function isNeutralHsl(hsl) {
  return hsl.s <= 18 || hsl.l <= 12 || hsl.l >= 90;
}

/** Literal pure black/white carry no design value in a curated palette. */
export function isPureBlackOrWhite(hex) {
  const h = (hex || "").toLowerCase();
  return h === "#000000" || h === "#ffffff";
}
