/**
 * Frozen benchmark utilities — palette extraction regression baseline.
 */
import { readFileSync, existsSync } from "fs";
import { curatePalette } from "../src/core/scoreAndCluster.js";
import { assignRoles } from "../src/core/assignRoles.js";

export const BENCHMARK_VERSION = 1;

export const BENCHMARK_SITES = [
  { slug: "linear", name: "Linear", url: "https://linear.app/" },
  { slug: "stripe", name: "Stripe", url: "https://stripe.com/" },
  { slug: "spotify", name: "Spotify", url: "https://www.spotify.com/" },
  { slug: "vercel", name: "Vercel", url: "https://vercel.com/" },
  { slug: "notion", name: "Notion", url: "https://www.notion.so/" },
  { slug: "framer", name: "Framer", url: "https://www.framer.com/" },
  { slug: "apple", name: "Apple", url: "https://www.apple.com/" },
  { slug: "netflix", name: "Netflix", url: "https://www.netflix.com/" },
  { slug: "slack", name: "Slack", url: "https://slack.com/" }
];

/** Reference brand colors for benchmark scoring (0–10). */
export const KNOWN_BRAND = {
  linear: { primary: "#5e6ad2", foundation: "#08090a" },
  stripe: { primary: "#533afd", foundation: "#ffffff" },
  spotify: { primary: "#1ed760", foundation: "#121212" },
  vercel: { primary: "#00dc82", foundation: "#fafafa" },
  notion: { primary: "#0075de", foundation: "#f6f5f4" },
  framer: { primary: "#0099ff", foundation: "#000000" },
  apple: { primary: "#0071e3", foundation: "#ffffff" },
  netflix: { primary: "#e50914", foundation: "#000000" },
  slack: { primary: "#611f69", foundation: "#f9edff" }
};

const BROWSER_LINK = new Set(["#0000ee", "#0000ff"]);

export function extractSitePalette(rawExtraction) {
  if (rawExtraction?.error || !rawExtraction?.samples?.length) {
    return {
      foundation: null,
      primary: null,
      secondaries: [],
      palette: [],
      paletteMode: "foundation"
    };
  }

  const curated = curatePalette(rawExtraction);
  const assigned = assignRoles(curated);
  const swatches = assigned.swatches || [];

  return {
    foundation: swatches.find((s) => s.role === "foundation")?.hex ?? null,
    primary: swatches.find((s) => s.role === "primary")?.hex ?? null,
    secondaries: swatches.filter((s) => s.role === "secondary").map((s) => s.hex),
    palette: swatches.map((s) => ({ role: s.role, hex: s.hex })),
    paletteMode: assigned.paletteMode || "foundation"
  };
}

export function scorePalette(slug, palette) {
  const brand = KNOWN_BRAND[slug];
  let brandScore = 5;
  let usefulScore = 5;

  if (!palette.primary && brand?.primary) {
    brandScore = 2;
    usefulScore = 3;
  } else if (brand) {
    if (palette.foundation?.toLowerCase() === brand.foundation?.toLowerCase()) brandScore += 2;
    else if (palette.foundation === "#000000" && brand.foundation !== "#000000") brandScore -= 2;

    if (palette.primary?.toLowerCase() === brand.primary?.toLowerCase()) brandScore += 3;
    else if (BROWSER_LINK.has((palette.primary || "").toLowerCase())) brandScore -= 3;

    if (palette.primary) usefulScore += 2;
    if (palette.palette.length >= 6) usefulScore += 1;
    if (palette.foundation) usefulScore += 1;
    if (BROWSER_LINK.has((palette.primary || "").toLowerCase())) usefulScore -= 2;
  }

  return {
    brandAccuracy: Math.max(0, Math.min(10, brandScore)),
    designerUsefulness: Math.max(0, Math.min(10, usefulScore))
  };
}

export function buildSiteBenchmark(slug, name, url, rawExtraction) {
  const palette = extractSitePalette(rawExtraction);
  const scores = scorePalette(slug, palette);
  return {
    slug,
    name,
    url,
    foundation: palette.foundation,
    primary: palette.primary,
    secondaries: palette.secondaries,
    palette: palette.palette,
    paletteMode: palette.paletteMode,
    scores
  };
}

