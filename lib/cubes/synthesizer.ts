/**
 * Maestro Swarm Synthesis Node
 * Aggregates multi-specialist outputs, collates generated file artifacts,
 * and synthesizes an executive briefing with cross-disciplinary insights and action links.
 */

import type { SwarmPlan, SwarmTask } from "./swarm.ts";
import { getCubeBySlug } from "./store.ts";
import { runCubeInstruction } from "./runtime.ts";
import type { ResourceScope } from "../auth/deskid.ts";

export type ArtifactKind = "markdown" | "diagram" | "csv" | "code" | "document";

export interface SwarmArtifactLink {
  path: string;
  name: string;
  specialist: string;
  kind: ArtifactKind;
}

export interface SwarmSynthesisResult {
  markdown: string;
  executiveSummary: string;
  findings: Array<{
    specialist: string;
    title: string;
    summary: string;
    artifacts?: string[];
  }>;
  actionItems: string[];
  artifacts: SwarmArtifactLink[];
}

export interface SynthesizerOptions {
  scope?: ResourceScope | string;
  abortSignal?: AbortSignal;
  providerKey?: string;
  providerId?: string;
  executor?: (task: SwarmTask, prompt: string, signal: AbortSignal) => Promise<string>;
}

/**
 * Infers artifact category based on file extension.
 */
export function inferArtifactKind(filePath: string): ArtifactKind {
  const clean = filePath.toLowerCase().trim();
  if (clean.endsWith(".mmd") || clean.endsWith(".mermaid") || clean.includes("diagram")) {
    return "diagram";
  }
  if (clean.endsWith(".csv") || clean.endsWith(".tsv") || clean.endsWith(".xlsx")) {
    return "csv";
  }
  if (
    clean.endsWith(".ts") ||
    clean.endsWith(".tsx") ||
    clean.endsWith(".js") ||
    clean.endsWith(".jsx") ||
    clean.endsWith(".py") ||
    clean.endsWith(".sh") ||
    clean.endsWith(".json")
  ) {
    return "code";
  }
  if (clean.endsWith(".md") || clean.endsWith(".markdown") || clean.endsWith(".txt")) {
    return "markdown";
  }
  return "document";
}

/**
 * Extracts and deduplicates artifact references from both task metadata and raw output text.
 */
