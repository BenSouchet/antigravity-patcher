import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./core/ipc";
import { AppConfig, OrchestratorBridge, RunRequest, RuntimeEvent } from "./core/types";

const api: OrchestratorBridge = {
  getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.snapshot),
  saveConfig: (config: AppConfig) => ipcRenderer.invoke(IPC_CHANNELS.saveConfig, config),
  runBlocks: (request: RunRequest) => ipcRenderer.invoke(IPC_CHANNELS.runBlocks, request),
  detectInstallPath: () => ipcRenderer.invoke(IPC_CHANNELS.detectInstallPath),
  launchAntigravity: (installPath: string) => ipcRenderer.invoke(IPC_CHANNELS.launchAntigravity, installPath),
  openPortableRoot: () => ipcRenderer.invoke(IPC_CHANNELS.openPortableRoot),
  reloadBlocks: () => ipcRenderer.invoke(IPC_CHANNELS.reloadBlocks),
  subscribe: (listener: (event: RuntimeEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: RuntimeEvent) => listener(payload);
    ipcRenderer.on(IPC_CHANNELS.runtimeEvent, wrapped);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.runtimeEvent, wrapped);
    };
  }
};

contextBridge.exposeInMainWorld("orchestrator", api);
