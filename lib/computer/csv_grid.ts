export interface CsvTableData {
  headers: string[];
  rows: string[][];
}

export interface ColumnMetric {
  isNumeric: boolean;
  sum: number;
  min: number;
  max: number;
  avg: number;
  count: number;
}

export interface ChartDatum {
  label: string;
  value: number;
  percentage: number;
}

/**
 * Parses raw CSV content with support for quotes, commas inside quotes,
 * escaped quotes (""), and CRLF / LF line breaks.
 */
export function parseCsv(raw: string): CsvTableData {
  const text = raw.trim();
  if (!text) {
    return { headers: [], rows: [] };
  }

  const lines: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          // Escaped quote
          currentField += '"';
          i += 2;
          continue;
        } else {
          // End quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    }

    if (char === '"') {
      inQuotes = true;
      i++;
    } else if (char === ",") {
      currentRow.push(currentField.trim());
      currentField = "";
      i++;
    } else if (char === "\r") {
      if (i + 1 < text.length && text[i + 1] === "\n") {
        i++;
      }
      currentRow.push(currentField.trim());
      currentField = "";
      if (currentRow.some((field) => field.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      i++;
    } else if (char === "\n") {
      currentRow.push(currentField.trim());
      currentField = "";
      if (currentRow.some((field) => field.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      i++;
    } else {
      currentField += char;
      i++;
    }
  }

  // Push final field/row if any
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((field) => field.length > 0)) {
      lines.push(currentRow);
    }
  }

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0].map((h) => h.replace(/^["']|["']$/g, ""));
  const rawRows = lines.slice(1);

  // Normalize all rows to headers length
  const rows = rawRows.map((row) => {
    const normalized = [...row];
    while (normalized.length < headers.length) {
      normalized.push("");
    }
    return normalized.slice(0, headers.length);
  });

  return { headers, rows };
}

/**
 * Computes numeric metrics (sum, min, max, avg) for columns that contain numeric data.
 */
export function computeColumnMetrics(
  headers: string[],
  rows: string[][],
): Record<number, ColumnMetric> {
  const metrics: Record<number, ColumnMetric> = {};

  for (let colIdx = 0; colIdx < headers.length; colIdx++) {
    if (rows.length === 0) continue;

    let isNumeric = true;
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    let validCount = 0;

    for (const row of rows) {
      const cell = (row[colIdx] ?? "").trim();
      if (!cell) continue; // Allow blank cells

      // Remove currency symbols, commas, spaces
      const sanitized = cell.replace(/[$€£,]/g, "");
      const num = Number(sanitized);

      if (isNaN(num)) {
        isNumeric = false;
        break;
      }

      sum += num;
      if (num < min) min = num;
      if (num > max) max = num;
      validCount++;
    }

    if (isNumeric && validCount > 0) {
      metrics[colIdx] = {
        isNumeric: true,
        sum,
        min: min === Infinity ? 0 : min,
        max: max === -Infinity ? 0 : max,
        avg: sum / validCount,
        count: validCount,
      };
    }
  }

  return metrics;
}

/**
 * Sorts table rows by a specific column in ascending or descending order.
 */
export function sortRows(
  rows: string[][],
  colIdx: number,
  direction: "asc" | "desc",
): string[][] {
  const sorted = [...rows];
  if (rows.length === 0 || colIdx < 0) return sorted;

  // Determine if column is predominantly numeric
  const isNumeric = rows.every((row) => {
    const cell = (row[colIdx] ?? "").replace(/[$€£,]/g, "").trim();
    return cell === "" || !isNaN(Number(cell));
  });

  sorted.sort((a, b) => {
    const valA = (a[colIdx] ?? "").trim();
    const valB = (b[colIdx] ?? "").trim();

    if (isNumeric) {
      const numA = Number(valA.replace(/[$€£,]/g, "")) || 0;
      const numB = Number(valB.replace(/[$€£,]/g, "")) || 0;
      return direction === "asc" ? numA - numB : numB - numA;
    }

    return direction === "asc"
      ? valA.localeCompare(valB, undefined, { numeric: true, sensitivity: "base" })
      : valB.localeCompare(valA, undefined, { numeric: true, sensitivity: "base" });
  });

  return sorted;
}

/**
 * Filters rows based on a search query matching any cell.
 */
export function filterRows(rows: string[][], query: string): string[][] {
  const term = query.trim().toLowerCase();
  if (!term) return rows;

  return rows.filter((row) =>
    row.some((cell) => cell.toLowerCase().includes(term)),
  );
}

/**
 * Aggregates chart data for a chosen category label column and numeric value column.
 */
export function generateBarChartData(
  headers: string[],
  rows: string[][],
  labelColIdx: number,
  valueColIdx: number,
): ChartDatum[] {
  if (labelColIdx < 0 || valueColIdx < 0 || rows.length === 0) {
    return [];
  }

  const map = new Map<string, number>();
  let totalSum = 0;

  for (const row of rows) {
    const label = (row[labelColIdx] ?? "").trim() || "Uncategorized";
    const rawVal = (row[valueColIdx] ?? "").replace(/[$€£,]/g, "").trim();
    const num = Number(rawVal);
    if (!isNaN(num) && num > 0) {
      const curr = map.get(label) ?? 0;
      map.set(label, curr + num);
      totalSum += num;
    }
  }

  if (map.size === 0 || totalSum === 0) {
    return [];
  }

  const entries = Array.from(map.entries())
    .map(([label, value]) => ({
      label,
      value,
      percentage: Math.round((value / totalSum) * 100),
    }))
    .sort((a, b) => b.value - a.value);

  // Return top 15 categories to keep visual charts clean
  return entries.slice(0, 15);
}