export function extractArtifactLinks(tasks: SwarmTask[]): SwarmArtifactLink[] {
  const seenPaths = new Set<string>();
  const artifacts: SwarmArtifactLink[] = [];

  for (const task of tasks) {
    // 1. Explicit metadata artifactPaths
    if (task.artifactPaths && Array.isArray(task.artifactPaths)) {
      for (const rawPath of task.artifactPaths) {
        const clean = rawPath.trim();
        if (clean && !seenPaths.has(clean)) {
          seenPaths.add(clean);
          artifacts.push({
            path: clean,
            name: clean.split("/").pop() || clean,
            specialist: task.assignedCube,
            kind: inferArtifactKind(clean),
          });
        }
      }
    }

    // 2. Scan output text for created files (e.g., "Wrote notes.md", "Created architecture.mmd", "`tracker.csv`")
    if (task.output) {
      const fileRegex = /(?:wrote|created|saved|file:?)\s+[`"']?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)[`"']?/gi;
      let match: RegExpExecArray | null;
      while ((match = fileRegex.exec(task.output)) !== null) {
        const detectedPath = match[1].trim();
        if (detectedPath && !seenPaths.has(detectedPath)) {
          seenPaths.add(detectedPath);
          artifacts.push({
            path: detectedPath,
            name: detectedPath.split("/").pop() || detectedPath,
            specialist: task.assignedCube,
            kind: inferArtifactKind(detectedPath),
          });
        }
      }
    }
  }

  return artifacts;
}

/**
 * Builds the comprehensive synthesis prompt for Maestro.
 */
export function buildSynthesisPrompt(
  objective: string,
  tasks: SwarmTask[],
  artifacts: SwarmArtifactLink[]
): string {
  const completed = tasks.filter((t) => t.status === "completed");
  const failed = tasks.filter((t) => t.status === "failed");
  const skipped = tasks.filter((t) => t.status === "skipped");

  let prompt = `You are Maestro, conductor and strategic coordinator of Kubes.
Synthesize the outputs of the following specialist sub-tasks into a cohesive executive briefing for the user's objective:
"${objective}"

### Sub-Task Results:
`;

  for (const task of completed) {
    prompt += `\n#### [${task.assignedCube.toUpperCase()}] ${task.title}\n`;
    prompt += `Instruction: ${task.instruction}\n`;
    prompt += `Output:\n${task.output || "Completed successfully with no text output."}\n`;
    if (task.artifactPaths && task.artifactPaths.length > 0) {
      prompt += `Artifacts: ${task.artifactPaths.join(", ")}\n`;
    }
  }

  if (failed.length > 0) {
    prompt += `\n### Failed Sub-Tasks:\n`;
    for (const task of failed) {
      prompt += `- [${task.assignedCube.toUpperCase()}] ${task.title}: ${task.error || "Execution failed"}\n`;
    }
  }

  if (skipped.length > 0) {
    prompt += `\n### Skipped Sub-Tasks (Dependency unfulfilled):\n`;
    for (const task of skipped) {
      prompt += `- [${task.assignedCube.toUpperCase()}] ${task.title}\n`;
    }
  }

  if (artifacts.length > 0) {
    prompt += `\n### Generated Deliverables:\n`;
    for (const art of artifacts) {
      prompt += `- \`${art.name}\` (${art.kind}, produced by ${art.specialist})\n`;
    }
  }

  prompt += `
Structure your response as an Executive Briefing:
1. ## Executive Summary
   High-level overview synthesizing results across all specialist Kubes into clear conclusions.
2. ## Key Cross-Disciplinary Insights
   Synthesized analysis connecting the findings from each domain.
3. ## Generated Deliverables
   Reference the files created and how the user can utilize them.
4. ## Action Items & Next Steps
   Prioritized bullet list of immediate steps for the user.`;

  return prompt;
}

/**
 * Parses action items from synthesis text.
 */
export function parseActionItems(text: string): string[] {
  const actionItems: string[] = [];
  const lines = text.split("\n");
  let inActionSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.toLowerCase().includes("action item") ||
      trimmed.toLowerCase().includes("next step") ||
      trimmed.toLowerCase().includes("immediate step")
    ) {
      inActionSection = true;
      continue;
    }
    if (inActionSection && trimmed.startsWith("## ")) {
      inActionSection = false;
      continue;
    }
    if (inActionSection && (trimmed.startsWith("- [ ]") || trimmed.startsWith("- ") || trimmed.startsWith("* ") || /^\d+\./.test(trimmed))) {
      const cleanItem = trimmed.replace(/^[-*]\s*(\[[ xX]\]\s*)?/, "").replace(/^\d+\.\s*/, "").trim();
      if (cleanItem) {
        actionItems.push(cleanItem);
      }
    }
  }

  return actionItems;
}

/**
 * Generates structured fallback markdown when LLM is unavailable or offline.
 */
