import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import log from "electron-log";
import { loadBlocks } from "./core/block-loader";
import { ConfigStore } from "./core/config-store";
import { detectInstallPath, launchAntigravity } from "./core/install";
import { IPC_CHANNELS } from "./core/ipc";
import { RuntimeLogger } from "./core/logger";
import { BlockRunner } from "./core/runner";
import { ensurePortableLayout, getBlocksRoot, getPortableRoot } from "./core/runtime-paths";
import { AppConfig, BlockDefinition, BlockState, RuntimeSnapshot, RunRequest } from "./core/types";

let mainWindow: BrowserWindow | null = null;
const logger = new RuntimeLogger();
const configStore = new ConfigStore();
let blockStates: BlockState[] = [];
let loggerBridgeBound = false;

function getWindowIconPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.ico")
    : path.resolve(__dirname, "..", "..", "assets", "icon.ico");
}

function toBlockState(block: BlockDefinition): BlockState {
  return {
    id: block.id,
    name: block.name,
    description: block.description,
    category: block.category,
    executionOrder: block.executionOrder,
    defaultEnabled: block.defaultEnabled,
    parameters: [...block.parameters],
    canRevert: typeof block.revert === "function",
    status: "idle",
    lastMessage: "",
    touchedFiles: []
  };
}

function buildSnapshot(config: AppConfig): RuntimeSnapshot {
  return {
    config,
    blocks: blockStates.map((block) => ({
      ...block,
      parameters: [...block.parameters],
      touchedFiles: [...block.touchedFiles]
    })),
    logs: logger.getEntries().map((entry) => ({ ...entry })),
    detectedInstallPath: detectInstallPath(),
    portableRoot: getPortableRoot()
  };
}

function reloadBlockStates(): void {
  const previousStates = new Map(blockStates.map((block) => [block.id, block]));
  const blocks = loadBlocks(getBlocksRoot());
  blockStates = blocks.map((block) => {
    const nextState = toBlockState(block);
    const previous = previousStates.get(block.id);
    return previous
      ? {
          ...nextState,
          status: previous.status,
          lastMessage: previous.lastMessage,
          touchedFiles: [...previous.touchedFiles]
        }
      : nextState;
  });
}

function bindLoggerBridge(): void {
  if (loggerBridgeBound) {
    return;
  }

  logger.on("event", (event) => {
    mainWindow?.webContents.send(IPC_CHANNELS.runtimeEvent, event);
  });
  loggerBridgeBound = true;
}

function registerIpcHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.snapshot);
  ipcMain.removeHandler(IPC_CHANNELS.saveConfig);
  ipcMain.removeHandler(IPC_CHANNELS.detectInstallPath);
  ipcMain.removeHandler(IPC_CHANNELS.launchAntigravity);
  ipcMain.removeHandler(IPC_CHANNELS.openPortableRoot);
  ipcMain.removeHandler(IPC_CHANNELS.reloadBlocks);
  ipcMain.removeHandler(IPC_CHANNELS.runBlocks);

  ipcMain.handle(IPC_CHANNELS.snapshot, async () => buildSnapshot(configStore.load()));
  ipcMain.handle(IPC_CHANNELS.saveConfig, async (_event, nextConfig: AppConfig) => buildSnapshot(configStore.save(nextConfig)));
  ipcMain.handle(IPC_CHANNELS.detectInstallPath, async () => detectInstallPath());
  ipcMain.handle(IPC_CHANNELS.launchAntigravity, async (_event, installPath: string) => {
    launchAntigravity(installPath);
    logger.info(`Launched Antigravity from ${installPath}`);
  });
  ipcMain.handle(IPC_CHANNELS.openPortableRoot, async () => {
    await shell.openPath(getPortableRoot());
  });
  ipcMain.handle(IPC_CHANNELS.reloadBlocks, async () => {
    reloadBlockStates();
    logger.info(`Reloaded Blocks from ${getBlocksRoot()}`);
    return buildSnapshot(configStore.load());
  });
  ipcMain.handle(IPC_CHANNELS.runBlocks, async (_event, request: RunRequest) => {
    const runner = new BlockRunner(logger, mainWindow!, getPortableRoot());
    const blocksForRun = loadBlocks(getBlocksRoot());
    await runner.run(request, blocksForRun, blockStates);
    const selectedMap = Object.fromEntries(blockStates.map((block) => [block.id, request.selectedBlockIds.includes(block.id)]));
    const nextConfig = configStore.save({
      ...configStore.load(),
      installPath: request.installPath,
      selectedBlocks: selectedMap,
      blockParameterValues: request.parameterValues,
      lastMode: request.mode,
      lastRunAt: new Date().toISOString()
    });
    return buildSnapshot(nextConfig);
  });
}

async function createWindow(): Promise<void> {
  ensurePortableLayout();
  reloadBlockStates();

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: "#edf1ee",
    title: "Antigravity Patcher",
    icon: getWindowIconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.setMenuBarVisibility(false);

  bindLoggerBridge();
  registerIpcHandlers();

  await mainWindow.loadFile(path.join(__dirname, "index.html"));

  if (!app.isPackaged && process.env.AGP_OPEN_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(async () => {
  log.initialize();
  app.setName("Antigravity Patcher");
  await createWindow();
  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
