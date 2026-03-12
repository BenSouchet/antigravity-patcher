import fs from "node:fs";
import { appResourcePath, antigravityFiles } from "../../core/antigravity-layout";
import { readJsonFile, readTextFile, validateJavaScript, writeJsonFile, writeTextFile } from "../../core/file-utils";
import { replaceExact, replaceExactIfPresent } from "../../core/patch-helpers";
import { BlockDefinition } from "../../core/types";

function ensureArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

const block: BlockDefinition = {
  id: "extension-runtime",
  name: "Extension Runtime",
  description: "Apply the main Antigravity extension, workbench, API proposal, command, and HTML runtime fixes.",
  category: "runtime",
  executionOrder: 3,
  defaultEnabled: true,
  parameters: [],
  async check(context) {
    const files = antigravityFiles(context.installPath);
    return {
      status: "skipped",
      message: "Runtime patch targets detected.",
      touchedFiles: [files.productJson, files.antigravityPackageJson, files.gitPackageJson, files.extensionJs, files.workbenchJs]
    };
  },
  async apply(context) {
    const files = antigravityFiles(context.installPath);
    const touched = new Set<string>();

    const product = readJsonFile<Record<string, unknown>>(files.productJson);
    const proposals = (product.value.extensionEnabledApiProposals ?? {}) as Record<string, unknown>;
    const removals: Record<string, string[]> = {
      "ms-vscode.vscode-selfhost-test-provider": ["attributableCoverage"],
      "ms-vsliveshare.vsliveshare": ["notebookCellExecutionState"],
      "ms-python.gather": ["notebookCellExecutionState"],
      "ms-python.vscode-pylance": ["notebookCellExecutionState"],
      "ms-toolsai.jupyter": ["notebookCellExecutionState"],
      "dbaeumer.vscode-eslint": ["notebookCellExecutionState"],
      "ms-python.python": ["contribIssueReporter"],
      "ms-python.debugpy": ["contribIssueReporter"],
      "GitHub.vscode-pull-request-github": ["fileComments"],
      "GitHub.copilot-chat": ["chatVariableResolver", "lmTools"],
      "ms-azuretools.vscode-azure-github-copilot": ["lmTools"],
      "ms-vscode.cpptools": ["lmTools"],
      "redhat.java": ["documentPaste"],
      "vscjava.vscode-java-pack": ["lmTools"]
    };

    for (const [extensionId, toRemove] of Object.entries(removals)) {
      const current = ensureArray(proposals[extensionId]);
      if (current.length === 0) {
        continue;
      }
      const filtered = current.filter((proposal) => !toRemove.includes(proposal));
      if (filtered.length === current.length) {
        continue;
      }
      if (filtered.length === 0) {
        delete proposals[extensionId];
      } else {
        proposals[extensionId] = filtered;
      }
    }

    const pythonCurrent = ensureArray(proposals["ms-python.python"]);
    for (const proposal of [
      "codeActionAI",
      "notebookVariableProvider",
      "quickPickItemTooltip",
      "terminalDataWriteEvent",
      "terminalExecuteCommandEvent",
      "notebookReplDocument"
    ]) {
      if (!pythonCurrent.includes(proposal)) {
        pythonCurrent.push(proposal);
      }
    }
    proposals["ms-python.python"] = pythonCurrent;

    const envCurrent = ensureArray(proposals["ms-python.vscode-python-envs"]);
    for (const proposal of ["terminalShellEnv", "terminalDataWriteEvent"]) {
      if (!envCurrent.includes(proposal)) {
        envCurrent.push(proposal);
      }
    }
    proposals["ms-python.vscode-python-envs"] = envCurrent;

    context.backups.backupFile(files.productJson);
    writeJsonFile(files.productJson, product.value, product.hasBom);
    touched.add(files.productJson);

    const antigravityPackage = readJsonFile<Record<string, any>>(files.antigravityPackageJson);
    const commands = Array.isArray(antigravityPackage.value.contributes?.commands)
      ? antigravityPackage.value.contributes.commands
      : [];
    for (const command of [
      { command: "antigravity.importAntigravitySettings", title: "Import Antigravity settings" },
      { command: "antigravity.importAntigravityExtensions", title: "Import Antigravity extensions" },
      { command: "antigravity.prioritized.chat.open", title: "Chat" }
    ]) {
      if (!commands.some((existing: { command?: string }) => existing.command === command.command)) {
        commands.push(command);
      }
    }
    antigravityPackage.value.contributes.commands = commands;
    context.backups.backupFile(files.antigravityPackageJson);
    writeJsonFile(files.antigravityPackageJson, antigravityPackage.value, antigravityPackage.hasBom, 0);
    touched.add(files.antigravityPackageJson);

    const gitPackage = readJsonFile<Record<string, any>>(files.gitPackageJson);
    const gitCommands = Array.isArray(gitPackage.value.contributes?.commands) ? gitPackage.value.contributes.commands : [];
    for (const [commandId, title] of Object.entries({
      "git.antigravityCloneNonInteractive": "Clone Repository (Non-Interactive)",
      "git.antigravityGetRemoteUrl": "Get Remote URL"
    })) {
      const command = gitCommands.find((existing: { command?: string }) => existing.command === commandId);
      if (command && !command.title) {
        command.title = title;
      }
    }
    context.backups.backupFile(files.gitPackageJson);
    writeJsonFile(files.gitPackageJson, gitPackage.value, gitPackage.hasBom, 0);
    touched.add(files.gitPackageJson);

    let extensionJs = readTextFile(files.extensionJs);
    let workbenchJs = readTextFile(files.workbenchJs);

    extensionJs = {
      ...extensionJs,
      text: replaceExactIfPresent(
        extensionJs.text,
        'if(!_.instance)_.initialize();return _.instance',
        'if(!_.instance)throw new m.GenericLanguageServerError("LanguageServerClient must be initialized first!");return _.instance'
      ).content
    };
    extensionJs = {
      ...extensionJs,
      text: replaceExactIfPresent(
        extensionJs.text,
        'updateUserStatus(){try{const e=i.LanguageServerClient.getInstance();if(!e.started)return;',
        'updateUserStatus(){try{let e;try{e=i.LanguageServerClient.getInstance()}catch{return}if(!e.started)return;'
      ).content
    };

    workbenchJs = {
      ...workbenchJs,
      text: replaceExactIfPresent(
        workbenchJs.text,
        'dra=class extends ne{get model(){return this.a||(this.a=this.D(this.b.createInstance(O2n)),this.a.resolve(void 0)),this.a}constructor(e){super(),this.b=e}getSession(e){return this.model.getSession(e)}};dra=cQu([uQu(0,ve)],dra);var pbt=Wt("agentSessions");',
        'dra=class extends ne{get model(){return this.a||(this.a=this.D(this.b.createInstance(O2n)),this.a.resolve(void 0)),this.a}constructor(e){super(),this.b=e}getSession(e){return this.model.getSession(e)}};dra=cQu([uQu(0,ve)],dra);var pbt=Wt("agentSessions");di(pbt,dra,1);'
      ).content
    };

    const fileAccessPattern = /return L\("div",\{className:"my-1 flex w-full flex-wrap items-center justify-between",children:\[L\("p",\{children:\["Allow ",a," access to ",e\.absolutePathUri,"\?"\]\}\),L\("div",\{className:"ml-auto flex flex-row gap-x-2 gap-y-2",children:\[L\("button",\{onClick:\(\)=>[^}]*\},className:"cursor-pointer rounded-sm text-sm opacity-60 transition-\[opacity\] hover:opacity-100",children:"Deny"\}\),L\("button",\{onClick:\(\)=>[^}]*\},className:"hover:bg-ide-button-hover-background cursor-pointer rounded-sm bg-ide-button-background px-1 py-px text-sm text-ide-button-color transition-\[background\]",children:"Allow Once"\}\),L\("button",\{onClick:\(\)=>[^}]*\},className:"hover:bg-ide-button-hover-background cursor-pointer rounded-sm bg-ide-button-background px-1 py-px text-sm text-ide-button-color transition-\[background\]",children:"Allow This Conversation"\}\)\]\}\)\]\}\)/;
    const shouldProbeFileAccessPatch =
      !workbenchJs.text.includes("setTimeout(()=>o(!0,blt.CONVERSATION),0),null") &&
      workbenchJs.text.includes('children:["Allow ",a," access to ",e.absolutePathUri,"?"]');
    if (shouldProbeFileAccessPatch && fileAccessPattern.test(workbenchJs.text)) {
      workbenchJs.text = workbenchJs.text.replace(fileAccessPattern, "return setTimeout(()=>o(!0,blt.CONVERSATION),0),null");
    }

    await validateJavaScript(extensionJs.text, "extension.js");
    await validateJavaScript(workbenchJs.text, "workbench.desktop.main.js");
    context.backups.backupFile(files.extensionJs);
    context.backups.backupFile(files.workbenchJs);
    writeTextFile(files.extensionJs, extensionJs.text, extensionJs.hasBom);
    writeTextFile(files.workbenchJs, workbenchJs.text, workbenchJs.hasBom);
    touched.add(files.extensionJs);
    touched.add(files.workbenchJs);

    for (const htmlPath of [files.workbenchHtml, files.workbenchJetskiHtml]) {
      if (!fs.existsSync(htmlPath)) {
        continue;
      }
      const html = readTextFile(htmlPath);
      const nextHtml = html.text.replace(/require-trusted-types-for\s*'script'\s*;/g, "");
      if (nextHtml !== html.text) {
        context.backups.backupFile(htmlPath);
        writeTextFile(htmlPath, nextHtml, html.hasBom);
        touched.add(htmlPath);
      }
    }

    if (!fs.existsSync(files.chromeDevtoolsMcpPackageJson)) {
      writeTextFile(files.chromeDevtoolsMcpPackageJson, '{"type":"module"}');
      touched.add(files.chromeDevtoolsMcpPackageJson);
    }

    context.logger.info("Applied extension runtime fixes.", "extension-runtime");
    return {
      status: "applied",
      message: "Extension runtime fixes applied.",
      touchedFiles: [...touched]
    };
  },
  async revert(context) {
    const touched = context.backups.listBackups().filter((filePath) => context.backups.restoreFile(filePath));
    return {
      status: touched.length > 0 ? "reverted" : "skipped",
      message: touched.length > 0 ? "Restored extension runtime backups." : "No extension runtime backups were available.",
      touchedFiles: touched
    };
  }
};

export default block;
