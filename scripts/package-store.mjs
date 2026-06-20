/**
 * Build a Chrome Web Store upload ZIP (runtime files only).
 * Output: dist/prism-<version>.zip
 */
import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROD_NAME = "Prism";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const version = manifest.version || "0.0.0";
const stagingDir = join(root, "dist", "store");
const zipPath = join(root, "dist", `prism-${version}.zip`);

const REQUIRED_PATHS = ["manifest.json", "icons", "src"];
const ICON_FILES = ["icon16.png", "icon32.png", "icon48.png", "icon128.png"];

function fail(message) {
  console.error(`package-store: ${message}`);
  process.exit(1);
}

function assertStoreReady() {
  for (const rel of REQUIRED_PATHS) {
    const abs = join(root, rel);
    if (!existsSync(abs)) fail(`missing required path: ${rel}`);
  }

  for (const name of ICON_FILES) {
    const iconPath = join(root, "icons", name);
    if (!existsSync(iconPath)) fail(`missing icon: icons/${name}`);
    if (statSync(iconPath).size < 1) fail(`empty icon file: icons/${name}`);
  }
}

function stageFiles() {
  rmSync(stagingDir, { recursive: true, force: true });
  mkdirSync(stagingDir, { recursive: true });

  const prodManifest = { ...manifest, name: PROD_NAME };
  if (prodManifest.action) {
    prodManifest.action = { ...prodManifest.action, default_title: PROD_NAME };
  }
  writeFileSync(
    join(stagingDir, "manifest.json"),
    `${JSON.stringify(prodManifest, null, 2)}\n`
  );

  cpSync(join(root, "icons"), join(stagingDir, "icons"), { recursive: true });
  cpSync(join(root, "src"), join(stagingDir, "src"), { recursive: true });
}

function createZip() {
  rmSync(zipPath, { force: true });
  mkdirSync(dirname(zipPath), { recursive: true });

  if (process.platform === "win32") {
    const ps = [
      "Compress-Archive",
      `-Path "${join(stagingDir, "*")}"`,
      `-DestinationPath "${zipPath}"`,
      "-Force"
    ].join(" ");
    const result = spawnSync("powershell", ["-NoProfile", "-Command", ps], {
      stdio: "inherit",
      shell: false
    });
    if (result.status !== 0) fail("Compress-Archive failed");
    return;
  }

  const result = spawnSync("zip", ["-r", zipPath, "."], {
    cwd: stagingDir,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    fail("zip command failed (install zip or run on Windows with PowerShell)");
  }
}

assertStoreReady();
stageFiles();
createZip();

console.log(`\nStore package ready:\n  ${zipPath}\n`);
console.log("Upload this ZIP in the Chrome Web Store developer dashboard.");
console.log("Privacy policy: host PRIVACY.md and paste the public URL in your listing.\n");
