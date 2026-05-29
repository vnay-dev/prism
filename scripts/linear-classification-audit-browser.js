/* Classification audit — browser inject only, not production code */
async () => {
  const TARGETS = ["#5e6ad2", "#eb5757", "#00b8cc"];
  const SOURCE_WEIGHT = {
    hero_cta: 10, primary_button: 9, navigation: 8, global_background: 8,
    hero_background: 8, logo: 8, repeated_section_bg: 7, major_container: 6,
    illustration: 5, card: 4, promo_content: 2, blog_card: 2, marketing_banner: 2,
    dynamic_content: 2, success_state: 1, warning_state: 1, error_state: 1,
    alert: 1, notification: 1, status_chip: 1, chart: 1, syntax_highlight: 0.5, default: 3
  };

  function parseHex(raw) {
    const m = raw.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    if (m) return `#${(+m[1]).toString(16).padStart(2,"0")}${(+m[2]).toString(16).padStart(2,"0")}${(+m[3]).toString(16).padStart(2,"0")}`.toLowerCase();
    if (/^#[0-9a-f]{6}$/i.test(raw.trim())) return raw.trim().toLowerCase();
    return null;
  }

  function isSyntax(el) {
    return !!el.closest("pre, code, [class*='hljs'], [class*='highlight'], [class*='prism']");
  }
  function isChart(el) {
    const blob = `${el.className} ${el.id} ${el.getAttribute("aria-label") || ""}`.toLowerCase();
    return /chart|graph|recharts|d3|plot|visualization|sparkline|canvas/.test(blob);
  }

  function getContext(el, prop) {
    const tag = el.tagName;
    if (tag === "BUTTON" || el.getAttribute("role") === "button") return "button";
    if (tag === "A") return "link";
    if (tag === "SVG" || prop === "fill" || prop === "stroke") return "icon";
    if (/^H[1-6]$/.test(tag)) return "heading";
    if (prop === "backgroundColor") return "surface";
    if (prop === "color") return "text";
    if (prop === "borderTopColor") return "border";
    return "other";
  }

  function classifySourceWithTrace(el, rect, sectionIndex, vh, prop, context, vw) {
    const tag = el.tagName || "";
    const classText = typeof el.className === "string" ? el.className : "";
    const idText = el.id || "";
    const ariaLabel = el.getAttribute("aria-label") || "";
    const role = el.getAttribute("role") || "";
    const text = (el.innerText || "").slice(0, 80);
    const blob = `${classText} ${idText} ${ariaLabel} ${text}`.toLowerCase();
    const inNav = !!el.closest('nav, [role="navigation"]');
    const inHeader = !!el.closest("header");
    const inFooter = !!el.closest("footer");
    const inHero = sectionIndex === 0 || rect.top < vh * 0.9 || !!el.closest('[class*="hero" i], [id*="hero" i], main > section:first-of-type');
    const trace = [];

    const check = (rule, cat) => { trace.push({ rule, matched: false, wouldBe: cat }); return cat; };

    if (isSyntax(el)) return { category: "syntax_highlight", trace: [{ rule: "isSyntax", matched: true }] };
    if (isChart(el)) return { category: "chart", trace: [{ rule: "isChart", matched: true }] };

    if (/success|positive|complete|verified|passed|done/.test(blob) && /badge|tag|chip|pill|status|toast|alert|banner|label/.test(blob))
      return { category: "success_state", trace: [{ rule: "success+badge pattern", matched: true }] };
    if (/warning|caution|pending|attention/.test(blob) && /badge|tag|chip|pill|status|toast|alert|banner|label/.test(blob))
      return { category: "warning_state", trace: [{ rule: "warning+badge pattern", matched: true }] };
    if (/error|danger|fail|invalid|destructive/.test(blob) && /badge|tag|chip|pill|status|toast|alert|banner|label/.test(blob))
      return { category: "error_state", trace: [{ rule: "error+badge pattern", matched: true }] };
    if (/alert|toast|notification|snackbar/.test(blob)) return { category: "alert", trace: [{ rule: "alert pattern", matched: true }] };
    if (/badge|chip|pill|status|tag-label/.test(blob)) return { category: "status_chip", trace: [{ rule: "badge pattern", matched: true }] };

    if (inNav || role === "navigation" || tag === "NAV")
      return { category: "navigation", trace: [{ rule: "inNav || role=navigation || tag=NAV", matched: true, inNav, role, tag }] };

    if (/logo|brand-mark|wordmark/.test(blob) || (tag === "SVG" && inHeader))
      return { category: "logo", trace: [{ rule: "logo pattern or SVG in header", matched: true }] };

    if (inHero) {
      if (context === "button" || tag === "BUTTON" || role === "button")
        return { category: "hero_cta", trace: [{ rule: "inHero + button", matched: true, inHero, context, tag }] };
      if (prop === "backgroundColor" || context === "surface")
        return { category: "hero_background", trace: [{ rule: "inHero + surface/bg", matched: true, inHero, prop, context }] };
      trace.push({ rule: "inHero but not button/surface", matched: false, inHero, context, tag, prop });
    } else {
      trace.push({ rule: "inHero check", matched: false, inHero, sectionIndex, rectTop: rect.top, vh90: vh * 0.9 });
    }

    if (context === "button" || tag === "BUTTON" || role === "button")
      return { category: "primary_button", trace: [...trace, { rule: "button/primary_button", matched: true }] };

    if (prop === "backgroundColor" || context === "surface") {
      if ((tag === "BODY" || tag === "HTML"))
        return { category: "global_background", trace: [...trace, { rule: "body/html bg", matched: true }] };
      if (inHeader)
        return { category: "global_background", trace: [...trace, { rule: "header bg", matched: true }] };
      if (sectionIndex === 0 && rect.width * rect.height > vw * vh * 0.5)
        return { category: "global_background", trace: [...trace, { rule: "section0 large surface", matched: true }] };
      if (/section|container|wrapper|layout|shell|page/.test(blob) || tag === "MAIN" || tag === "SECTION" || tag === "ARTICLE")
        return { category: "repeated_section_bg", trace: [...trace, { rule: "section/container surface", matched: true, blob: blob.slice(0,80) }] };
      return { category: "major_container", trace: [...trace, { rule: "generic surface", matched: true }] };
    }

    if (context === "icon" || tag === "SVG")
      return { category: "illustration", trace: [...trace, { rule: "icon/SVG", matched: true, context, tag }] };

    if (/card|tile|feature/.test(blob) || el.closest('[class*="card" i], article'))
      return { category: "card", trace: [...trace, { rule: "card pattern", matched: true }] };

    if (inFooter) return { category: "default", trace: [...trace, { rule: "footer fallback", matched: true }] };

    return { category: "default", trace: [...trace, { rule: "FINAL FALLBACK — no rule matched", matched: true }] };
  }

  function getImportance(el, rect, sectionIndex, vh) {
    const tag = el.tagName;
    const role = el.getAttribute("role") || "";
    const text = (el.innerText || "").slice(0, 80).toLowerCase();
    const inHero = sectionIndex === 0 || rect.top < vh * 0.9 || !!el.closest('[class*="hero" i], [id*="hero" i], main > section:first-of-type');
    if (inHero && (/^H[1-2]$/.test(tag) || (tag === "BUTTON" && rect.width > 72))) return 100;
    if (tag === "BUTTON" || role === "button") return 60;
    if (el.closest('nav, [role="navigation"], header')) return 70;
    if (tag === "A" || role === "link") return 60;
    if (el.closest('[class*="card" i], article, [class*="feature" i]')) return 30;
    if (/^P$|^H[3-6]$|^LI$|^TD$/.test(tag)) return 10;
    return 3;
  }

  const props = [
    { js: "backgroundColor", css: "background-color", label: "background-color" },
    { js: "color", css: "color", label: "text-color" },
    { js: "borderTopColor", css: "border-top-color", label: "border-color" },
    { js: "fill", css: "fill", label: "svg-fill" },
    { js: "stroke", css: "stroke", label: "svg-stroke" }
  ];

  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const occurrences = { "#5e6ad2": [], "#eb5757": [], "#00b8cc": [] };

  const nodes = document.querySelectorAll("*");
  for (const el of nodes) {
    const styles = getComputedStyle(el);
    if (styles.display === "none" || styles.visibility === "hidden") continue;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;

    const scrollY = window.scrollY;
    const absTop = rect.top + scrollY;
    const sectionIndex = Math.min(24, Math.floor(absTop / Math.max(vh * 0.72, 280)));
    const sectionLabel = sectionIndex === 0 ? "Hero (section-0)" : `section-${sectionIndex}`;

    for (const { js, css, label } of props) {
      if (isSyntax(el) && (js === "color" || js === "fill" || js === "stroke")) continue;
      const raw = styles.getPropertyValue(css) || styles[js];
      const hex = parseHex(raw);
      if (!hex || !TARGETS.includes(hex)) continue;

      const context = getContext(el, js);
      const { category, trace } = classifySourceWithTrace(el, rect, sectionIndex, vh, js, context, vw);
      const rawImportance = js === "borderTopColor" ? 3 : getImportance(el, rect, sectionIndex, vh);
      const multiplier = SOURCE_WEIGHT[category] || 3;
      const weightedImportance = rawImportance * multiplier;

      const classText = typeof el.className === "string" ? el.className.slice(0, 60) : "";
      occurrences[hex].push({
        element: el.tagName.toLowerCase(),
        id: el.id || null,
        className: classText || null,
        role: el.getAttribute("role") || null,
        text: (el.innerText || "").slice(0, 50).trim() || null,
        cssProperty: label,
        section: sectionLabel,
        sectionIndex,
        context,
        sourceCategory: category,
        multiplier,
        rawImportance,
        weightedImportance,
        inNav: !!el.closest('nav, [role="navigation"]'),
        inHeader: !!el.closest("header"),
        inHero: sectionIndex === 0 || rect.top < vh * 0.9,
        parentChain: (() => {
          const parts = [];
          let p = el.parentElement;
          for (let i = 0; i < 4 && p; i++) { parts.push(p.tagName.toLowerCase() + (p.className ? `.${String(p.className).split(" ")[0]}` : "")); p = p.parentElement; }
          return parts.join(" > ");
        })(),
        classificationTrace: trace
      });
    }
  }

  function summarize(hex) {
    const items = occurrences[hex];
    const byCat = {};
    items.forEach((o) => { byCat[o.sourceCategory] = (byCat[o.sourceCategory] || 0) + 1; });
    const totalWeighted = items.reduce((s, o) => s + o.weightedImportance, 0);
    return { count: items.length, byCategory: byCat, totalWeightedImportance: totalWeighted, items };
  }

  return {
    url: location.href,
    targets: {
      "#5e6ad2": summarize("#5e6ad2"),
      "#eb5757": summarize("#eb5757"),
      "#00b8cc": summarize("#00b8cc")
    }
  };
};
