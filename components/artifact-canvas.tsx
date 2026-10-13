"use client";

import { useMemo, useState } from "react";
import { CodeBlock } from "@/components/code-block";
import { MarkdownView } from "@/components/markdown-view";
import { CsvGridStudio } from "@/components/studios/csv-grid-studio";
import { MermaidStudio } from "@/components/studios/mermaid-studio";
import { PreviewSandbox } from "@/components/studios/preview-sandbox";
import { isMermaidDiagram } from "@/lib/computer/diagram";

export interface ArtifactFile {
  name: string;
  path: string;
  content: string;
  language?: string;
}

export function ArtifactCanvas({
  artifact,
  onClose,
}: {
  artifact: ArtifactFile | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"preview" | "source">("preview");
  const [copied, setCopied] = useState(false);

  const isMermaid = useMemo(() => {
    if (!artifact) return false;
    return isMermaidDiagram(artifact.name, artifact.content) || artifact.language === "mermaid";
  }, [artifact]);

  const isMarkdown = useMemo(() => {
    if (!artifact) return false;
    return (
      artifact.name.endsWith(".md") ||
      artifact.name.endsWith(".markdown") ||
      artifact.language === "markdown"
    );
  }, [artifact]);

  const isCsv = useMemo(() => {
    if (!artifact) return false;
    return artifact.name.endsWith(".csv") || artifact.language === "csv";
  }, [artifact]);

  const isHtml = useMemo(() => {
    if (!artifact) return false;
    return artifact.name.endsWith(".html") || artifact.language === "html";
  }, [artifact]);

  if (!artifact) return null;

  async function handleCopy() {
    if (!artifact) return;
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  }

  function handleDownload() {
    if (!artifact) return;
    const blob = new Blob([artifact.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = artifact.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const hasPreview = isMarkdown || isCsv || isHtml || isMermaid;

  return (
    <aside
      role="region"
      aria-label="Artifact viewer"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      className="flex h-full w-full min-w-0 flex-col overflow-hidden border-white/10 bg-[#0e0e11] lg:w-[520px] lg:max-w-[520px] lg:border-l"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5 bg-[#0a0a0c]">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-[#e7ff3a]" />
            <p className="truncate text-sm font-medium text-white">{artifact.name}</p>
            {isCsv ? (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                CSV Studio
              </span>
            ) : isMermaid ? (
              <span className="rounded-full bg-[#e7ff3a]/20 px-2 py-0.5 font-mono text-[10px] text-[#e7ff3a]">
                Mermaid Studio
              </span>
            ) : isHtml ? (
              <span className="rounded-full bg-purple-500/20 px-2 py-0.5 font-mono text-[10px] text-purple-300">
                Preview Sandbox
              </span>
            ) : isMarkdown ? (
              <span className="rounded-full bg-blue-500/20 px-2 py-0.5 font-mono text-[10px] text-blue-300">
                Markdown
              </span>
            ) : null}
          </div>
          <p className="truncate font-mono text-[11px] text-white/40">{artifact.path}</p>
        </div>

        <div className="flex items-center gap-2">
          {hasPreview ? (
            <div className="flex rounded-lg bg-white/5 p-0.5">
              <button
                type="button"
                onClick={() => setTab("preview")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  tab === "preview"
                    ? "bg-white/15 text-white shadow-xs"
                    : "text-white/50 hover:text-white"
                }`}
              >
                Preview
              </button>
              <button
                type="button"
                onClick={() => setTab("source")}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  tab === "source"
                    ? "bg-white/15 text-white shadow-xs"
                    : "text-white/50 hover:text-white"
                }`}
              >
                Source
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void handleCopy()}
            className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition"
            title="Copy content"
            aria-label="Copy content"
          >
            {copied ? (
              <svg className="h-4 w-4 text-[#e7ff3a]" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2"
                />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition"
            title="Download file"
            aria-label="Download file"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white transition"
            aria-label="Close artifact viewer"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* CSV Studio View */}
        {isCsv && tab === "preview" ? (
          <CsvGridStudio csvContent={artifact.content} fileName={artifact.name} />
        ) : isMermaid && tab === "preview" ? (
          /* Interactive Mermaid Studio Preview */
          <div className="h-full min-h-[450px] rounded-xl border border-white/10 overflow-hidden">
            <MermaidStudio chart={artifact.content} fileName={artifact.name} />
          </div>
        ) : isHtml && tab === "preview" ? (
          /* HTML Live Preview Sandbox */
          <div className="h-full min-h-[450px] rounded-xl border border-white/10 overflow-hidden">
            <PreviewSandbox content={artifact.content} fileName={artifact.name} />
          </div>
        ) : isMarkdown && tab === "preview" ? (
          /* Markdown Preview */
          <div className="rounded-xl border border-white/5 bg-black/30 p-5">
            <MarkdownView content={artifact.content} />
          </div>
        ) : (
          /* Source Code Viewer */
          <CodeBlock
            language={
              artifact.language ||
              (artifact.name.endsWith(".py")
                ? "python"
                : artifact.name.endsWith(".json")
                  ? "json"
                  : artifact.name.endsWith(".csv")
                    ? "csv"
                    : artifact.name.endsWith(".ts") || artifact.name.endsWith(".tsx")
                      ? "typescript"
                      : artifact.name.endsWith(".js")
                        ? "javascript"
                        : "text")
            }
            value={artifact.content}
          />
        )}
      </div>
    </aside>
  );
}
