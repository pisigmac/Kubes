"use client";

import { useMemo, useState } from "react";
import {
  parseCsv,
  computeColumnMetrics,
  sortRows,
  filterRows,
  generateBarChartData,
} from "@/lib/computer/csv_grid";

export interface CsvGridStudioProps {
  csvContent: string;
  fileName?: string;
  className?: string;
}

export function CsvGridStudio({
  csvContent,
  fileName = "data.csv",
  className = "",
}: CsvGridStudioProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [viewMode, setViewMode] = useState<"table" | "chart">("table");

  // Parse CSV
  const { headers, rows } = useMemo(() => parseCsv(csvContent), [csvContent]);

  // Compute column statistics
  const metrics = useMemo(() => computeColumnMetrics(headers, rows), [headers, rows]);
  const numericColIndices = useMemo(
    () => Object.keys(metrics).map(Number),
    [metrics],
  );

  // Default chart selection
  const [chartLabelCol, setChartLabelCol] = useState<number>(0);
  const [chartValueCol, setChartValueCol] = useState<number>(
    numericColIndices[0] ?? (headers.length > 1 ? 1 : 0),
  );

  // Filter & Sort
  const processedRows = useMemo(() => {
    let result = filterRows(rows, searchQuery);
    if (sortCol !== null && sortCol >= 0 && sortCol < headers.length) {
      result = sortRows(result, sortCol, sortDir);
    }
    return result;
  }, [rows, searchQuery, sortCol, sortDir, headers.length]);

  // Chart data
  const chartData = useMemo(() => {
    return generateBarChartData(headers, processedRows, chartLabelCol, chartValueCol);
  }, [headers, processedRows, chartLabelCol, chartValueCol]);

  // Sorting header click handler
  const handleSort = (colIdx: number) => {
    if (sortCol === colIdx) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        setSortCol(null);
        setSortDir("asc");
      }
    } else {
      setSortCol(colIdx);
      setSortDir("asc");
    }
  };

  // Download raw or filtered CSV
  const handleDownload = () => {
    const outputRows = [headers, ...processedRows];
    const csvString = outputRows
      .map((row) =>
        row
          .map((cell) => {
            if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
              return `"${cell.replace(/"/g, '""')}"`;
            }
            return cell;
          })
          .join(","),
      )
      .join("\n");

    const blob = new Blob([csvString], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.endsWith(".csv") ? fileName : `${fileName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (headers.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-white/10 bg-black/30 p-6 text-xs font-mono text-white/50">
        Empty or unparseable CSV file.
      </div>
    );
  }

  return (
    <div className={`flex flex-col space-y-3 ${className}`}>
      {/* Studio Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#121316] p-2.5">
        <div className="flex items-center gap-2">
          {/* Table vs Chart Switch */}
          <div className="flex rounded-lg border border-white/10 bg-black/40 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                viewMode === "table"
                  ? "bg-white/15 text-white shadow-xs"
                  : "text-white/50 hover:text-white"
              }`}
            >
              📊 Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode("chart")}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                viewMode === "chart"
                  ? "bg-white/15 text-white shadow-xs"
                  : "text-white/50 hover:text-white"
              }`}
            >
              📈 Chart
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Filter data..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-44 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 font-mono text-xs text-white placeholder-white/30 outline-none focus:border-[#e7ff3a]"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-white/50">
          <span>
            {processedRows.length} / {rows.length} rows
          </span>
          <div className="h-3 w-px bg-white/10" />
          <button
            type="button"
            onClick={handleDownload}
            title="Download CSV"
            className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-white/70 hover:bg-white/10 hover:text-white transition"
          >
            <span>⬇️</span>
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Main View Area */}
      {viewMode === "table" ? (
        /* Interactive Data Grid Table */
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40">
          <table className="w-full border-collapse text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.04] text-white/80">
                {headers.map((header, idx) => {
                  const isSorted = sortCol === idx;
                  const isNum = metrics[idx]?.isNumeric;

                  return (
                    <th
                      key={idx}
                      onClick={() => handleSort(idx)}
                      className="cursor-pointer select-none px-3.5 py-2.5 font-semibold transition hover:bg-white/[0.06] hover:text-white"
                      title="Click to sort column"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>{header}</span>
                        <span className="text-[10px] text-white/40">
                          {isSorted ? (
                            sortDir === "asc" ? (
                              <span className="text-[#e7ff3a]">▲</span>
                            ) : (
                              <span className="text-[#e7ff3a]">▼</span>
                            )
                          ) : (
                            "↕"
                          )}
                        </span>
                        {isNum ? (
                          <span className="ml-auto text-[9px] text-[#e7ff3a]/70 font-normal">
                            #
                          </span>
                        ) : null}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {processedRows.length > 0 ? (
                processedRows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-white/[0.03] transition-colors">
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} className="px-3.5 py-2 text-white/70">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={headers.length}
                    className="p-6 text-center text-white/40 font-mono text-xs"
                  >
                    No matching rows found.
                  </td>
                </tr>
              )}
            </tbody>
            {/* Totals & Averages Footer */}
            {numericColIndices.length > 0 ? (
              <tfoot>
                <tr className="border-t border-white/15 bg-white/[0.06] font-semibold text-white">
                  {headers.map((_, colIdx) => {
                    const m = metrics[colIdx];
                    if (m?.isNumeric) {
                      return (
                        <td key={colIdx} className="px-3.5 py-2 text-[#e7ff3a]">
                          <div className="flex flex-col">
                            <span>
                              Σ {m.sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </span>
                            <span className="text-[10px] text-white/40 font-normal">
                              Avg: {m.avg.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                            </span>
                          </div>
                        </td>
                      );
                    }
                    return (
                      <td key={colIdx} className="px-3.5 py-2 text-white/40 text-[11px]">
                        {colIdx === 0 ? "Totals / Averages" : ""}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      ) : (
        /* Chart Visualization Studio */
        <div className="flex flex-col space-y-4 rounded-xl border border-white/10 bg-black/40 p-4">
          {numericColIndices.length === 0 ? (
            <div className="flex h-36 items-center justify-center text-xs font-mono text-white/50">
              No numerical columns found in this dataset to generate charts.
            </div>
          ) : (
            <>
              {/* Chart Series Selector */}
              <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-white/60">Category:</span>
                  <select
                    value={chartLabelCol}
                    onChange={(e) => setChartLabelCol(Number(e.target.value))}
                    className="rounded-lg border border-white/10 bg-[#181a20] px-2.5 py-1 text-white outline-none focus:border-[#e7ff3a]"
                  >
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-white/60">Value:</span>
                  <select
                    value={chartValueCol}
                    onChange={(e) => setChartValueCol(Number(e.target.value))}
                    className="rounded-lg border border-white/10 bg-[#181a20] px-2.5 py-1 text-white outline-none focus:border-[#e7ff3a]"
                  >
                    {numericColIndices.map((idx) => (
                      <option key={idx} value={idx}>
                        {headers[idx]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Native SVG Bar Distribution Chart */}
              {chartData.length > 0 ? (
                <div className="space-y-2.5 pt-2">
                  {chartData.map((d, idx) => (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-white/80 truncate max-w-xs">{d.label}</span>
                        <div className="flex items-center gap-2 text-white/50">
                          <span className="font-semibold text-[#e7ff3a]">
                            {d.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-[10px] text-white/40">({d.percentage}%)</span>
                        </div>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#e7ff3a] to-emerald-400 transition-all duration-500"
                          style={{ width: `${Math.max(d.percentage, 3)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-32 items-center justify-center text-xs font-mono text-white/40">
                  No data to plot for the selected columns.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
