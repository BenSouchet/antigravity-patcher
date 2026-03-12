import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

function workbenchPath(baseDir: string): string {
  return path.join(baseDir, "resources", "app", "out", "vs", "workbench", "workbench.desktop.main.js");
}

export function isValidInstall(baseDir: string): boolean {
  return fs.existsSync(workbenchPath(baseDir));
}

export function detectInstallPath(): string {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Antigravity"),
    path.join(process.env.PROGRAMFILES || "", "Antigravity")
  ];

  for (const candidate of candidates) {
    if (isValidInstall(candidate)) {
      return candidate;
    }
  }

  return "";
}

export function stopAntigravity(): void {
  try {
    execFileSync("taskkill", ["/F", "/IM", "Antigravity.exe"], {
      stdio: "ignore",
      windowsHide: true
    });
  } catch {
    // Ignore when not running.
  }
}

export function launchAntigravity(installPath: string): void {
  const executable = path.join(installPath, "Antigravity.exe");
  if (!fs.existsSync(executable)) {
    throw new Error(`Antigravity executable not found at ${executable}`);
  }

  const child = spawn(executable, [], {
    detached: true,
    stdio: "ignore",
    windowsHide: false
  });

  child.unref();
}
