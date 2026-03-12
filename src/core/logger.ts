import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import path from "node:path";
import { LogEntry, RuntimeEvent } from "./types";
import { getLogsRoot } from "./runtime-paths";
import { ensureDir } from "./file-utils";

export class RuntimeLogger extends EventEmitter {
  private readonly entries: LogEntry[] = [];
  private readonly filePath: string;

  constructor() {
    super();
    ensureDir(getLogsRoot());
    this.filePath = path.join(getLogsRoot(), "latest.log");
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  info(message: string, blockId?: string): void {
    this.push("info", message, blockId);
  }

  debug(message: string, blockId?: string): void {
    this.push("debug", message, blockId);
  }

  warn(message: string, blockId?: string): void {
    this.push("warn", message, blockId);
  }

  error(message: string, blockId?: string): void {
    this.push("error", message, blockId);
  }

  private push(level: LogEntry["level"], message: string, blockId?: string): void {
    const entry: LogEntry = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      message,
      blockId
    };

    this.entries.push(entry);
    if (this.entries.length > 500) {
      this.entries.shift();
    }

    appendFileSync(this.filePath, `[${entry.timestamp}] ${level.toUpperCase()} ${blockId ? `[${blockId}] ` : ""}${message}\n`, "utf8");
    this.emit("event", {
      kind: "log",
      entry
    } satisfies RuntimeEvent);
  }
}
