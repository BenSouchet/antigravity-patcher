import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDir = path.join(root, "release");
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

function removeReleasePortableExecutables() {
  if (!fs.existsSync(releaseDir)) {
    return;
  }

  for (const entry of fs.readdirSync(releaseDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".exe")) {
      fs.unlinkSync(path.join(releaseDir, entry.name));
    }
  }
}

function removeBuilderArtifacts() {
  removeDir(path.join(releaseDir, "win-unpacked"));

  for (const fileName of ["builder-debug.yml", "builder-effective-config.yaml"]) {
    const filePath = path.join(releaseDir, fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
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

function findReleasePortableExecutable() {
  const candidates = fs
    .readdirSync(releaseDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".exe"))
    .map((entry) => path.join(releaseDir, entry.name));

  if (candidates.length === 0) {
    throw new Error("No portable executable was produced in the release directory.");
  }

  return candidates
    .map((filePath) => ({
      filePath,
      mtimeMs: fs.statSync(filePath).mtimeMs
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0].filePath;
}

function preparePortableLayout(portableExecutablePath) {
  removeDir(portableDir);
  ensureDir(portableDir);
  fs.copyFileSync(portableExecutablePath, path.join(portableDir, "AntigravityPatcher.exe"));
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
  ensureDir(releaseDir);
  removeDir(portableDir);
  removeReleaseZips();
  removeReleasePortableExecutables();

  withTraversalPackageManager(() => {
    run(process.execPath, [path.join(root, "node_modules", "electron-builder", "cli.js"), "--win", "portable"]);
  });

  const portableExecutablePath = findReleasePortableExecutable();
  preparePortableLayout(portableExecutablePath);
  removeReleasePortableExecutables();
  zipPortableFolder(portableDir);
  removeBuilderArtifacts();
}

main();
