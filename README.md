# Antigravity Blocks Orchestrator

Portable Windows orchestrator for applying, checking, and reverting Antigravity patch Blocks without relying on the legacy root scripts at runtime.

## Runtime Layout

The portable build is shipped as a zip containing:

- `AntigravityBlocks.exe`
- `blocks/<category>/<block>.js`
- `config.json`
- `backups/`
- `logs/`

Category subfolders inside `blocks/` are organizational only. Block execution order is driven by each Block's `executionOrder` field.

## Commands

```powershell
npm install
npm run build
npm run build:watch
npm run dev
npm run dev:watch
npm test
npm run package:portable
```

Portable artifacts are created in `release/`:

- `release/portable/`
- `release/AntigravityBlocks-portable.zip`

## Debug Workflows

- `npm run dev`: one-shot build, then launch Electron
- `npm run build:watch`: keep recompiling while source files change
- `npm run dev:watch`: build once, start the build watcher, launch Electron, and restart Electron when compiled output changes

`dev:watch` is intended for the edit-debug loop on Windows while you tune Blocks, UI, or orchestration logic.

## Block Contract

Each Block file exports one default Block definition with:

- `id`
- `name`
- `description`
- `category`
- `executionOrder`
- `defaultEnabled`
- `parameters`
- `check(ctx)`
- `apply(ctx)`
- `revert(ctx)` when supported

Execution is deterministic and always sorted by `executionOrder`.

## Initial Blocks

- `backup-core`
- `auth-integrity`
- `extension-runtime`
- `unleash-offline`
- `auto-run`
- `auto-retry`
- `community-fixes`
- `checksums`

## Notes

- Root PowerShell and Node scripts remain the legacy baseline and are not used by the migrated app at runtime.
- `unleash-offline` explicitly short-circuits the Unleash fetch path and suppresses the noisy Unleash log output.
- User selections and parameter values persist in `config.json` next to the portable app.
