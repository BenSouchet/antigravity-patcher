import path from "node:path";
import { app } from "electron";
import { ensureDir } from "./file-utils";

export function getPortableRoot(): string {
  if (app.isPackaged) {
    return path.dirname(app.getPath("exe"));
  }

  return path.resolve(__dirname, "..", "..", "runtime");
}

export function getBlocksRoot(): string {
  if (app.isPackaged) {
    return path.join(getPortableRoot(), "blocks");
  }

  return path.resolve(__dirname, "..", "blocks");
}

export function getConfigPath(): string {
  return path.join(getPortableRoot(), "config.json");
}

export function getBackupsRoot(): string {
  return path.join(getPortableRoot(), "backups");
}

export function getLogsRoot(): string {
  return path.join(getPortableRoot(), "logs");
}

export function ensurePortableLayout(): void {
  ensureDir(getPortableRoot());
  ensureDir(getBackupsRoot());
  ensureDir(getLogsRoot());
}
