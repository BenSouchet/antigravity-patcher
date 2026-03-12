export type BlockMode = "check" | "apply" | "revert";

export type ParameterType = "boolean" | "number" | "text" | "select" | "path";

export interface BlockParameterOption {
  label: string;
  value: string;
}

export interface BlockParameterDefinition {
  key: string;
  label: string;
  description?: string;
  type: ParameterType;
  defaultValue?: boolean | number | string;
  min?: number;
  max?: number;
  step?: number;
  options?: BlockParameterOption[];
  placeholder?: string;
}

export type BlockExecutionStatus =
  | "idle"
  | "checking"
  | "applied"
  | "skipped"
  | "reverted"
  | "failed";

export interface BlockRunResult {
  status: BlockExecutionStatus;
  message: string;
  touchedFiles?: string[];
  details?: string[];
}

export interface AppConfig {
  installPath: string;
  selectedBlocks: Record<string, boolean>;
  blockParameterValues: Record<string, Record<string, boolean | number | string>>;
  lastMode: BlockMode;
  lastRunAt: string;
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  blockId?: string;
}

export interface BlockSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  executionOrder: number;
  defaultEnabled: boolean;
  parameters: BlockParameterDefinition[];
  canRevert: boolean;
}

export interface BlockState extends BlockSummary {
  status: BlockExecutionStatus;
  lastMessage: string;
  touchedFiles: string[];
}

export interface RuntimeSnapshot {
  config: AppConfig;
  blocks: BlockState[];
  logs: LogEntry[];
  detectedInstallPath: string;
  portableRoot: string;
}

export interface RunRequest {
  mode: BlockMode;
  installPath: string;
  selectedBlockIds: string[];
  parameterValues: Record<string, Record<string, boolean | number | string>>;
}

export interface RunFinishedEvent {
  kind: "run-finished";
  success: boolean;
  mode: BlockMode;
}

export interface LogEvent {
  kind: "log";
  entry: LogEntry;
}

export interface BlockStatusEvent {
  kind: "block-status";
  blockId: string;
  status: BlockExecutionStatus;
  message: string;
  touchedFiles?: string[];
}

export type RuntimeEvent = RunFinishedEvent | LogEvent | BlockStatusEvent;

export interface BlockExecutionContext {
  installPath: string;
  portableRoot: string;
  mode: BlockMode;
  parameters: Record<string, boolean | number | string>;
  logger: {
    info(message: string, blockId?: string): void;
    warn(message: string, blockId?: string): void;
    error(message: string, blockId?: string): void;
  };
  backups: {
    backupFile(filePath: string): void;
    restoreFile(filePath: string): boolean;
    listBackups(): string[];
  };
}

export interface BlockDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  executionOrder: number;
  defaultEnabled: boolean;
  parameters: BlockParameterDefinition[];
  check(context: BlockExecutionContext): Promise<BlockRunResult>;
  apply(context: BlockExecutionContext): Promise<BlockRunResult>;
  revert?(context: BlockExecutionContext): Promise<BlockRunResult>;
}

export interface OrchestratorBridge {
  getSnapshot(): Promise<RuntimeSnapshot>;
  saveConfig(config: AppConfig): Promise<RuntimeSnapshot>;
  runBlocks(request: RunRequest): Promise<RuntimeSnapshot>;
  detectInstallPath(): Promise<string>;
  launchAntigravity(installPath: string): Promise<void>;
  openPortableRoot(): Promise<void>;
  reloadBlocks(): Promise<RuntimeSnapshot>;
  subscribe(listener: (event: RuntimeEvent) => void): () => void;
}
