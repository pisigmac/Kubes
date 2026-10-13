import test from "node:test";
import assert from "node:assert/strict";
import { cleanMermaidSource, isMermaidDiagram, toggleDiagramOrientation } from "./diagram.ts";

test("Diagram: cleanMermaidSource strips markdown code blocks", () => {
  const fenced = "```mermaid\nflowchart TD\n  A[Start] --> B[End]\n```";
  assert.equal(cleanMermaidSource(fenced), "flowchart TD\n  A[Start] --> B[End]");

  const genericFence = "```\ngraph LR\n  X --> Y\n```";
  assert.equal(cleanMermaidSource(genericFence), "graph LR\n  X --> Y");

  const raw = "sequenceDiagram\n  Alice->>Bob: Hello";
  assert.equal(cleanMermaidSource(raw), raw);

  const padded = "   \n```mermaid\nerDiagram\n  USER ||--o{ POST : writes\n```\n   ";
  assert.equal(cleanMermaidSource(padded), "erDiagram\n  USER ||--o{ POST : writes");
});

test("Diagram: isMermaidDiagram detects valid mermaid extensions and headers", () => {
  assert.equal(isMermaidDiagram("architecture.mmd", "random content"), true);
  assert.equal(isMermaidDiagram("flow.mermaid", "random content"), true);
  assert.equal(isMermaidDiagram("notes.md", "```mermaid\nflowchart TD\n  A-->B\n```"), true);
  assert.equal(isMermaidDiagram("notes.md", "flowchart TD\n  A-->B"), true);
  assert.equal(isMermaidDiagram("notes.md", "sequenceDiagram\n  A->>B: hi"), true);
  assert.equal(isMermaidDiagram("notes.md", "graph TD\n  A-->B"), true);
  assert.equal(isMermaidDiagram("ledger.csv", "date,amount,category"), false);
  assert.equal(isMermaidDiagram("script.py", "def main(): pass"), false);
});

test("Diagram: toggleDiagramOrientation switches flowchart and graph layouts", () => {
  const fc = "flowchart TD\n  A --> B";
  assert.equal(toggleDiagramOrientation(fc, "LR"), "flowchart LR\n  A --> B");
  assert.equal(toggleDiagramOrientation(fc, "TD"), "flowchart TD\n  A --> B");

  const gr = "graph LR\n  X --> Y";
  assert.equal(toggleDiagramOrientation(gr, "TD"), "graph TD\n  X --> Y");

  const other = "sequenceDiagram\n  Alice->>Bob: hello";
  assert.equal(toggleDiagramOrientation(other, "LR"), other);
});
