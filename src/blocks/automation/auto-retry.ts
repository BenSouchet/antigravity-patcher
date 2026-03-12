import { antigravityFiles } from "../../core/antigravity-layout";
import { readTextFile, writeTextFile } from "../../core/file-utils";
import { BlockDefinition } from "../../core/types";

const PATCH_MARKER = "/*AGP:autoretry*/";

function patchRetry(content: string, delay: number, maxRetries: number): string {
  if (content.includes(PATCH_MARKER)) {
    return content;
  }

  const retryableMatch = content.match(/(\w)\("Try again","Try again"\)/);
  const genericMatch = content.match(/(\w)\("Retry","Continue"\)/);
  if (!retryableMatch && !genericMatch) {
    throw new Error("Could not find retry action patterns.");
  }

  const wrap = (originalCall: string, retryType: string) =>
    `${PATCH_MARKER}(()=>{let _a=${originalCall};if(!window.__agp_rt)window.__agp_rt={c:0,t:null};let _r=window.__agp_rt;if(_r.c<${maxRetries}&&!_r.t){_r.c++;console.log("[AGP] Auto-retry #"+_r.c+"/${maxRetries} in ${delay / 1000}s (${retryType})");_r.t=setTimeout(()=>{_r.t=null;_a.onClick()},${delay})}return _a})()`;

  let next = content;
  if (retryableMatch?.[0]) {
    next = next.replace(retryableMatch[0], wrap(retryableMatch[0], "retryable"));
  }
  if (genericMatch?.[0]) {
    next = next.replace(genericMatch[0], wrap(genericMatch[0], "generic"));
  }

  return next;
}

const block: BlockDefinition = {
  id: "auto-retry",
  name: "Auto Retry",
  description: "Automatically triggers Retry or Continue when the agent exposes retryable error actions.",
  category: "automation",
  executionOrder: 6,
  defaultEnabled: true,
  parameters: [
    {
      key: "delayMs",
      label: "Delay (ms)",
      description: "Delay before automatically clicking retry.",
      type: "number",
      defaultValue: 5000,
      min: 250,
      max: 60000,
      step: 250
    },
    {
      key: "maxRetries",
      label: "Max Retries",
      description: "Maximum number of automatic retries before stopping.",
      type: "number",
      defaultValue: 30,
      min: 1,
      max: 100,
      step: 1
    }
  ],
  async check(context) {
    const files = antigravityFiles(context.installPath);
    return {
      status: "skipped",
      message: "Auto-retry targets detected.",
      touchedFiles: [files.workbenchJs, files.jetskiAgentJs]
    };
  },
  async apply(context) {
    const files = antigravityFiles(context.installPath);
    const delay = Number(context.parameters.delayMs ?? 5000);
    const maxRetries = Number(context.parameters.maxRetries ?? 30);
    const touched: string[] = [];

    for (const target of [files.workbenchJs, files.jetskiAgentJs]) {
      const source = readTextFile(target);
      const patched = patchRetry(source.text, delay, maxRetries);
      if (patched !== source.text) {
        context.backups.backupFile(target);
        writeTextFile(target, patched, source.hasBom);
        touched.push(target);
      }
    }

    return {
      status: touched.length > 0 ? "applied" : "skipped",
      message: touched.length > 0 ? `Auto-retry patch applied with ${delay}ms / ${maxRetries} retries.` : "Auto-retry was already patched.",
      touchedFiles: touched
    };
  },
  async revert(context) {
    const restored = context.backups.listBackups().filter((filePath) => context.backups.restoreFile(filePath));
    return {
      status: restored.length > 0 ? "reverted" : "skipped",
      message: restored.length > 0 ? "Restored auto-retry backups." : "No auto-retry backups were available.",
      touchedFiles: restored
    };
  }
};

export default block;
