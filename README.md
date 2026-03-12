# Antigravity Patcher

Clean, portable Windows patch orchestration for Antigravity.

It ships as a desktop app with a modular block system: each patch is isolated, ordered, configurable, and reversible when supported.

## Get Started

### For most users

Download the latest portable build from the [Releases page](https://github.com/BenSouchet/antigravity-patcher/releases).

That is the recommended path if you just want to run the app.

### For developers

```powershell
npm install
npm run dev:watch
```

`npm run dev:watch` is the main development loop:

- builds the app once
- starts the block/app watcher
- launches Electron
- restarts Electron automatically when compiled output changes

If you only want a one-shot local launch without the watcher:

```powershell
npm run dev
```

## Why This Project

Antigravity Patcher avoids a giant one-off patch script.

Instead, it uses small focused blocks that can:

- check whether a patch target is present
- apply a change
- revert from backup when the block supports it
- expose parameters to the UI
- run in deterministic order through `executionOrder`

## Modular Block Architecture

Blocks live in `src/blocks/<category>/*.ts` and are compiled into `dist/blocks/<category>/*.js`.

The category folders are organizational. Actual execution order is defined by each block's `executionOrder` value, then loaded and sorted by the orchestrator.

Each block exports a default `BlockDefinition` with:

- `id`
- `name`
- `description`
- `category`
- `executionOrder`
- `defaultEnabled`
- `parameters`
- `check(context)`
- `apply(context)`
- `revert(context)` when supported

Portable runtime data is kept alongside the app:

- `runtime/config.json`
- `runtime/backups/`
- `runtime/logs/`

## Block Template

```ts
import { BlockDefinition } from "../../core/types";

const block: BlockDefinition = {
  id: "my-block",
  name: "My Block",
  description: "Describe exactly what this block patches.",
  category: "runtime",
  executionOrder: 50,
  defaultEnabled: true,
  parameters: [
    {
      key: "enabledMode",
      label: "Mode",
      type: "select",
      defaultValue: "safe",
      options: [
        { label: "Safe", value: "safe" },
        { label: "Aggressive", value: "aggressive" }
      ]
    }
  ],
  async check(context) {
    return {
      status: "skipped",
      message: "Patch target detected.",
      touchedFiles: []
    };
  },
  async apply(context) {
    return {
      status: "applied",
      message: "Patch applied.",
      touchedFiles: []
    };
  },
  async revert(context) {
    return {
      status: "reverted",
      message: "Patch reverted.",
      touchedFiles: []
    };
  }
};

export default block;
```

## Shipped Blocks

| Block | Category | What it does |
| --- | --- | --- |
| `backup-core` | Core | Prepares the portable runtime folders and backup/log layout used by all mutating blocks. |
| `auth-integrity` | Maintenance | Clears the cached `integrityService` state from `state.vscdb` so modified bundles do not stay blocked by stale integrity data. |
| `extension-runtime` | Runtime | Applies the core runtime patch set. See the detailed breakdown below for the exact fixes and feature unlocks. |
| `unleash-offline` | Runtime | Forces the Unleash path onto a local offline fallback and suppresses remaining Unleash log noise. |
| `auto-run` | Automation | Auto-confirms terminal execution prompts so commands can run without manual approval. Includes `force` and `polite` modes. |
| `auto-retry` | Automation | Automatically clicks retry/continue actions after a configurable delay with a configurable retry cap. |
| `community-fixes` | Integration | Applies common Windows fixes for MCP config, shortcut CDP flags, and missing environment directories. |
| `checksums` | Maintenance | Revalidates patched bundles, refreshes `product.json` checksums, and can disable the workbench integrity purity gate. |

## Extension Runtime Breakdown

`extension-runtime` is the main compatibility and feature block. It applies these changes:

- trims incompatible or undesired extension API proposals from `product.json` for extensions such as Copilot Chat, Python, Jupyter, ESLint, Java, C++, Live Share, and related tooling
- adds the extra Python API proposals needed for the patched runtime, including `codeActionAI`, notebook variable/repl support, quick-pick tooltips, and terminal execution/data events
- adds missing Python environment proposals including `terminalShellEnv` and `terminalDataWriteEvent`
- restores the `antigravity.importAntigravitySettings` command entry in the extension manifest
- restores the `antigravity.importAntigravityExtensions` command entry in the extension manifest
- restores the `antigravity.prioritized.chat.open` command entry in the extension manifest
- fills in the missing title for `git.antigravityCloneNonInteractive`
- fills in the missing title for `git.antigravityGetRemoteUrl`
- hardens the language server path so the client must be initialized before use instead of silently entering a broken state
- guards user-status updates so they do not crash when the language server client is unavailable
- patches workbench agent session registration so the session service is properly wired
- auto-accepts the "Allow access to <path>" conversation-level file access prompt in the workbench flow
- removes `require-trusted-types-for 'script'` from the patched workbench HTML files when present
- writes a `{"type":"module"}` package file for the Chrome DevTools MCP runtime when it is missing

In practice, this block is the one that brings back the bulk of the missing runtime behavior after bundle modifications.

## Development Commands

```powershell
npm install
npm run build
npm run build:watch
npm run dev
npm run dev:watch
npm test
npm run package:portable
```

`npm run build:watch` keeps the build pipeline active.

`npm run dev:watch` is the closest thing to hot reload in this repo: it rebuilds on change and restarts Electron automatically.

## Portable Output

Packaging produces:

- `release/portable/`
- `release/AntigravityPatcher.zip`

## Notes

- This project is built for Windows.
- User block selections and parameter values persist in `runtime/config.json`.

## Disclaimer

This project is provided for educational purposes only.

You are solely responsible for how you use this app, and the authors or contributors are not responsible for any misuse, damage, account issues, policy violations, or other consequences resulting from its use.
