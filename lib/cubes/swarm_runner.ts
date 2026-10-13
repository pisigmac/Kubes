/**
 * Swarm Execution Engine
 * Drives parallel batch dispatching of specialist Kubes, event streaming, and synthesis.
 */

import { getCubeBySlug } from "./store.ts";
import { runCubeInstruction } from "./runtime.ts";
import {
  type SwarmPlan,
  type SwarmTask,
  validateSwarmPlan,
  getExecutionBatches,
  updateTaskStatus,
  createSwarmPlan,
} from "./swarm.ts";
import { synthesizeSwarmPlan } from "./synthesizer.ts";
import type { ResourceScope } from "../auth/deskid.ts";

export type SwarmRunnerEvent =
  | { type: "plan_started"; planId: string; totalTasks: number; totalBatches: number }
  | { type: "batch_started"; batchIndex: number; totalBatches: number; taskIds: string[] }
  | { type: "task_started"; taskId: string; assignedCube: string; title: string }
  | { type: "task_progress"; taskId: string; message: string }
  | { type: "task_completed"; taskId: string; output: string; durationMs: number; artifactPaths?: string[] }
  | { type: "task_failed"; taskId: string; error: string; durationMs: number }
  | { type: "task_skipped"; taskId: string; reason: string }
  | { type: "synthesis_started" }
  | { type: "synthesis_completed"; synthesis: string }
  | { type: "plan_completed"; plan: SwarmPlan };

export interface SwarmRunnerOptions {
  plan: SwarmPlan;
  scope?: ResourceScope | string;
  providerKey?: string;
  providerId?: string;
  abortSignal?: AbortSignal;
  onEvent?: (event: SwarmRunnerEvent) => void | Promise<void>;
  executor?: (task: SwarmTask, prompt: string, signal: AbortSignal) => Promise<string>;
}

/**
 * Executes a full SwarmPlan batch-by-batch according to its topological DAG dependencies.
 */
export async function executeSwarmPlan(options: SwarmRunnerOptions): Promise<SwarmPlan> {
  const { plan, scope, abortSignal, onEvent, executor } = options;

  const validation = validateSwarmPlan(plan);
  if (!validation.valid) {
    throw new Error(`Invalid SwarmPlan: ${validation.errors.join("; ")}`);
  }

  let currentPlan: SwarmPlan = {
    ...plan,
    status: "running",
  };

  const batches = getExecutionBatches(currentPlan.tasks);
  const totalTasks = currentPlan.tasks.length;
  const totalBatches = batches.length;

  await emitEvent(onEvent, {
    type: "plan_started",
    planId: currentPlan.id,
    totalTasks,
    totalBatches,
  });

  const abortController = new AbortController();
  if (abortSignal) {
    abortSignal.addEventListener("abort", () => abortController.abort(), { once: true });
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    if (abortController.signal.aborted) {
      break;
    }

    const currentBatch = batches[batchIndex];
    const batchTaskIds = currentBatch.map((t) => t.id);

    await emitEvent(onEvent, {
      type: "batch_started",
      batchIndex: batchIndex + 1,
      totalBatches,
      taskIds: batchTaskIds,
    });

    // Execute all tasks in the current batch concurrently
    const taskPromises = currentBatch.map(async (taskDef) => {
      // Re-read latest state of task from currentPlan (in case it was skipped due to earlier failure)
      const freshTask = currentPlan.tasks.find((t) => t.id === taskDef.id);
      if (!freshTask || freshTask.status === "skipped") {
        await emitEvent(onEvent, {
          type: "task_skipped",
          taskId: taskDef.id,
          reason: freshTask?.error || "Skipped due to upstream dependency failure",
        });
        return;
      }

      const startTime = Date.now();
      const startedAt = new Date().toISOString();

      currentPlan = updateTaskStatus(currentPlan, taskDef.id, {
        status: "running",
        startedAt,
      });

      await emitEvent(onEvent, {
        type: "task_started",
        taskId: taskDef.id,
        assignedCube: taskDef.assignedCube,
        title: taskDef.title,
      });

      try {
        // Build prompt with upstream context if task had dependencies
        let prompt = taskDef.instruction;
        if (taskDef.dependencies && taskDef.dependencies.length > 0) {
          const upstreamOutputs = currentPlan.tasks
            .filter((t) => taskDef.dependencies.includes(t.id) && t.output)
            .map((t) => `### Upstream Findings from ${t.title || t.id} (${t.assignedCube}):\n${t.output}`)
            .join("\n\n");

          if (upstreamOutputs) {
            prompt = `${prompt}\n\n${upstreamOutputs}`;
          }
        }

        let outputText = "";
        if (executor) {
          outputText = await executor(taskDef, prompt, abortController.signal);
        } else {
          const targetCube = getCubeBySlug(taskDef.assignedCube, scope);
          if (!targetCube) {
            throw new Error(`Assigned specialist Cube '${taskDef.assignedCube}' not found.`);
          }
          outputText = await runCubeInstruction(targetCube, prompt, abortController.signal);
        }

        const durationMs = Date.now() - startTime;
        const completedAt = new Date().toISOString();

        currentPlan = updateTaskStatus(currentPlan, taskDef.id, {
          status: "completed",
          output: outputText,
          durationMs,
          completedAt,
        });

        await emitEvent(onEvent, {
          type: "task_completed",
          taskId: taskDef.id,
          output: outputText,
          durationMs,
        });
      } catch (err) {
        const durationMs = Date.now() - startTime;
        const errorMessage = err instanceof Error ? err.message : String(err);

        currentPlan = updateTaskStatus(currentPlan, taskDef.id, {
          status: "failed",
          error: errorMessage,
          durationMs,
        });

        await emitEvent(onEvent, {
          type: "task_failed",
          taskId: taskDef.id,
          error: errorMessage,
          durationMs,
        });
      }
    });

    await Promise.allSettled(taskPromises);
  }

  // Generate executive synthesis if any tasks succeeded
  const completedTasks = currentPlan.tasks.filter((t) => t.status === "completed");
  if (completedTasks.length > 0) {
    await emitEvent(onEvent, { type: "synthesis_started" });

    const synthesisResult = await synthesizeSwarmPlan(currentPlan, {
      scope,
      abortSignal: abortController.signal,
      executor,
    });

    currentPlan.synthesis = synthesisResult.markdown;
    await emitEvent(onEvent, {
      type: "synthesis_completed",
      synthesis: synthesisResult.markdown,
    });
  }

  const allCompleted = currentPlan.tasks.every((t) => t.status === "completed" || t.status === "skipped");
  currentPlan.status = allCompleted ? "completed" : "failed";
  currentPlan.completedAt = new Date().toISOString();

  await emitEvent(onEvent, {
    type: "plan_completed",
    plan: currentPlan,
  });

  return currentPlan;
}

