import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(root, "dist");

let watcherProcess = null;
let electronProcess = null;
let restartTimer = null;
let shuttingDown = false;

function spawnProcess(command, args, options = {}) {
  return spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options
  });
}

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(process.execPath, [path.join(root, "scripts", "build.mjs")]);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Initial build failed with exit code ${code}`));
    });
  });
}

function startBuildWatcher() {
  watcherProcess = spawnProcess(process.execPath, [path.join(root, "scripts", "build.mjs"), "--watch"]);
  watcherProcess.on("exit", (code) => {
    if (!shuttingDown && code !== 0) {
      console.error(`[dev-watch] build watcher exited with code ${code}`);
    }
  });
}

function startElectron() {
  electronProcess = spawnProcess(process.execPath, [path.join(root, "node_modules", "electron", "cli.js"), "."]);
  electronProcess.on("exit", (code) => {
    if (!shuttingDown && code !== 0) {
      console.error(`[dev-watch] Electron exited with code ${code}`);
    }
    electronProcess = null;
  });
}

function restartElectron() {
  if (shuttingDown) {
    return;
  }

  if (!electronProcess) {
    startElectron();
    return;
  }

  const previous = electronProcess;
  electronProcess = null;
  previous.once("exit", () => {
    if (!shuttingDown) {
      startElectron();
    }
  });
  previous.kill();
}

function scheduleRestart() {
  if (restartTimer) {
    clearTimeout(restartTimer);
  }
  restartTimer = setTimeout(() => {
    restartTimer = null;
    console.log("[dev-watch] restarting Electron after rebuild");
    restartElectron();
  }, 300);
}

function shutdown() {
  shuttingDown = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (electronProcess) {
    electronProcess.kill();
  }
  if (watcherProcess) {
    watcherProcess.kill();
  }
}

async function main() {
  await runBuild();
  startBuildWatcher();
  startElectron();

  fs.watch(distDir, { recursive: true }, (_eventType, fileName) => {
    if (!fileName || shuttingDown) {
      return;
    }
    scheduleRestart();
  });

  process.on("SIGINT", () => {
    shutdown();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("[dev-watch]", error);
  shutdown();
  process.exit(1);
});
