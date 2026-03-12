import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  path.join(root, "dist"),
  path.join(root, "release"),
  path.join(root, "runtime", "backups"),
  path.join(root, "runtime", "logs")
];

for (const target of targets) {
  fs.rmSync(target, { recursive: true, force: true });
}

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.startsWith("tmp-")) {
    fs.rmSync(path.join(root, entry.name), { force: true });
  }
}
