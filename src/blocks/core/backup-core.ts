import fs from "node:fs";
import path from "node:path";
import { BlockDefinition } from "../../core/types";

const block: BlockDefinition = {
  id: "backup-core",
  name: "Backup Core",
  description: "Prepare portable runtime folders and centralized backup metadata for all mutating Blocks.",
  category: "core",
  executionOrder: 1,
  defaultEnabled: true,
  parameters: [],
  async check(context) {
    const touchedFiles = [
      path.join(context.portableRoot, "backups"),
      path.join(context.portableRoot, "logs"),
      path.join(context.portableRoot, "config.json")
    ];
    return {
      status: "skipped",
      message: "Portable runtime layout is available.",
      touchedFiles
    };
  },
  async apply(context) {
    const backupsDir = path.join(context.portableRoot, "backups");
    const logsDir = path.join(context.portableRoot, "logs");
    fs.mkdirSync(backupsDir, { recursive: true });
    fs.mkdirSync(logsDir, { recursive: true });
    context.logger.info("Prepared portable runtime folders.", "backup-core");
    return {
      status: "applied",
      message: "Runtime folders are ready.",
      touchedFiles: [backupsDir, logsDir]
    };
  },
  async revert() {
    return {
      status: "skipped",
      message: "Backup core does not need a revert step."
    };
  }
};

export default block;
