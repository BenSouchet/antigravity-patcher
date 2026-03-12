import { BrowserWindow } from "electron";
import { getBackupsRoot } from "./runtime-paths";
import { BackupService } from "./backup-service";
import { stopAntigravity } from "./install";
import { RuntimeLogger } from "./logger";
import { BlockDefinition, BlockState, RunRequest, RuntimeEvent } from "./types";

export class BlockRunner {
  constructor(
    private readonly logger: RuntimeLogger,
    private readonly window: BrowserWindow,
    private readonly portableRoot: string
  ) {}

  async run(request: RunRequest, blocks: BlockDefinition[], blockStates: BlockState[]): Promise<boolean> {
    const runStartedAt = Date.now();
    this.logger.info(`START ${request.mode.toUpperCase()} run.`, "runner");
    if (request.mode !== "check") {
      stopAntigravity();
      this.logger.info("Stopped Antigravity before mutation run.", "runner");
    }

    const selected = blocks.filter((block) => request.selectedBlockIds.includes(block.id));
    if (selected.length === 0) {
      this.logger.warn("No Blocks were selected for execution.", "runner");
      this.window.webContents.send("runtime-event", {
        kind: "run-finished",
        success: true,
        mode: request.mode
      } satisfies RuntimeEvent);
      return true;
    }

    this.logger.info(`Queued ${selected.length} Block(s) for execution.`, "runner");
    let success = true;

    for (const block of selected) {
      const state = blockStates.find((candidate) => candidate.id === block.id);
      if (!state) {
        continue;
      }

      const blockStartedAt = Date.now();
      this.logger.info(`START ${request.mode.toUpperCase()} ${block.name}.`, block.id);
      this.pushStatus(block.id, "checking", `${request.mode.toUpperCase()} started`);

      try {
        const backups = new BackupService(getBackupsRoot(), block.id);
        const context = {
          installPath: request.installPath,
          portableRoot: this.portableRoot,
          mode: request.mode,
          parameters: request.parameterValues[block.id] ?? {},
          logger: this.logger,
          backups: {
            backupFile: (filePath: string) => backups.backupFile(filePath),
            restoreFile: (filePath: string) => backups.restoreFile(filePath),
            listBackups: () => backups.listBackups()
          }
        };

        const result =
          request.mode === "check"
            ? await block.check(context)
            : request.mode === "apply"
              ? await block.apply(context)
              : await (block.revert
                  ? block.revert(context)
                  : Promise.resolve({
                      status: "skipped" as const,
                      message: "This block does not support revert."
                    }));

        state.status = result.status;
        state.lastMessage = result.message;
        state.touchedFiles = result.touchedFiles ?? [];
        const elapsedMs = Date.now() - blockStartedAt;
        const touchedCount = state.touchedFiles.length;
        this.logger.info(
          `END ${request.mode.toUpperCase()} ${block.name}: ${result.message} (${elapsedMs} ms, ${touchedCount} touched file${touchedCount === 1 ? "" : "s"})`,
          block.id
        );
        this.pushStatus(block.id, result.status, result.message, result.touchedFiles);
      } catch (error) {
        success = false;
        const message = (error as Error).message;
        const elapsedMs = Date.now() - blockStartedAt;
        state.status = "failed";
        state.lastMessage = message;
        state.touchedFiles = [];
        this.logger.error(`FAILED ${request.mode.toUpperCase()} ${block.name}: ${message} (${elapsedMs} ms)`, block.id);
        this.pushStatus(block.id, "failed", message);
        break;
      }
    }

    const totalElapsedMs = Date.now() - runStartedAt;
    this.logger.info(
      success
        ? `END ${request.mode.toUpperCase()} run finished successfully in ${totalElapsedMs} ms.`
        : `END ${request.mode.toUpperCase()} run stopped after a failure in ${totalElapsedMs} ms.`,
      "runner"
    );

    this.window.webContents.send("runtime-event", {
      kind: "run-finished",
      success,
      mode: request.mode
    } satisfies RuntimeEvent);

    return success;
  }

  private pushStatus(blockId: string, status: BlockState["status"], message: string, touchedFiles: string[] = []): void {
    this.window.webContents.send("runtime-event", {
      kind: "block-status",
      blockId,
      status,
      message,
      touchedFiles
    } satisfies RuntimeEvent);
  }
}
