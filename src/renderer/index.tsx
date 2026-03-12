import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppConfig, BlockMode, BlockParameterDefinition, BlockState, RuntimeEvent, RuntimeSnapshot } from "../core/types";

declare global {
  interface Window {
    orchestrator: import("../core/types").OrchestratorBridge;
  }
}

function formatTimestamp(value: string): string {
  return value ? new Date(value).toLocaleTimeString() : "";
}

function getLogTone(entry: RuntimeSnapshot["logs"][number]): string {
  if (entry.level === "error") {
    return "error";
  }

  if (entry.level === "debug") {
    return "debug";
  }

  if (entry.blockId === "runner" && entry.message.includes("run finished successfully")) {
    return "success";
  }

  if (entry.message.startsWith("START ")) {
    return "start";
  }

  if (entry.message.startsWith("END ")) {
    return "end";
  }

  if (entry.level === "warn") {
    return "warn";
  }

  return "info";
}

function groupBlocks(blocks: BlockState[]): Array<[string, BlockState[]]> {
  const grouped = new Map<string, BlockState[]>();
  for (const block of blocks) {
    if (!grouped.has(block.category)) {
      grouped.set(block.category, []);
    }
    grouped.get(block.category)!.push(block);
  }
  return [...grouped.entries()].map(([category, categoryBlocks]) => [
    category,
    categoryBlocks.sort((left, right) => left.executionOrder - right.executionOrder)
  ]);
}

function mergeLogs(currentLogs: RuntimeSnapshot["logs"], nextLogs: RuntimeSnapshot["logs"]): RuntimeSnapshot["logs"] {
  const merged = new Map<string, RuntimeSnapshot["logs"][number]>();
  for (const entry of currentLogs) {
    merged.set(entry.id, entry);
  }
  for (const entry of nextLogs) {
    merged.set(entry.id, entry);
  }
  return [...merged.values()].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
}

