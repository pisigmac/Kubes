import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCsv,
  computeColumnMetrics,
  sortRows,
  filterRows,
  generateBarChartData,
} from "./csv_grid.ts";

test("CSV Grid: parseCsv handles standard, quoted, and CRLF lines", () => {
  const standard = "name,role,salary\nAlice,Engineer,120000\nBob,Designer,95000";
  const parsed = parseCsv(standard);
  assert.deepEqual(parsed.headers, ["name", "role", "salary"]);
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.rows[0], ["Alice", "Engineer", "120000"]);
  assert.deepEqual(parsed.rows[1], ["Bob", "Designer", "95000"]);

  // Quoted commas and escaped quotes
  const complex = 'title,notes,amount\r\n"Invoice, Acme","He said ""hello""",500.50\r\nSimple,"Nothing",100';
  const parsedComplex = parseCsv(complex);
  assert.deepEqual(parsedComplex.headers, ["title", "notes", "amount"]);
  assert.equal(parsedComplex.rows.length, 2);
  assert.equal(parsedComplex.rows[0][0], "Invoice, Acme");
  assert.equal(parsedComplex.rows[0][1], 'He said "hello"');
  assert.equal(parsedComplex.rows[0][2], "500.50");
});

test("CSV Grid: computeColumnMetrics calculates sum, avg, min, and max for numeric cols", () => {
  const headers = ["Category", "Spent", "Notes"];
  const rows = [
    ["Housing", "1500", "Rent"],
    ["Food", "450.50", "Groceries"],
    ["Travel", "$200", "Transit"],
  ];

  const metrics = computeColumnMetrics(headers, rows);
  assert.equal(metrics[0], undefined); // Category is non-numeric
  assert.equal(metrics[2], undefined); // Notes is non-numeric

  const spentMetric = metrics[1];
  assert.ok(spentMetric);
  assert.equal(spentMetric.isNumeric, true);
  assert.equal(spentMetric.count, 3);
  assert.equal(spentMetric.sum, 2150.5);
  assert.equal(spentMetric.min, 200);
  assert.equal(spentMetric.max, 1500);
  assert.equal(Math.round(spentMetric.avg), 717);
});

test("CSV Grid: sortRows correctly sorts numeric and alphabetical columns", () => {
  const rows = [
    ["Charlie", "30"],
    ["Alice", "100"],
    ["Bob", "5"],
  ];

  // Alphabetical sort by name
  const byNameAsc = sortRows(rows, 0, "asc");
  assert.equal(byNameAsc[0][0], "Alice");
  assert.equal(byNameAsc[2][0], "Charlie");

  const byNameDesc = sortRows(rows, 0, "desc");
  assert.equal(byNameDesc[0][0], "Charlie");
  assert.equal(byNameDesc[2][0], "Alice");

  // Numeric sort by value
  const byNumAsc = sortRows(rows, 1, "asc");
  assert.equal(byNumAsc[0][1], "5");
  assert.equal(byNumAsc[1][1], "30");
  assert.equal(byNumAsc[2][1], "100");

  const byNumDesc = sortRows(rows, 1, "desc");
  assert.equal(byNumDesc[0][1], "100");
  assert.equal(byNumDesc[2][1], "5");
});

test("CSV Grid: filterRows matches substring across columns", () => {
  const rows = [
    ["Engineering", "Alice", "Senior"],
    ["Design", "Bob", "Lead"],
    ["Marketing", "Charlie", "Specialist"],
  ];

  assert.equal(filterRows(rows, "").length, 3);
  assert.equal(filterRows(rows, "Bob").length, 1);
  assert.equal(filterRows(rows, "eng").length, 1);
  assert.equal(filterRows(rows, "nonexistent").length, 0);
});

test("CSV Grid: generateBarChartData groups and calculates relative percentages", () => {
  const headers = ["Category", "Amount"];
  const rows = [
    ["Food", "300"],
    ["Rent", "700"],
    ["Food", "200"], // Combined Food = 500, Rent = 700 (Total = 1200)
  ];

  const chart = generateBarChartData(headers, rows, 0, 1);
  assert.equal(chart.length, 2);
  assert.equal(chart[0].label, "Rent");
  assert.equal(chart[0].value, 700);
  assert.equal(chart[0].percentage, 58); // 700 / 1200 ~ 58%

  assert.equal(chart[1].label, "Food");
  assert.equal(chart[1].value, 500);
  assert.equal(chart[1].percentage, 42); // 500 / 1200 ~ 42%
});