export function loadExtraction(extractionsDir, slug) {
  const path = new URL(`${slug}.json`, extractionsDir);
  if (!existsSync(path)) {
    throw new Error(`Missing benchmark extraction: ${path.pathname || path}`);
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

export function runBenchmark(extractionsDir) {
  return BENCHMARK_SITES.map(({ slug, name, url }) => {
    const raw = loadExtraction(extractionsDir, slug);
    return buildSiteBenchmark(slug, name, url, raw);
  });
}

function paletteSignature(site) {
  return JSON.stringify({
    foundation: site.foundation,
    primary: site.primary,
    secondaries: site.secondaries,
    palette: site.palette
  });
}

export function compareSiteToBaseline(current, baseline) {
  const paletteChanged = paletteSignature(current) !== paletteSignature(baseline);
  const brandDelta = current.scores.brandAccuracy - baseline.scores.brandAccuracy;
  const usefulDelta = current.scores.designerUsefulness - baseline.scores.designerUsefulness;

  let status = "unchanged";
  if (brandDelta > 0 || usefulDelta > 0) {
    status = brandDelta < 0 || usefulDelta < 0 ? "mixed" : "improved";
  } else if (brandDelta < 0 || usefulDelta < 0) {
    status = "regressed";
  } else if (paletteChanged) {
    status = "unchanged";
  }

  return {
    slug: current.slug,
    name: current.name,
    status,
    paletteChanged,
    brandDelta,
    usefulDelta,
    current,
    baseline,
    changes: {
      foundation: baseline.foundation !== current.foundation
        ? { from: baseline.foundation, to: current.foundation }
        : null,
      primary: baseline.primary !== current.primary
        ? { from: baseline.primary, to: current.primary }
        : null,
      secondaries: JSON.stringify(baseline.secondaries) !== JSON.stringify(current.secondaries)
        ? { from: baseline.secondaries, to: current.secondaries }
        : null
    }
  };
}

export function compareBenchmarkToLockfile(currentSites, lockfile) {
  const baselineBySlug = new Map(lockfile.sites.map((s) => [s.slug, s]));
  const comparisons = currentSites.map((site) => {
    const baseline = baselineBySlug.get(site.slug);
    if (!baseline) throw new Error(`Lockfile missing site: ${site.slug}`);
    return compareSiteToBaseline(site, baseline);
  });

  const improved = comparisons.filter((c) => c.status === "improved").map((c) => c.name);
  const unchanged = comparisons.filter((c) => c.status === "unchanged").map((c) => c.name);
  const regressed = comparisons
    .filter((c) => c.status === "regressed" || c.status === "mixed")
    .map((c) => c.name);

  const avgBrand =
    currentSites.reduce((sum, s) => sum + s.scores.brandAccuracy, 0) / currentSites.length;
  const avgUseful =
    currentSites.reduce((sum, s) => sum + s.scores.designerUsefulness, 0) / currentSites.length;

  return {
    comparisons,
    summary: { improved, unchanged, regressed },
    averages: {
      brandAccuracy: +avgBrand.toFixed(1),
      designerUsefulness: +avgUseful.toFixed(1),
      lockfileBrandAccuracy: lockfile.averages.brandAccuracy,
      lockfileDesignerUsefulness: lockfile.averages.designerUsefulness
    }
  };
}

export function formatBenchmarkReport(result) {
  const lines = [];
  lines.push("Benchmark comparison vs lockfile");
  lines.push(`Improved: ${result.summary.improved.length ? result.summary.improved.join(", ") : "none"}`);
  lines.push(`Unchanged: ${result.summary.unchanged.length ? result.summary.unchanged.join(", ") : "none"}`);
  lines.push(`Regressed: ${result.summary.regressed.length ? result.summary.regressed.join(", ") : "none"}`);
  lines.push(
    `Avg brand ${result.averages.brandAccuracy}/10 (lockfile ${result.averages.lockfileBrandAccuracy}/10)`
  );
  lines.push(
    `Avg usefulness ${result.averages.designerUsefulness}/10 (lockfile ${result.averages.lockfileDesignerUsefulness}/10)`
  );

  for (const c of result.comparisons.filter((x) => x.status !== "unchanged" || x.paletteChanged)) {
    lines.push(`\n${c.name} [${c.status}]`);
    if (c.changes.foundation) lines.push(`  foundation: ${c.changes.foundation.from} → ${c.changes.foundation.to}`);
    if (c.changes.primary) lines.push(`  primary: ${c.changes.primary.from} → ${c.changes.primary.to}`);
    if (c.changes.secondaries) {
      lines.push(`  secondaries: ${c.changes.secondaries.from.join(", ") || "—"} → ${c.changes.secondaries.to.join(", ") || "—"}`);
    }
    lines.push(
      `  scores: brand ${c.baseline.scores.brandAccuracy} → ${c.current.scores.brandAccuracy}, usefulness ${c.baseline.scores.designerUsefulness} → ${c.current.scores.designerUsefulness}`
    );
  }

  return lines.join("\n");
}
