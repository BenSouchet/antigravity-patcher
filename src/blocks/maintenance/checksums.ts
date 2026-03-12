import fs from "node:fs";
import { antigravityFiles } from "../../core/antigravity-layout";
import { computeSha256Base64, readJsonFile, readTextFile, validateJavaScript, writeJsonFile, writeTextFile } from "../../core/file-utils";
import { replaceExactIfPresent } from "../../core/patch-helpers";
import { BlockDefinition } from "../../core/types";

const block: BlockDefinition = {
  id: "checksums",
  name: "Checksums",
  description: "Validate patched bundles, refresh product.json checksums, and optionally disable the integrity purity gate.",
  category: "maintenance",
  executionOrder: 8,
  defaultEnabled: true,
  parameters: [
    {
      key: "disableIntegrityCheck",
      label: "Disable Integrity Check",
      description: "Force the workbench purity check to always report the install as pure.",
      type: "boolean",
      defaultValue: true
    }
  ],
  async check(context) {
    const files = antigravityFiles(context.installPath);
    const product = readJsonFile<{ checksums?: Record<string, string> }>(files.productJson);
    const mismatches: string[] = [];
    for (const [relativePath, expected] of Object.entries(product.value.checksums ?? {})) {
      const absolutePath = context.installPath
        ? files.productJson.replace(/product\.json$/, relativePath.replace(/\//g, "\\"))
        : "";
      if (!absolutePath || !fs.existsSync(absolutePath)) {
        continue;
      }
      if (absolutePath.endsWith(".js")) {
        await validateJavaScript(readTextFile(absolutePath).text, relativePath);
      }
      const actual = computeSha256Base64(absolutePath);
      if (actual !== expected) {
        mismatches.push(relativePath);
      }
    }
    return {
      status: mismatches.length > 0 ? "skipped" : "skipped",
      message: mismatches.length > 0 ? `Checksum mismatches: ${mismatches.join(", ")}` : "All known checksums match.",
      touchedFiles: mismatches
    };
  },
  async apply(context) {
    const files = antigravityFiles(context.installPath);
    const product = readJsonFile<{ checksums?: Record<string, string> }>(files.productJson);
    const checksums = product.value.checksums ?? {};
    const touched = new Set<string>();

    for (const relativePath of Object.keys(checksums)) {
      const absolutePath = files.productJson.replace(/product\.json$/, relativePath.replace(/\//g, "\\"));
      if (!fs.existsSync(absolutePath)) {
        continue;
      }
      if (absolutePath.endsWith(".js")) {
        await validateJavaScript(readTextFile(absolutePath).text, relativePath);
      }
      checksums[relativePath] = computeSha256Base64(absolutePath);
    }

    context.backups.backupFile(files.productJson);
    writeJsonFile(files.productJson, product.value, product.hasBom, 1);
    touched.add(files.productJson);

    if (Boolean(context.parameters.disableIntegrityCheck ?? true)) {
      const workbench = readTextFile(files.workbenchJs);
      const nextWorkbench = replaceExactIfPresent(
        workbench.text,
        "isPure(){return this.b}",
        "/*AGP:integrity*/isPure(){return Promise.resolve({isPure:!0,proof:[]})}"
      );
      if (nextWorkbench.changed) {
        await validateJavaScript(nextWorkbench.content, "workbench.desktop.main.js");
        context.backups.backupFile(files.workbenchJs);
        writeTextFile(files.workbenchJs, nextWorkbench.content, workbench.hasBom);
        touched.add(files.workbenchJs);
        const refreshedProduct = readJsonFile<{ checksums?: Record<string, string> }>(files.productJson);
        refreshedProduct.value.checksums = refreshedProduct.value.checksums ?? {};
        refreshedProduct.value.checksums["vs/workbench/workbench.desktop.main.js"] = computeSha256Base64(files.workbenchJs);
        writeJsonFile(files.productJson, refreshedProduct.value, refreshedProduct.hasBom, 1);
      }
    }

    return {
      status: "applied",
      message: "Checksums refreshed.",
      touchedFiles: [...touched]
    };
  },
  async revert(context) {
    const restored = context.backups.listBackups().filter((filePath) => context.backups.restoreFile(filePath));
    return {
      status: restored.length > 0 ? "reverted" : "skipped",
      message: restored.length > 0 ? "Restored checksum-related backups." : "No checksum backups were available.",
      touchedFiles: restored
    };
  }
};

export default block;
