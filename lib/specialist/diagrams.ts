import { ensureWorkspace, writeText } from "../computer/jail.ts";

export type DiagramType = "flowchart" | "mindmap" | "sequence" | "class";

export interface DiagramInput {
  title: string;
  type: DiagramType;
  mermaidCode: string;
  explanation?: string;
}

export function saveDiagramArtifact(
  input: DiagramInput,
  cubeSlug: string,
  fileName = "diagram.mmd",
): { path: string; markdown: string } {
  const root = ensureWorkspace(cubeSlug, false);
  const targetPath = `notes/${fileName.endsWith(".mmd") || fileName.endsWith(".md") ? fileName : `${fileName}.mmd`}`;

  const cleanMermaid = input.mermaidCode.trim();
  const fileContent = `%% ${input.title}\n${cleanMermaid}\n`;

  const saved = writeText(root, targetPath, fileContent);

  const markdownBlock = `### ${input.title}\n\n\`\`\`mermaid\n${cleanMermaid}\n\`\`\`\n\n${input.explanation || ""}`.trim();

  return { path: saved, markdown: markdownBlock };
}