function App(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [failedBlockId, setFailedBlockId] = useState("");
  const [scrollTargetBlockId, setScrollTargetBlockId] = useState("");
  const [logHeight, setLogHeight] = useState(220);
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [resizingLog, setResizingLog] = useState(false);
  const logListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!resizingLog) {
      return;
    }

    function handleMouseMove(event: MouseEvent): void {
      const nextHeight = Math.min(420, Math.max(96, window.innerHeight - event.clientY - 16));
      setLogCollapsed(false);
      setLogHeight(nextHeight);
    }

    function stopResizing(): void {
      setResizingLog(false);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resizingLog]);

  const blocks = snapshot?.blocks ?? [];

  useEffect(() => {
    if (!scrollTargetBlockId) {
      return;
    }

    const target = document.querySelector<HTMLElement>(`[data-block-id="${scrollTargetBlockId}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setScrollTargetBlockId("");
  }, [blocks, scrollTargetBlockId]);

  useEffect(() => {
    if (logCollapsed) {
      return;
    }

    const logList = logListRef.current;
    if (!logList) {
      return;
    }

    logList.scrollTop = logList.scrollHeight;
  }, [snapshot?.logs, logCollapsed]);

  useEffect(() => {
    let unsubscribe = () => {};
    void window.orchestrator.getSnapshot().then((nextSnapshot) => {
      setSnapshot(nextSnapshot);
      setSelectedBlockId(nextSnapshot.blocks[0]?.id ?? "");
    });

    unsubscribe = window.orchestrator.subscribe((event: RuntimeEvent) => {
      setSnapshot((current) => {
        if (!current) {
          return current;
        }

        if (event.kind === "log") {
          if (current.logs.some((entry) => entry.id === event.entry.id)) {
            return current;
          }

          return {
            ...current,
            logs: [...current.logs, event.entry]
          };
        }

        if (event.kind === "block-status") {
          if (event.status === "failed") {
            setRunning(false);
            setFailedBlockId(event.blockId);
            setSelectedBlockId(event.blockId);
            setScrollTargetBlockId(event.blockId);
            setLogCollapsed(false);
          }

          return {
            ...current,
            blocks: current.blocks.map((block) =>
              block.id === event.blockId
                ? {
                    ...block,
                    status: event.status,
                    lastMessage: event.message,
                    touchedFiles: event.touchedFiles ?? block.touchedFiles
                  }
                : block
            )
          };
        }

        setRunning(false);
        return current;
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const config = snapshot?.config;
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) ?? blocks[0] ?? null;
  const groupedBlocks = useMemo(() => groupBlocks(blocks), [blocks]);

  useEffect(() => {
    if (!blocks.some((block) => block.id === selectedBlockId)) {
      setSelectedBlockId(blocks[0]?.id ?? "");
    }
  }, [blocks, selectedBlockId]);

  useEffect(() => {
    if (failedBlockId && !blocks.some((block) => block.id === failedBlockId && block.status === "failed")) {
      setFailedBlockId("");
    }
  }, [blocks, failedBlockId]);

  function updateConfig(nextConfig: AppConfig): void {
    setSnapshot((current) => (current ? { ...current, config: nextConfig } : current));
    void window.orchestrator.saveConfig(nextConfig).then(setSnapshot);
  }

  function toggleBlock(blockId: string, enabled: boolean): void {
    if (!snapshot) {
      return;
    }
    updateConfig({
      ...snapshot.config,
      selectedBlocks: {
        ...snapshot.config.selectedBlocks,
        [blockId]: enabled
      }
    });
  }

  function updateInstallPath(value: string): void {
    if (!snapshot) {
      return;
    }
    updateConfig({
      ...snapshot.config,
      installPath: value
    });
  }

  function updateMode(value: BlockMode): void {
    if (!snapshot) {
      return;
    }
    updateConfig({
      ...snapshot.config,
      lastMode: value
    });
  }

  function updateParameter(blockId: string, parameter: BlockParameterDefinition, value: boolean | number | string): void {
    if (!snapshot) {
      return;
    }
    updateConfig({
      ...snapshot.config,
      blockParameterValues: {
        ...snapshot.config.blockParameterValues,
        [blockId]: {
          ...snapshot.config.blockParameterValues[blockId],
          [parameter.key]: value
        }
      }
    });
  }

  async function runSelected(): Promise<void> {
    if (!snapshot) {
      return;
    }
    setFailedBlockId("");
    setRunning(true);
    setLogCollapsed(false);
    const nextSnapshot = await window.orchestrator.runBlocks({
      mode: snapshot.config.lastMode,
      installPath: snapshot.config.installPath,
      selectedBlockIds: blocks.filter((block) => snapshot.config.selectedBlocks[block.id] ?? block.defaultEnabled).map((block) => block.id),
      parameterValues: snapshot.config.blockParameterValues
    });
    setSnapshot((current) =>
      current
        ? {
            ...nextSnapshot,
            logs: mergeLogs(current.logs, nextSnapshot.logs)
          }
        : nextSnapshot
    );
    setRunning(false);
  }

  async function autoDetect(): Promise<void> {
    if (running) {
      return;
    }
    const installPath = await window.orchestrator.detectInstallPath();
    if (installPath) {
      updateInstallPath(installPath);
    }
  }

  async function reloadBlocks(): Promise<void> {
    if (running) {
      return;
    }
    const nextSnapshot = await window.orchestrator.reloadBlocks();
    setSnapshot(nextSnapshot);
  }

  if (!snapshot || !config) {
    return <div className="app-shell"><div className="empty-state">Loading Blocks orchestrator…</div></div>;
  }

  return (
    <div className="app-shell" style={{ gridTemplateRows: `auto minmax(0, 1fr) ${logCollapsed ? "54px" : `${logHeight}px`}` }}>
      <div className="topbar">
        <div className="brand-block">
          <div className="brand-mark">AP</div>
          <div>
            <div className="brand-kicker">Portable Blocks Orchestrator</div>
            <div className="brand-name">Antigravity Patcher</div>
          </div>
        </div>
        <div className="topbar-main">
          <div className="topbar-block path-block">
            <span className="topbar-label">Install Path</span>
            <input className="path-input" disabled={running} value={config.installPath} onChange={(event) => updateInstallPath(event.target.value)} />
          </div>
          <div className="topbar-controls">
            <button className="secondary-button" disabled={running} onClick={() => void autoDetect()}>Detect</button>
            <div className="topbar-divider" aria-hidden="true" />
            <div className="topbar-block mode-block">
              <span className="topbar-label">Mode</span>
              <select className="mode-select" disabled={running} value={config.lastMode} onChange={(event) => updateMode(event.target.value as BlockMode)}>
                <option value="check">Check</option>
                <option value="apply">Apply</option>
                <option value="revert">Revert</option>
              </select>
            </div>
            <button className="primary-button" disabled={running || !config.installPath} onClick={() => void runSelected()}>
              {running ? "Running…" : "Run Selected Blocks"}
            </button>
            <button className="ghost-button" disabled={running} onClick={() => void window.orchestrator.launchAntigravity(config.installPath)}>Launch Antigravity</button>
          </div>
        </div>
      </div>

      <div className={`content-shell ${running ? "busy" : ""}`}>
        <div className="blocks-pane">
          <div className="pane-header">
            <div>
              <div className="section-label">Blocks</div>
              <div className="pane-title">Execution Plan</div>
            </div>
            <div className="pane-actions">
              <button className="icon-button" disabled={running} onClick={() => void reloadBlocks()} aria-label="Refresh Blocks" title="Refresh Blocks">
                <svg className="refresh-icon" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M13.5 8A5.5 5.5 0 0 1 4.1 11.9" />
                  <path d="M2.5 8A5.5 5.5 0 0 1 11.9 4.1" />
                  <path d="M11.9 1.9v2.7H9.2" />
                  <path d="M4.1 14.1v-2.7h2.7" />
                </svg>
              </button>
              <button className="secondary-button" disabled={running} onClick={() => void window.orchestrator.openPortableRoot()}>Open Runtime Folder</button>
            </div>
          </div>
          {groupedBlocks.map(([category, categoryBlocks]) => (
            <section className="category-group" key={category}>
              <div className="category-heading">
                <div className="category-title">{category}</div>
                <div className="block-meta">{categoryBlocks.length} blocks</div>
              </div>
              <div className="blocks-list">
                {categoryBlocks.map((block) => {
                  const enabled = config.selectedBlocks[block.id] ?? block.defaultEnabled;
                  return (
                    <div
                      className={`block-card ${selectedBlockId === block.id ? "selected" : ""} ${failedBlockId === block.id || block.status === "failed" ? "failed" : ""}`}
                      data-block-id={block.id}
                      key={block.id}
                      onClick={() => setSelectedBlockId(block.id)}
                    >
                      <input
                        className="block-checkbox"
                        type="checkbox"
                        disabled={running}
                        checked={enabled}
                        onChange={(event) => toggleBlock(block.id, event.target.checked)}
                        onClick={(event) => event.stopPropagation()}
                      />
                      <div>
                        <div className="block-name-row">
                          <span className="block-name">{block.name}</span>
                          <span className="pill order-pill">#{block.executionOrder}</span>
                        </div>
                        <div className="block-meta">{block.id}</div>
                        <div className="block-description">{block.description}</div>
                      </div>
                      <div>
                        <span className={`pill status-${block.status}`}>{block.status}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="detail-pane">
          {!selectedBlock ? (
            <div className="empty-state">Select a Block to view its configuration.</div>
          ) : (
            <>
              <div className="pane-header">
                <div>
                  <div className="section-label">{selectedBlock.category}</div>
                  <div className="pane-title">{selectedBlock.name}</div>
                </div>
                <span className={`pill status-${selectedBlock.status}`}>{selectedBlock.status}</span>
              </div>

              <div className="detail-card">
                <div className="detail-card-title">Overview</div>
                <div className="field-help">{selectedBlock.description}</div>
                <div className="meta-list" style={{ marginTop: 12 }}>
                  <div className="meta-row"><span>Block ID</span><span>{selectedBlock.id}</span></div>
                  <div className="meta-row"><span>Execution Order</span><span>{selectedBlock.executionOrder}</span></div>
                  <div className="meta-row"><span>Supports Revert</span><span>{selectedBlock.canRevert ? "Yes" : "No"}</span></div>
                </div>
              </div>

              <div className="detail-card">
                <div className="detail-card-title">Parameters</div>
                <div className="field-grid" style={{ marginTop: 12 }}>
                  {selectedBlock.parameters.length === 0 ? (
                    <div className="empty-state">This Block has no configurable parameters.</div>
                  ) : (
                    selectedBlock.parameters.map((parameter) => {
                      const currentValue =
                        config.blockParameterValues[selectedBlock.id]?.[parameter.key] ??
                        parameter.defaultValue ??
                        (parameter.type === "boolean" ? false : "");

                      return (
                        <label key={parameter.key}>
                          <div className="field-label">{parameter.label}</div>
                          {parameter.type === "boolean" ? (
                            <input
                              type="checkbox"
                              disabled={running}
                              checked={Boolean(currentValue)}
                              onChange={(event) => updateParameter(selectedBlock.id, parameter, event.target.checked)}
                            />
                          ) : parameter.type === "select" ? (
                            <select className="select-input" disabled={running} value={String(currentValue)} onChange={(event) => updateParameter(selectedBlock.id, parameter, event.target.value)}>
                              {(parameter.options ?? []).map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          ) : parameter.type === "number" ? (
                            <input
                              className="number-input"
                              type="number"
                              disabled={running}
                              min={parameter.min}
                              max={parameter.max}
                              step={parameter.step ?? 1}
                              value={Number(currentValue)}
                              onChange={(event) => updateParameter(selectedBlock.id, parameter, Number(event.target.value))}
                            />
                          ) : (
                            <input
                              className="text-input"
                              type="text"
                              disabled={running}
                              placeholder={parameter.placeholder}
                              value={String(currentValue)}
                              onChange={(event) => updateParameter(selectedBlock.id, parameter, event.target.value)}
                            />
                          )}
                          {parameter.description ? <div className="field-help">{parameter.description}</div> : null}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="detail-card">
                <div className="detail-card-title">Last Result</div>
                <div className="field-help" style={{ marginTop: 10 }}>{selectedBlock.lastMessage || "No execution yet."}</div>
                <div className="meta-list" style={{ marginTop: 12 }}>
                  {selectedBlock.touchedFiles.length === 0 ? (
                    <div className="empty-state">No touched files recorded.</div>
                  ) : (
                    selectedBlock.touchedFiles.map((filePath) => (
                      <div className="meta-row" key={filePath}>
                        <span>File</span>
                        <span>{filePath}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        {running ? (
          <div className="content-overlay" aria-live="polite" aria-busy="true">
            <div className="spinner" />
            <div className="overlay-label">Running selected Blocks…</div>
          </div>
        ) : null}
      </div>

      <div className={`log-shell ${logCollapsed ? "collapsed" : ""}`}>
        <button className="log-resize-handle" onMouseDown={() => setResizingLog(true)} aria-label="Resize log panel" />
        <div className="pane-header log-header">
          <div>
            <div className="section-label">Status</div>
            <div className="pane-title">Execution Log</div>
          </div>
          <div className="log-header-actions">
            <div className="block-meta">{snapshot.logs.length} entries</div>
            <button
              className="log-toggle"
              onClick={() => setLogCollapsed((current) => !current)}
              aria-label={logCollapsed ? "Expand log panel" : "Minimize log panel"}
              title={logCollapsed ? "Expand" : "Minimize"}
            >
              <span className={`log-toggle-icon ${logCollapsed ? "collapsed" : ""}`} />
            </button>
          </div>
        </div>
        {!logCollapsed ? (
          <div className="log-list" ref={logListRef}>
            {snapshot.logs.length === 0 ? (
              <div className="empty-state">No runtime logs yet.</div>
            ) : (
              snapshot.logs.map((entry) => (
                <div className={`log-entry ${getLogTone(entry)}`} key={entry.id}>
                  <strong>{formatTimestamp(entry.timestamp)}</strong> {entry.blockId ? `[${entry.blockId}] ` : ""}{entry.message}
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
