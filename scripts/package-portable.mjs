import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = path.join(root, "release");
const unpackedDir = path.join(releaseDir, "win-unpacked");
const distDir = path.join(root, "dist");
const runtimeDir = path.join(root, "runtime");
const portableDir = path.join(releaseDir, "portable");
const packageJsonPath = path.join(root, "package.json");

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function copyRecursive(from, to) {
  ensureDir(to);
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(src, dst);
    } else {
      fs.copyFileSync(src, dst);
    }
  }
}

function removeDir(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function removeReleaseZips() {
  if (!fs.existsSync(releaseDir)) {
    return;
  }

  for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".zip")) {
      fs.unlinkSync(path.join(releaseDir, entry.name));
    }
  }
}

function readPackageJson() {
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
}

function writePackageJson(value) {
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: "false"
    }
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function zipPortableFolder(sourceDir) {
  const zipPath = path.join(releaseDir, "AntigravityPatcher.zip");
  const command = `Compress-Archive -Path "${sourceDir}\\*" -DestinationPath "${zipPath}" -Force`;
  const result = spawnSync("powershell", ["-NoProfile", "-Command", command], {
    cwd: root,
    stdio: "inherit"
  });
  if (result.status !== 0) {
    throw new Error(`Compress-Archive failed with exit code ${result.status}`);
  }
}

function preparePortableLayout() {
  removeDir(portableDir);
  copyRecursive(unpackedDir, portableDir);
  copyRecursive(path.join(distDir, "blocks"), path.join(portableDir, "blocks"));
  copyRecursive(path.join(runtimeDir, "backups"), path.join(portableDir, "backups"));
  copyRecursive(path.join(runtimeDir, "logs"), path.join(portableDir, "logs"));
  fs.copyFileSync(path.join(runtimeDir, "config.json"), path.join(portableDir, "config.json"));
}

function withTraversalPackageManager(callback) {
  const originalPackageJson = readPackageJson();
  const patchedPackageJson = {
    ...originalPackageJson,
    packageManager: "traversal@1.0.0"
  };

  writePackageJson(patchedPackageJson);

  try {
    callback();
  } finally {
    writePackageJson(originalPackageJson);
  }
}

function main() {
  removeDir(unpackedDir);
  withTraversalPackageManager(() => {
    run(process.execPath, [path.join(root, "node_modules", "electron-builder", "cli.js"), "--dir"]);
  });
  preparePortableLayout();
  removeReleaseZips();
  zipPortableFolder(portableDir);
}

main();
