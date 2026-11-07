import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertServiceWorkerImportsInRoot,
  assertServiceWorkerImportsInZip,
  collectServiceWorkerImportGraph,
  listZipEntries
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

function createZipFromDir(stagingDir, zipPath) {
  if (process.platform === "win32") {
    const ps = [
      "Compress-Archive",
      `-Path "${join(stagingDir, "*")}"`,
      `-DestinationPath "${zipPath}"`,
      "-Force"
    ].join(" ");
    const result = spawnSync("powershell", ["-NoProfile", "-Command", ps], {
      encoding: "utf8"
    });
    assert.equal(result.status, 0, result.stderr || "Compress-Archive failed");
    return;
  }
  const result = spawnSync("zip", ["-r", zipPath, "."], {
    cwd: stagingDir,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || "zip failed");
}

test("listZipEntries and zip graph check work without tar", () => {
  const dir = mkdtempSync(join(tmpdir(), "prism-sw-zip-"));
  const staging = join(dir, "store");
  const zipPath = join(dir, "probe.zip");
  try {
    mkdirSync(join(staging, "src", "background"), { recursive: true });
    mkdirSync(join(staging, "src", "core"), { recursive: true });
    writeFileSync(
      join(staging, "manifest.json"),
      JSON.stringify({
        background: { service_worker: "src/background/service-worker.js", type: "module" }
      })
    );
    writeFileSync(
      join(staging, "src", "background", "service-worker.js"),
      `import { createRuntimeMessageListener } from "./messageHandler.js";\nimport { createDownloadUrlFromBytes } from "../core/downloadBytesUrl.js";\n`
    );
    writeFileSync(
      join(staging, "src", "background", "messageHandler.js"),
      "export function createRuntimeMessageListener() {}\n"
    );
    writeFileSync(
      join(staging, "src", "core", "downloadBytesUrl.js"),
      "export function createDownloadUrlFromBytes() {}\n"
    );

    createZipFromDir(staging, zipPath);

    const entries = listZipEntries(zipPath);
    assert.ok(entries.includes("manifest.json"));
    assert.ok(entries.includes("src/background/messageHandler.js"));

    const checked = assertServiceWorkerImportsInZip(staging, zipPath);
    assert.equal(checked.files.length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
