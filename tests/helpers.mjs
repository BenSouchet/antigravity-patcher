import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function loadBuiltBlock(relativePath) {
  const modulePath = path.resolve(process.cwd(), "dist", "blocks", ...relativePath.split("/"));
  const loaded = require(modulePath);
  return loaded.default ?? loaded;
}

export function makeTempDir(prefix = "agp-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function writeFile(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, "utf8");
}

export function createInstallFixture(rootPath, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    writeFile(path.join(rootPath, relativePath), content);
  }
}

export function createTestContext(installPath, parameters = {}) {
  const backups = new Map();

  return {
    installPath,
    parameters,
    backups: {
      backupFile(filePath) {
        if (!backups.has(filePath) && fs.existsSync(filePath)) {
          backups.set(filePath, fs.readFileSync(filePath));
        }
      },
      restoreFile(filePath) {
        if (!backups.has(filePath)) {
          return false;
        }
        fs.writeFileSync(filePath, backups.get(filePath));
        return true;
      },
      listBackups() {
        return [...backups.keys()];
      }
    },
    logger: {
      info() {},
      warn() {},
      error() {}
    }
  };
}
