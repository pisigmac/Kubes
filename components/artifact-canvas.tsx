"use client";

import { useMemo, useState } from "react";
import { CodeBlock } from "@/components/code-block";
import { MarkdownView } from "@/components/markdown-view";

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
  const [searchFilter, setSearchFilter] = useState("");

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

  const csvData = useMemo(() => {
    if (!isCsv || !artifact) return null;
    const lines = artifact.content.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return null;

    const headers = lines[0].split(",").map((h) => h.trim().replace(/^["']|["']$/g, ""));
    const rows = lines.slice(1).map((line) => {
      // Basic CSV splitter handling quotes
      const values: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === "," && !inQuotes) {
          values.push(current.trim().replace(/^["']|["']$/g, ""));
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/^["']|["']$/g, ""));
      return values;
    });

    // Compute numerical column totals (e.g. for financial ledgers)
    const columnSums: Record<number, number> = {};
    for (let colIdx = 0; colIdx < headers.length; colIdx++) {
      let isNumericCol = true;
      let sum = 0;
      for (const row of rows) {
        const rawVal = row[colIdx]?.replace(/[^0-9.-]+/g, "") || "";
        const num = parseFloat(rawVal);
        if (isNaN(num)) {
          isNumericCol = false;
          break;
        }
        sum += num;
      }
      if (isNumericCol && rows.length > 0) {
        columnSums[colIdx] = sum;
      }
    }

    return { headers, rows, columnSums };
  }, [isCsv, artifact]);

  const filteredCsvRows = useMemo(() => {
    if (!csvData) return [];
    if (!searchFilter.trim()) return csvData.rows;
    const lower = searchFilter.toLowerCase();
    return csvData.rows.filter((row) =>
      row.some((cell) => cell.toLowerCase().includes(lower)),
    );
  }, [csvData, searchFilter]);

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

  const hasPreview = isMarkdown || isCsv || isHtml;

  return (
    <aside className="flex h-full w-full min-w-0 flex-col overflow-hidden border-white/10 bg-[#0e0e11] lg:w-[520px] lg:max-w-[520px] lg:border-l">
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
            aria-label="Close canvas"
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
        {isCsv && tab === "preview" && csvData ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <input
                type="text"
                placeholder="Filter table rows..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-[#e7ff3a]"
              />
              <span className="text-xs text-white/40 font-mono">
                {filteredCsvRows.length} / {csvData.rows.length} rows
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40">
              <table className="w-full border-collapse text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.04] text-white/80">
                    {csvData.headers.map((header, idx) => (
                      <th key={idx} className="px-3 py-2.5 font-semibold">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredCsvRows.map((row, rowIdx) => (
                    <tr key={rowIdx} className="hover:bg-white/[0.03] transition-colors">
                      {row.map((cell, cellIdx) => (
                        <td key={cellIdx} className="px-3 py-2 text-white/70">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {Object.keys(csvData.columnSums).length > 0 ? (
                  <tfoot>
                    <tr className="border-t border-white/15 bg-white/[0.06] font-semibold text-white">
                      {csvData.headers.map((_, colIdx) => (
                        <td key={colIdx} className="px-3 py-2 text-[#e7ff3a]">
                          {csvData.columnSums[colIdx] !== undefined
                            ? `Σ ${csvData.columnSums[colIdx].toLocaleString(undefined, {
                                maximumFractionDigits: 2,
                              })}`
                            : colIdx === 0
                              ? "Total"
                              : ""}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>
        ) : isHtml && tab === "preview" ? (
          /* HTML Sandbox Preview */
          <div className="h-full min-h-[400px] rounded-xl border border-white/10 bg-white overflow-hidden">
            <iframe
              srcDoc={artifact.content}
              title="HTML Artifact Sandbox"
              sandbox="allow-scripts"
              className="h-full w-full min-h-[400px] border-0"
            />
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
