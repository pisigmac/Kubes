export function cleanMermaidSource(input: string): string {
  let cleaned = input.trim();
  // Strip markdown code fences if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:mermaid)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  return cleaned.trim();
}

export function isMermaidDiagram(fileName: string, content: string): boolean {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".mmd") || lowerName.endsWith(".mermaid")) {
    return true;
  }
  const trimmed = content.trim();
  return (
    trimmed.startsWith("```mermaid") ||
    trimmed.startsWith("flowchart") ||
    trimmed.startsWith("sequenceDiagram") ||
    trimmed.startsWith("classDiagram") ||
    trimmed.startsWith("stateDiagram") ||
    trimmed.startsWith("erDiagram") ||
    trimmed.startsWith("graph TD") ||
    trimmed.startsWith("graph LR")
  );
}

export function toggleDiagramOrientation(source: string, targetOrientation: "TD" | "LR"): string {
  // Support flowchart TD/TB/LR/RL and graph TD/TB/LR/RL
  const cleaned = cleanMermaidSource(source);
  return cleaned
    .replace(/\bflowchart\s+(TD|TB|LR|RL)\b/i, `flowchart ${targetOrientation}`)
    .replace(/\bgraph\s+(TD|TB|LR|RL)\b/i, `graph ${targetOrientation}`);
}
