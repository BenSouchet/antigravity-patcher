import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import vm from "node:vm";

export interface TextFile {
  text: string;
  hasBom: boolean;
}

const execFileAsync = promisify(execFile);

export function ensureDir(target: string): void {
  fs.mkdirSync(target, { recursive: true });
}

export function readTextFile(target: string): TextFile {
  const raw = fs.readFileSync(target, "utf8");
  const hasBom = raw.charCodeAt(0) === 0xfeff;
  return {
    text: hasBom ? raw.slice(1) : raw,
    hasBom
  };
}

export function writeTextFile(target: string, text: string, hasBom = false): void {
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, `${hasBom ? "\ufeff" : ""}${text}`, "utf8");
}

export function readJsonFile<T>(target: string): { value: T; hasBom: boolean } {
  const { text, hasBom } = readTextFile(target);
  return {
    value: JSON.parse(text) as T,
    hasBom
  };
}

export function writeJsonFile(target: string, value: unknown, hasBom = false, tab = 2): void {
  writeTextFile(target, JSON.stringify(value, null, tab), hasBom);
}

export async function validateJavaScript(content: string, label: string): Promise<void> {
  const prefersModuleCheck = /\bimport\.meta\b|^\s*(import|export)\s/m.test(content);

  try {
    if (prefersModuleCheck) {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agp-validate-"));
      const tempFile = path.join(tempDir, sanitizeFileName(label).replace(/(\.js)?$/, ".mjs"));
      try {
        fs.writeFileSync(tempFile, content, "utf8");
        await execFileAsync(process.execPath, ["--check", tempFile], {
          encoding: "utf8",
          env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: "1"
          },
          timeout: 30000,
          windowsHide: true
        });
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
      return;
    }

    new vm.Script(content, { filename: label });
  } catch (error) {
    const stderr =
      typeof error === "object" && error && "stderr" in error && typeof (error as { stderr?: unknown }).stderr === "string"
        ? (error as { stderr: string }).stderr.trim().split(/\r?\n/).at(-1)
        : "";
    const message = stderr || (error as Error).message;
    throw new Error(`${label} is invalid JavaScript: ${message}`);
  }
}

export function computeSha256Base64(target: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(target)).digest("base64").replace(/=+$/, "");
}

export function sanitizeFileName(original: string): string {
  return original.replace(/[:\\/]/g, "_").replace(/^_+/, "");
}

export function recursiveFiles(baseDir: string, extension: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(baseDir)) {
    return results;
  }

  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    const fullPath = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...recursiveFiles(fullPath, extension));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith(extension)) {
      results.push(fullPath);
    }
  }

  return results;
}
