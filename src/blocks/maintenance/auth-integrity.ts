import fs from "node:fs";
import path from "node:path";
import { BlockDefinition } from "../../core/types";

function stateDbPath(): string {
  return path.join(process.env.APPDATA || "", "antigravity", "User", "globalStorage", "state.vscdb");
}

async function deleteIntegrityKey(filePath: string): Promise<boolean> {
  const sqliteModulePath = path.join(
    process.env.LOCALAPPDATA || "",
    "Programs",
    "Antigravity",
    "resources",
    "app",
    "node_modules",
    "@vscode",
    "sqlite3"
  );

  if (!fs.existsSync(sqliteModulePath)) {
    return false;
  }

  const { Database } = require(sqliteModulePath) as {
    Database: new (
      file: string,
      callback: (error?: Error | null) => void
    ) => {
      run(sql: string, callback: (error: Error | null, result?: unknown) => void): void;
      close(): void;
    };
  };

  return await new Promise<boolean>((resolve) => {
    const db = new Database(filePath, (error?: Error | null) => {
      if (error) {
        resolve(false);
        return;
      }
      db.run("DELETE FROM ItemTable WHERE key = 'integrityService';", (runError: Error | null) => {
        db.close();
        resolve(!runError);
      });
    });
  });
}

const block: BlockDefinition = {
  id: "auth-integrity",
  name: "Auth Integrity",
  description: "Clear the cached integrity state that can keep Antigravity blocked after bundle modifications.",
  category: "maintenance",
  executionOrder: 2,
  defaultEnabled: true,
  parameters: [],
  async check() {
    const db = stateDbPath();
    return {
      status: fs.existsSync(db) ? "skipped" : "skipped",
      message: fs.existsSync(db) ? "state.vscdb exists and can be cleared during apply." : "state.vscdb was not found.",
      touchedFiles: fs.existsSync(db) ? [db] : []
    };
  },
  async apply(context) {
    const db = stateDbPath();
    if (!fs.existsSync(db)) {
      return {
        status: "skipped",
        message: "state.vscdb was not found."
      };
    }

    const cleared = await deleteIntegrityKey(db);
    if (!cleared) {
      throw new Error("Could not clear integrityService from state.vscdb");
    }

    context.logger.info("Cleared integrityService cache entry.", "auth-integrity");
    return {
      status: "applied",
      message: "Cleared integrityService from state.vscdb.",
      touchedFiles: [db]
    };
  },
  async revert() {
    return {
      status: "skipped",
      message: "Auth integrity cache clearing has no revert step."
    };
  }
};

export default block;