async function emitEvent(
  onEvent: SwarmRunnerOptions["onEvent"],
  event: SwarmRunnerEvent
): Promise<void> {
  if (!onEvent) return;
  try {
    await onEvent(event);
  } catch (err) {
    console.warn("Error in SwarmRunner event listener:", err);
  }
}

/**
 * Decomposes an open-ended composite user prompt into an executable multi-specialist SwarmPlan.
 */
export function decomposeObjectiveToPlan(
  objective: string,
  options?: {
    scope?: ResourceScope | string;
    availableCubes?: string[];
  }
): SwarmPlan {
  const lower = objective.toLowerCase();
  const tasks: Array<Omit<SwarmTask, "status">> = [];

  // Detect domain specialist candidates
  const wantsJobs = /job|career|hiring|role|resume|interview|salary|relocat/i.test(lower);
  const wantsMoney = /money|budget|cost|living|expense|finance|ledger|price|spend/i.test(lower);
  const wantsDiagram = /diagram|flowchart|chart|architecture|visual|learn|map|mermaid/i.test(lower);
  const wantsWork = /code|review|git|refactor|repo|feature|build|debug/i.test(lower);

  let taskCount = 1;

  if (wantsJobs) {
    tasks.push({
      id: `task-${taskCount++}`,
      parentCube: "maestro",
      assignedCube: "job-hunt",
      title: "Market Search & Role Tracking",
      instruction: `Search and evaluate opportunities relevant to: "${objective}". Parse key criteria, compensation ranges, and next steps into notes/applications.md.`,
      dependencies: [],
    });
  }

  if (wantsMoney) {
    tasks.push({
      id: `task-${taskCount++}`,
      parentCube: "maestro",
      assignedCube: "money",
      title: "Financial Budget & Ledger Calculation",
      instruction: `Compute budget estimates and financial impacts for: "${objective}". Log relevant entries into notes/ledger.csv and report totals.`,
      dependencies: [],
    });
  }

  if (wantsDiagram) {
    const deps = tasks.map((t) => t.id);
    tasks.push({
      id: `task-${taskCount++}`,
      parentCube: "maestro",
      assignedCube: "learn",
      title: "System Architecture & Plan Diagram",
      instruction: `Synthesize a clear Mermaid architecture or roadmap diagram for: "${objective}". Save the chart in notes/diagram.mmd.`,
      dependencies: deps,
    });
  }

  if (wantsWork && !wantsJobs && !wantsMoney) {
    tasks.push({
      id: `task-${taskCount++}`,
      parentCube: "maestro",
      assignedCube: "work",
      title: "Engineering Implementation & Review",
      instruction: `Plan and execute technical engineering steps for: "${objective}".`,
      dependencies: [],
    });
  }

  // Fallback if no specific keyword matched
  if (tasks.length === 0) {
    tasks.push({
      id: "task-1",
      parentCube: "maestro",
      assignedCube: "focus",
      title: "Objective Analysis & Execution",
      instruction: `Analyze and execute actions for: "${objective}".`,
      dependencies: [],
    });
  }

  return createSwarmPlan(objective, tasks, {
    orgId: typeof options?.scope === "object" ? options.scope.orgId : "default",
  });
}
