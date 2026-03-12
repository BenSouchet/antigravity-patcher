import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { BlockDefinition } from "../../core/types";

function settingsCandidates(): string[] {
  return [
    path.join(process.env.APPDATA || "", "antigravity", "User", "settings.json"),
    path.join(process.env.USERPROFILE || "", ".antigravity", "mcp.json"),
    path.join(process.env.USERPROFILE || "", ".antigravity", "settings", "mcp.json")
  ];
}

function patchMcpConfigs(): string[] {
  const touched: string[] = [];
  const nodePath = process.execPath;
  const npmRoot = path.join(path.dirname(nodePath), "node_modules", "npm", "bin", "npx-cli.js");
  if (!fs.existsSync(npmRoot)) {
    return touched;
  }

  for (const configPath of settingsCandidates()) {
    if (!fs.existsSync(configPath)) {
      continue;
    }
    const raw = fs.readFileSync(configPath, "utf8");
    if (!raw.includes("npx")) {
      continue;
    }
    const config = JSON.parse(raw) as Record<string, unknown>;
    const servers = (config.mcpServers ?? config["mcp.servers"]) as Record<string, { command?: string; args?: string[] }> | undefined;
    if (!servers) {
      continue;
    }

    let changed = false;
    for (const server of Object.values(servers)) {
      if (server.command && /npx(\.cmd|\.exe)?$/i.test(server.command)) {
        server.command = nodePath;
        server.args = [npmRoot, ...(server.args ?? [])];
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
      touched.push(configPath);
    }
  }

  return touched;
}

function ensureEnvPaths(): string[] {
  const touched: string[] = [];
  const defaults: Record<string, string> = {
    TEMP: path.join(process.env.USERPROFILE || "", "AppData", "Local", "Temp"),
    TMP: path.join(process.env.USERPROFILE || "", "AppData", "Local", "Temp"),
    APPDATA: path.join(process.env.USERPROFILE || "", "AppData", "Roaming"),
    LOCALAPPDATA: path.join(process.env.USERPROFILE || "", "AppData", "Local"),
    USERPROFILE: process.env.USERPROFILE || ""
  };

  for (const [name, fallback] of Object.entries(defaults)) {
    const current = process.env[name];
    const value = current && current.length > 0 ? current : fallback;
    if (!value) {
      continue;
    }
    if (!fs.existsSync(value)) {
      fs.mkdirSync(value, { recursive: true });
      touched.push(value);
    }
  }

  return touched;
}

function patchShortcuts(cdpPort: number): string[] {
  const touched: string[] = [];
  for (const shortcutPath of [
    path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs", "Antigravity", "Antigravity.lnk"),
    path.join(process.env.USERPROFILE || "", "Desktop", "Antigravity.lnk")
  ]) {
    if (!fs.existsSync(shortcutPath)) {
      continue;
    }
    try {
      execFileSync(
        "powershell",
        [
          "-NoProfile",
          "-Command",
          `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${shortcutPath.replace(/'/g, "''")}');if($s.Arguments -notmatch 'remote-debugging-port'){ $s.Arguments=($s.Arguments+' --remote-debugging-port=${cdpPort}').Trim();$s.Save(); }`
        ],
        {
          stdio: "ignore",
          windowsHide: true
        }
      );
      touched.push(shortcutPath);
    } catch {
      // Ignore shortcut failures.
    }
  }
  return touched;
}

const block: BlockDefinition = {
  id: "community-fixes",
  name: "Community Fixes",
  description: "Apply the MCP, CDP shortcut, and environment sanity fixes commonly needed on Windows.",
  category: "integration",
  executionOrder: 7,
  defaultEnabled: true,
  parameters: [
    {
      key: "cdpPort",
      label: "CDP Port",
      description: "Remote debugging port to ensure in Antigravity shortcuts.",
      type: "number",
      defaultValue: 9004,
      min: 1024,
      max: 65535,
      step: 1
    }
  ],
  async check() {
    return {
      status: "skipped",
      message: "Community fix targets detected.",
      touchedFiles: settingsCandidates()
    };
  },
  async apply(context) {
    const touched = [
      ...patchMcpConfigs(),
      ...ensureEnvPaths(),
      ...patchShortcuts(Number(context.parameters.cdpPort ?? 9004))
    ];
    return {
      status: touched.length > 0 ? "applied" : "skipped",
      message: touched.length > 0 ? "Community fixes applied." : "Nothing needed patching in community fixes.",
      touchedFiles: touched
    };
  },
  async revert() {
    return {
      status: "skipped",
      message: "Community fixes revert is not implemented."
    };
  }
};

export default block;
