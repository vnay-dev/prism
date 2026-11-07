import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertServiceWorkerImportsInRoot,
  collectServiceWorkerImportGraph
} from "../scripts/check-service-worker-imports.mjs";

test("repo service-worker import graph includes messageHandler.js", () => {
  const root = join(process.cwd());
  const result = assertServiceWorkerImportsInRoot(root);
  const normalized = result.files.map((f) => f.replace(/\\/g, "/"));
  assert.ok(normalized.includes("src/background/service-worker.js"));
  assert.ok(normalized.includes("src/background/messageHandler.js"));
});

test("missing static import target fails clearly", () => {
  const dir = mkdtempSync(join(tmpdir(), "prism-sw-imports-"));
  try {
    mkdirSync(join(dir, "src", "background"), { recursive: true });
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify({
        background: { service_worker: "src/background/service-worker.js", type: "module" }
      })
    );
    writeFileSync(
      join(dir, "src", "background", "service-worker.js"),
      `import { x } from "./missing-module.js";\n`
    );
    const graph = collectServiceWorkerImportGraph(dir, "src/background/service-worker.js");
    assert.ok(graph.missing.some((m) => m.includes("missing-module.js")));
    assert.throws(
      () => assertServiceWorkerImportsInRoot(dir),
      /unresolved service-worker import/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