export function generateFallbackSynthesis(
  objective: string,
  tasks: SwarmTask[],
  artifacts: SwarmArtifactLink[]
): SwarmSynthesisResult {
  const completed = tasks.filter((t) => t.status === "completed");
  const failed = tasks.filter((t) => t.status === "failed");

  const findings = completed.map((t) => ({
    specialist: t.assignedCube,
    title: t.title,
    summary: t.output ? (t.output.length > 300 ? `${t.output.slice(0, 297)}...` : t.output) : "Task completed successfully.",
    artifacts: t.artifactPaths,
  }));

  const actionItems: string[] = [
    `Review outputs produced by ${completed.map((t) => t.assignedCube).join(", ")}.`,
  ];
  if (artifacts.length > 0) {
    actionItems.push(`Inspect generated deliverables: ${artifacts.map((a) => a.name).join(", ")}.`);
  }
  if (failed.length > 0) {
    actionItems.push(`Investigate failed tasks: ${failed.map((t) => t.title).join(", ")}.`);
  }

  let markdown = `# Executive Swarm Briefing: ${objective}\n\n`;
  markdown += `## Executive Summary\n`;
  markdown += `Autonomous swarm execution completed with **${completed.length}** successful specialist sub-tasks`;
  if (failed.length > 0) {
    markdown += ` and **${failed.length}** failures`;
  }
  markdown += `.\n\n`;

  markdown += `## Specialist Findings\n\n`;
  for (const t of completed) {
    markdown += `### [${t.assignedCube.toUpperCase()}] ${t.title}\n`;
    markdown += `${t.output || "Completed without detailed notes."}\n\n`;
  }

  if (artifacts.length > 0) {
    markdown += `## Generated Deliverables\n\n`;
    for (const art of artifacts) {
      markdown += `- 📄 **\`${art.name}\`** (${art.kind}) — *Created by ${art.specialist}*\n`;
    }
    markdown += `\n`;
  }

  markdown += `## Recommended Next Steps\n\n`;
  for (const item of actionItems) {
    markdown += `- [ ] ${item}\n`;
  }

  return {
    markdown,
    executiveSummary: `Autonomous swarm execution completed with ${completed.length} successful tasks.`,
    findings,
    actionItems,
    artifacts,
  };
}

/**
 * Orchestrates full synthesis for a SwarmPlan.
 */
export async function synthesizeSwarmPlan(
  plan: SwarmPlan,
  options: SynthesizerOptions = {}
): Promise<SwarmSynthesisResult> {
  const completed = plan.tasks.filter((t) => t.status === "completed");
  const artifacts = extractArtifactLinks(plan.tasks);

  if (completed.length === 0) {
    const errorMarkdown = `# Executive Briefing: ${plan.rootObjective}\n\nAll sub-tasks failed or were skipped during execution. No specialist outputs were available for synthesis.`;
    return {
      markdown: errorMarkdown,
      executiveSummary: "All sub-tasks failed or were skipped.",
      findings: [],
      actionItems: ["Review task logs and adjust initial prompt."],
      artifacts: [],
    };
  }

  const prompt = buildSynthesisPrompt(plan.rootObjective, plan.tasks, artifacts);
  let synthesisText = "";

  try {
    if (options.executor) {
      synthesisText = await options.executor(
        {
          id: "synthesis",
          parentCube: "maestro",
          assignedCube: "maestro",
          title: "Executive Synthesis",
          instruction: prompt,
          dependencies: [],
          status: "running",
        },
        prompt,
        options.abortSignal || new AbortController().signal
      );
    } else {
      const maestro = getCubeBySlug("maestro", options.scope);
      if (maestro) {
        synthesisText = await runCubeInstruction(
          maestro,
          prompt,
          options.abortSignal || new AbortController().signal,
          options.providerKey,
          options.providerId,
        );
      } else {
        return generateFallbackSynthesis(plan.rootObjective, plan.tasks, artifacts);
      }
    }
  } catch {
    return generateFallbackSynthesis(plan.rootObjective, plan.tasks, artifacts);
  }

  if (!synthesisText.trim()) {
    return generateFallbackSynthesis(plan.rootObjective, plan.tasks, artifacts);
  }

  const actionItems = parseActionItems(synthesisText);
  if (actionItems.length === 0) {
    actionItems.push("Review specialist deliverables.");
  }

  const findings = completed.map((t) => ({
    specialist: t.assignedCube,
    title: t.title,
    summary: t.output ? (t.output.length > 300 ? `${t.output.slice(0, 297)}...` : t.output) : "Completed.",
    artifacts: t.artifactPaths,
  }));

  // Append formatted artifact links to the synthesis markdown if not already mentioned
  let finalMarkdown = synthesisText;
  if (artifacts.length > 0 && !synthesisText.includes("Generated Deliverables")) {
    finalMarkdown += `\n\n### Generated Deliverables\n`;
    for (const art of artifacts) {
      finalMarkdown += `- 📄 **\`${art.name}\`** (${art.kind}) — *Created by ${art.specialist}*\n`;
    }
  }

  return {
    markdown: finalMarkdown,
    executiveSummary: `Synthesized findings from ${completed.length} specialist tasks.`,
    findings,
    actionItems,
    artifacts,
  };
}
