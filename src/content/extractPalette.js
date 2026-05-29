function rgbaFromCssColor(raw) {
  if (!raw || typeof raw !== "string") return null;
  const candidate = raw.trim().toLowerCase();
  if (
    candidate === "transparent" ||
    candidate === "inherit" ||
    candidate === "initial" ||
    candidate === "unset" ||
    candidate === "currentcolor"
  ) {
    return null;
  }

  const probe = document.createElement("span");
  probe.style.color = candidate;
  if (!probe.style.color) return null;
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();

  const match = computed.match(
    /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\)/i
  );
  if (!match) return null;

  const alpha = match[4] === undefined ? 1 : Number(match[4]);
  if (!Number.isFinite(alpha) || alpha < 0.03) return null;

  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: alpha
  };
}

function toHex({ r, g, b }) {
  const hex = (value) => value.toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function toHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;

  if (delta !== 0) {
    saturation =
      delta / (1 - Math.abs(2 * lightness - 1 === 0 ? Number.EPSILON : 2 * lightness - 1));
    switch (max) {
      case rn:
        hue = ((gn - bn) / delta) % 6;
        break;
      case gn:
        hue = (bn - rn) / delta + 2;
        break;
      default:
        hue = (rn - gn) / delta + 4;
        break;
    }
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
  }

  return {
    h: hue,
    s: Math.round(Math.max(0, Math.min(1, saturation)) * 100),
    l: Math.round(lightness * 100)
  };
}

function visibleElementWeight(el) {
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return 0;
  const area = rect.width * rect.height;
  return Math.max(0.4, Math.min(25, Math.sqrt(area) / 14));
}

function semanticWeight(tokenName) {
  const name = tokenName.toLowerCase();
  if (name.includes("primary")) return 1.35;
  if (name.includes("accent")) return 1.3;
  if (name.includes("secondary")) return 1.2;
  if (name.includes("tertiary")) return 1.1;
  if (name.includes("neutral") || name.includes("gray") || name.includes("grey")) return 1.05;
  return 1;
}

function addCandidate(map, rgba, amount, source, tokenName = "") {
  const rounded = {
    r: Math.round(rgba.r / 2) * 2,
    g: Math.round(rgba.g / 2) * 2,
    b: Math.round(rgba.b / 2) * 2
  };
  const hex = toHex(rounded);
  if (!map.has(hex)) {
    map.set(hex, {
      hex,
      rgb: rounded,
      hsl: toHsl(rounded),
      usageWeight: 0,
      tokenWeight: 0,
      sourceCount: 0,
      tokenHints: []
    });
  }

  const current = map.get(hex);
  current.sourceCount += 1;
  if (source === "usage") {
    current.usageWeight += amount;
  } else if (source === "token") {
    current.tokenWeight += amount;
    if (tokenName) current.tokenHints.push(tokenName);
  }
}

function collectTokenCandidates() {
  const map = new Map();
  const tokenRegex = /--[a-z0-9-_]*color[a-z0-9-_]*/gi;

  const rootStyles = getComputedStyle(document.documentElement);
  for (let index = 0; index < rootStyles.length; index += 1) {
    const name = rootStyles[index];
    if (!name.startsWith("--")) continue;
    const value = rootStyles.getPropertyValue(name).trim();
    const rgba = rgbaFromCssColor(value);
    if (!rgba) continue;
    addCandidate(map, rgba, 1.6 * semanticWeight(name), "token", name);
  }

  for (const styleSheet of Array.from(document.styleSheets)) {
    let rules;
    try {
      rules = styleSheet.cssRules;
    } catch (_error) {
      continue;
    }
    if (!rules) continue;

    for (const rule of Array.from(rules)) {
      if (!rule.cssText) continue;
      const tokens = rule.cssText.match(tokenRegex) || [];
      for (const tokenName of tokens) {
        const value = getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
        const rgba = rgbaFromCssColor(value);
        if (!rgba) continue;
        addCandidate(map, rgba, 0.8 * semanticWeight(tokenName), "token", tokenName);
      }
    }
  }

  return map;
}

export function collectRawColorCandidates(options = {}) {
  const maxElements = options.maxElements || 2500;
  const colorProps = ["color", "background-color", "border-top-color", "fill", "stroke"];
  const map = collectTokenCandidates();

  const nodes = Array.from(document.querySelectorAll("*")).slice(0, maxElements);
  for (const node of nodes) {
    const styles = getComputedStyle(node);
    if (
      styles.display === "none" ||
      styles.visibility === "hidden" ||
      Number(styles.opacity) < 0.05
    ) {
      continue;
    }

    const weight = visibleElementWeight(node);
    if (!weight) continue;

    for (const prop of colorProps) {
      const raw = styles.getPropertyValue(prop);
      const rgba = rgbaFromCssColor(raw);
      if (!rgba) continue;
      const foregroundPenalty = prop === "color" ? 0.55 : 1;
      addCandidate(map, rgba, weight * foregroundPenalty, "usage");
    }
  }

  return {
    sampledElements: nodes.length,
    candidates: Array.from(map.values()).filter(
      (entry) => entry.usageWeight > 0.35 || entry.tokenWeight > 0.75
    )
  };
}
