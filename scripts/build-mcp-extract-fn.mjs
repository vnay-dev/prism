import { readFileSync, writeFileSync } from "fs";

const b64 = readFileSync(new URL("./extract-b64-demo.txt", import.meta.url), "utf8").trim();
const fn = `async () => {
  eval(atob(${JSON.stringify(b64)}));
  return await window.__prismExtractPalette({ maxMillis: 18000 });
}`;
writeFileSync(new URL("./mcp-extract-fn.js", import.meta.url), fn);
