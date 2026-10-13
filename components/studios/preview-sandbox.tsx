"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildSandboxedHtml,
  parseConsoleMessage,
  ConsoleLogEntry,
} from "@/lib/computer/sandbox_preview";

export interface PreviewSandboxProps {
  content: string;
  fileName?: string;
  className?: string;
}

type ViewportMode = "responsive" | "desktop" | "tablet" | "mobile";

export function PreviewSandbox({
  content,
  fileName = "preview.html",
  className = "",
}: PreviewSandboxProps) {
  const [viewport, setViewport] = useState<ViewportMode>("responsive");
  const [reloadKey, setReloadKey] = useState<number>(0);
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState<boolean>(false);

  // Wrap content with console logger harness
  const sandboxedHtml = useMemo(() => buildSandboxedHtml(content), [content]);

  const [lastContent, setLastContent] = useState(content);
  if (content !== lastContent) {
    setLastContent(content);
    setLogs([]);
  }

  const handleReload = () => {
    setLogs([]);
    setReloadKey((k) => k + 1);
  };

  // Intercept window postMessage from sandbox iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const entry = parseConsoleMessage(event.data);
      if (entry) {
        setLogs((prev) => [...prev, entry]);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  const errorCount = useMemo(
    () => logs.filter((l) => l.level === "error").length,
    [logs],
  );

  const getViewportClass = () => {
    switch (viewport) {
      case "desktop":
        return "max-w-[1024px] shadow-2xl border-x border-white/10";
      case "tablet":
        return "max-w-[768px] shadow-2xl border-x border-white/10";
      case "mobile":
        return "max-w-[375px] shadow-2xl border-x border-white/10";
      case "responsive":
      default:
        return "w-full";
    }
  };

  return (
    <div className={`flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0c0c0e] ${className}`}>
      {/* Studio Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#14151a] px-3.5 py-2">
        {/* Viewport Selectors */}
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-lg border border-white/10 bg-black/40 p-0.5">
            <button
              type="button"
              onClick={() => setViewport("responsive")}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                viewport === "responsive"
                  ? "bg-white/15 text-white shadow-xs"
                  : "text-white/50 hover:text-white"
              }`}
            >
              100%
            </button>
            <button
              type="button"
              onClick={() => setViewport("desktop")}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                viewport === "desktop"
                  ? "bg-white/15 text-white shadow-xs"
                  : "text-white/50 hover:text-white"
              }`}
            >
              💻 Desktop
            </button>
            <button
              type="button"
              onClick={() => setViewport("tablet")}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                viewport === "tablet"
                  ? "bg-white/15 text-white shadow-xs"
                  : "text-white/50 hover:text-white"
              }`}
            >
              📱 Tablet
            </button>
            <button
              type="button"
              onClick={() => setViewport("mobile")}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                viewport === "mobile"
                  ? "bg-white/15 text-white shadow-xs"
                  : "text-white/50 hover:text-white"
              }`}
            >
              📱 Mobile
            </button>
          </div>

          {/* Refresh Action */}
          <button
            type="button"
            onClick={handleReload}
            title="Reload sandbox preview"
            className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10 hover:text-white transition"
          >
            <span>🔄</span>
            <span>Reload</span>
          </button>
        </div>

        {/* Console Inspector Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsConsoleOpen(!isConsoleOpen)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-mono transition ${
              isConsoleOpen
                ? "border-[#e7ff3a]/40 bg-[#e7ff3a]/10 text-[#e7ff3a]"
                : "border-white/10 text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span>Console</span>
            {logs.length > 0 ? (
              <span className="rounded-full bg-white/15 px-1.5 py-0.2 text-[9px]">
                {logs.length}
              </span>
            ) : null}
            {errorCount > 0 ? (
              <span className="rounded-full bg-rose-500/20 px-1.5 py-0.2 text-[9px] text-rose-300 font-semibold">
                {errorCount} err
              </span>
            ) : null}
          </button>
        </div>
      </div>

      {/* Main Sandbox Frame Container */}
      <div className="relative flex flex-1 items-center justify-center overflow-auto bg-[#181a20]/40 p-2">
        <div className={`h-full min-h-[420px] transition-all duration-200 bg-white ${getViewportClass()}`}>
          <iframe
            key={reloadKey}
            srcDoc={sandboxedHtml}
            title={fileName}
            sandbox="allow-scripts"
            className="h-full w-full min-h-[420px] border-0"
          />
        </div>
      </div>

      {/* Interactive Collapsible Console Drawer */}
      {isConsoleOpen ? (
        <div className="flex max-h-52 flex-col border-t border-white/10 bg-[#0d0e12]">
          <div className="flex items-center justify-between border-b border-white/5 bg-black/40 px-3 py-1.5 text-[11px] font-mono text-white/50">
            <span className="flex items-center gap-1.5">
              <span>🖥️ Console Inspector</span>
              <span>({logs.length} messages)</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLogs([])}
                className="hover:text-white transition"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setIsConsoleOpen(false)}
                className="hover:text-white transition"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] space-y-1">
            {logs.length === 0 ? (
              <div className="py-3 text-center text-white/30">
                No console messages recorded.
              </div>
            ) : (
              logs.map((log) => {
                const timeStr = new Date(log.timestamp).toLocaleTimeString();
                const levelColor =
                  log.level === "error"
                    ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
                    : log.level === "warn"
                      ? "text-amber-300 bg-amber-500/10 border-amber-500/20"
                      : log.level === "info"
                        ? "text-sky-300 bg-sky-500/10 border-sky-500/20"
                        : "text-white/80 bg-white/5 border-white/10";

                return (
                  <div
                    key={log.id}
                    className={`flex items-start gap-2 rounded border px-2 py-1 ${levelColor}`}
                  >
                    <span className="text-[10px] text-white/30 shrink-0">{timeStr}</span>
                    <span className="uppercase text-[9px] font-bold shrink-0">{log.level}</span>
                    <span className="flex-1 whitespace-pre-wrap break-all">{log.message}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
