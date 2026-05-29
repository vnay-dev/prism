const fs = require("fs");
const b64 = fs
  .readFileSync(
    "C:/Users/Vinay Krishnan/Desktop/dev/prism-chrome-ext/scripts/extract-b64.txt",
    "utf8",
  )
  .trim();
const func = `async () => {
  const b64 = '${b64}';
  eval(atob(b64));
  const r = await window.__prismExtractPalette({ maxMillis: 18000, scrollPauseMs: 180 });
  return { sectionCount: r.sectionCount, sampleCount: r.samples.length, samples: r.samples };
}`;
const payload = {
  function: func,
  filePath:
    "C:/Users/Vinay Krishnan/Desktop/dev/prism-chrome-ext/scripts/linear-prism-extraction.json",
};
fs.writeFileSync(
  "C:/Users/Vinay Krishnan/Desktop/dev/prism-chrome-ext/scripts/mcp-eval-payload.json",
  JSON.stringify(payload),
);
console.log("ok", func.length);
