import { antigravityFiles } from "../../core/antigravity-layout";
import { readTextFile, writeTextFile } from "../../core/file-utils";
import { BlockDefinition } from "../../core/types";

const PATCH_MARKER = "/*AGP:autorun*/";

function analyzeFile(content: string, forceMode: boolean): { target: string; replacement: string } {
  const patterns = [
    /(\w+)=(\w+)\((\w+)=>\{\w+\?\.setTerminalAutoExecutionPolicy\?\.\(\3\),\3===(\w+)\.EAGER&&(\w+)\(!0\)\},\[[\w,]*\]\)/,
    /(\w+)=(\w+)\((\w+)=>\{\w+\.setTerminalAutoExecutionPolicy\(\3\),\3===(\w+)\.EAGER&&(\w+)\(!0\)\},\[[\w,]*\]\)/,
    /(\w+)=(\w+)\((\w+)=>\{[^}]{0,200}setTerminalAutoExecutionPolicy[^}]{0,100}\3===(\w+)\.EAGER&&(\w+)\(!0\)\},\[[\w,]*\]\)/
  ];

  let onChangeMatch: RegExpMatchArray | null = null;
  let callbackAlias = "";
  let enumAlias = "";
  let confirmFn = "";

  for (const pattern of patterns) {
    const nextMatch = content.match(pattern);
    if (nextMatch) {
      onChangeMatch = nextMatch;
      callbackAlias = nextMatch[2] ?? "";
      enumAlias = nextMatch[4] ?? "";
      confirmFn = nextMatch[5] ?? "";
      break;
    }
  }

  if (!onChangeMatch) {
    throw new Error("Could not find the terminal auto-execution handler.");
  }

  const context = content.slice(Math.max(0, content.indexOf(onChangeMatch[0]) - 5000), content.indexOf(onChangeMatch[0]) + 5000);
  const effectCandidates = new Map<string, number>();
  const effectRe = /\b(\w{2,3})\(\(\)=>\{[^}]{3,80}\},\[/g;
  const cleanupRe = /\b(\w{2,3})\(\(\)=>\{[^}]*return\s*\(\)=>/g;

  let match: RegExpExecArray | null;
  while ((match = effectRe.exec(context)) !== null) {
    const alias = match[1];
    if (alias && alias !== callbackAlias && alias !== "var" && alias !== "new" && alias !== "for") {
      effectCandidates.set(alias, (effectCandidates.get(alias) ?? 0) + 1);
    }
  }
  while ((match = cleanupRe.exec(content)) !== null) {
    const alias = match[1];
    if (alias && alias !== callbackAlias) {
      effectCandidates.set(alias, (effectCandidates.get(alias) ?? 0) + 5);
    }
  }

  const useEffectAlias = [...effectCandidates.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  if (!useEffectAlias) {
    throw new Error("Could not determine the useEffect alias for auto-run.");
  }

  let patchCode = "";
  if (forceMode) {
    patchCode = `${PATCH_MARKER}__agp_eff=${useEffectAlias}(()=>{setTimeout(()=>${confirmFn}(!0),50)},[]),`;
  } else {
    const policyMatch = content.match(new RegExp(String.raw`(\w+)=\w+\?\.terminalAutoExecutionPolicy\?\?${enumAlias}\.OFF`));
    const secureMatch = content.match(/(\w+)=\w+\?\.secureModeEnabled\?\?!1/);
    if (!policyMatch?.[1] || !secureMatch?.[1]) {
      throw new Error("Could not determine polite auto-run variables.");
    }
    patchCode = `${PATCH_MARKER}__agp_eff=${useEffectAlias}(()=>{${policyMatch[1]}===${enumAlias}.EAGER&&!${secureMatch[1]}&&${confirmFn}(!0)},[]),`;
  }

  return {
    target: onChangeMatch[0],
    replacement: `${patchCode}${onChangeMatch[0]}`
  };
}

function patchContent(content: string, forceMode: boolean): string {
  if (content.includes(PATCH_MARKER)) {
    return content;
  }
  const { target, replacement } = analyzeFile(content, forceMode);
  return content.replace(target, replacement);
}

const block: BlockDefinition = {
  id: "auto-run",
  name: "Auto Run",
  description: "Auto-confirms terminal execution actions so commands run without manual confirmation.",
  category: "automation",
  executionOrder: 5,
  defaultEnabled: true,
  parameters: [
    {
      key: "mode",
      label: "Mode",
      description: "Force always auto-run, or respect the existing policy settings.",
      type: "select",
      defaultValue: "force",
      options: [
        { label: "Force", value: "force" },
        { label: "Polite", value: "polite" }
      ]
    }
  ],
  async check(context) {
    const files = antigravityFiles(context.installPath);
    return {
      status: "skipped",
      message: "Auto-run targets detected.",
      touchedFiles: [files.workbenchJs, files.jetskiAgentJs]
    };
  },
  async apply(context) {
    const files = antigravityFiles(context.installPath);
    const forceMode = String(context.parameters.mode ?? "force") !== "polite";
    const touched: string[] = [];

    for (const target of [files.workbenchJs, files.jetskiAgentJs]) {
      const source = readTextFile(target);
      const patched = patchContent(source.text, forceMode);
      if (patched !== source.text) {
        context.backups.backupFile(target);
        writeTextFile(target, patched, source.hasBom);
        touched.push(target);
      }
    }

    return {
      status: touched.length > 0 ? "applied" : "skipped",
      message: touched.length > 0 ? "Auto-run patch applied." : "Auto-run was already patched.",
      touchedFiles: touched
    };
  },
  async revert(context) {
    const restored = context.backups.listBackups().filter((filePath) => context.backups.restoreFile(filePath));
    return {
      status: restored.length > 0 ? "reverted" : "skipped",
      message: restored.length > 0 ? "Restored auto-run backups." : "No auto-run backups were available.",
      touchedFiles: restored
    };
  }
};

export default block;
