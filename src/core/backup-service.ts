import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ensureDir, sanitizeFileName } from "./file-utils";

interface BackupEntry {
  filePath: string;
  backupFile: string;
  label: string;
  createdAt: string;
  timestamps: {
    birthtime: string;
    mtime: string;
    atime: string;
  };
}

type Metadata = Record<string, BackupEntry>;

export class BackupService {
  private readonly metadataPath: string;

  constructor(private readonly backupsRoot: string, private readonly label: string) {
    ensureDir(backupsRoot);
    this.metadataPath = path.join(backupsRoot, "metadata.json");
  }

  backupFile(filePath: string): void {
    if (!fs.existsSync(filePath)) {
      return;
    }

    const metadata = this.loadMetadata();
    const key = this.entryKey(filePath);
    if (metadata[key]) {
      return;
    }

    const stats = fs.statSync(filePath);
    const backupFile = `${this.label}__${sanitizeFileName(filePath)}`;
    fs.copyFileSync(filePath, path.join(this.backupsRoot, backupFile));
    fs.utimesSync(path.join(this.backupsRoot, backupFile), stats.atime, stats.mtime);

    metadata[key] = {
      filePath,
      backupFile,
      label: this.label,
      createdAt: new Date().toISOString(),
      timestamps: {
        birthtime: stats.birthtime.toISOString(),
        mtime: stats.mtime.toISOString(),
        atime: stats.atime.toISOString()
      }
    };

    this.saveMetadata(metadata);
  }

  restoreFile(filePath: string): boolean {
    const metadata = this.loadMetadata();
    const entry = metadata[this.entryKey(filePath)];
    if (!entry) {
      return false;
    }

    const backupPath = path.join(this.backupsRoot, entry.backupFile);
    if (!fs.existsSync(backupPath)) {
      return false;
    }

    fs.copyFileSync(backupPath, filePath);
    fs.utimesSync(filePath, new Date(entry.timestamps.atime), new Date(entry.timestamps.mtime));

    if (process.platform === "win32") {
      try {
        const escaped = filePath.replace(/'/g, "''");
        execFileSync(
          "powershell",
          [
            "-NoProfile",
            "-Command",
            `(Get-Item '${escaped}').CreationTime = [DateTime]::Parse('${entry.timestamps.birthtime}')`
          ],
          {
            stdio: "ignore",
            windowsHide: true
          }
        );
      } catch {
        // Best effort only.
      }
    }

    return true;
  }

  listBackups(): string[] {
    return Object.values(this.loadMetadata())
      .filter((entry) => entry.label === this.label)
      .map((entry) => entry.filePath);
  }

  private entryKey(filePath: string): string {
    return `${this.label}::${filePath}`;
  }

  private loadMetadata(): Metadata {
    if (!fs.existsSync(this.metadataPath)) {
      return {};
    }

    try {
      return JSON.parse(fs.readFileSync(this.metadataPath, "utf8")) as Metadata;
    } catch {
      return {};
    }
  }

  private saveMetadata(metadata: Metadata): void {
    fs.writeFileSync(this.metadataPath, JSON.stringify(metadata, null, 2), "utf8");
  }
}
