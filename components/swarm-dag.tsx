"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SwarmPlan, SwarmTask, SwarmTaskStatus } from "@/lib/cubes/swarm";
import { getExecutionBatches } from "@/lib/cubes/swarm";
import type { SwarmRunnerEvent } from "@/lib/cubes/swarm_runner";
import { getBrowserProviderSelection } from "@/components/provider-modal";

const SPECIALIST_ICONS: Record<string, string> = {
  maestro: "👑",
  "job-hunt": "💼",
  money: "💰",
  learn: "📚",
  work: "🛠️",
  focus: "🎯",
  body: "🏃",
  write: "✍️",
  "life-admin": "📋",
};

export function useSwarmStream() {
  const [plan, setPlan] = useState<SwarmPlan | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startSwarm = useCallback(async (objective: string, customPlan?: SwarmPlan) => {
    setError(null);
    setIsRunning(true);
    setCurrentBatchIndex(1);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const { providerId } = getBrowserProviderSelection();

    try {
      const response = await fetch("/api/swarm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(providerId ? { "x-kubes-provider-id": providerId } : {}),
        },
        body: JSON.stringify(customPlan ? { plan: customPlan } : { objective }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorJson = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorJson.error || `HTTP ${response.status} failed`);
      }

      if (!response.body) {
        throw new Error("Missing SSE response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;

          try {
            const event = JSON.parse(trimmed.slice(5).trim()) as SwarmRunnerEvent | { type: "plan_error"; error: string };

            if (event.type === "plan_error") {
              setError(event.error);
              setIsRunning(false);
              break;
            }

            if (event.type === "plan_started") {
              setTotalBatches(event.totalBatches);
            } else if (event.type === "batch_started") {
              setCurrentBatchIndex(event.batchIndex);
              setTotalBatches(event.totalBatches);
            } else if (event.type === "task_started") {
              setPlan((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  tasks: prev.tasks.map((t) =>
                    t.id === event.taskId ? { ...t, status: "running", startedAt: new Date().toISOString() } : t
                  ),
                };
              });
            } else if (event.type === "task_completed") {
              setPlan((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  tasks: prev.tasks.map((t) =>
                    t.id === event.taskId
                      ? {
                          ...t,
                          status: "completed",
                          output: event.output,
                          durationMs: event.durationMs,
                          artifactPaths: event.artifactPaths,
                        }
                      : t
                  ),
                };
              });
            } else if (event.type === "task_failed") {
              setPlan((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  tasks: prev.tasks.map((t) =>
                    t.id === event.taskId ? { ...t, status: "failed", error: event.error, durationMs: event.durationMs } : t
                  ),
                };
              });
            } else if (event.type === "task_skipped") {
              setPlan((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  tasks: prev.tasks.map((t) =>
                    t.id === event.taskId ? { ...t, status: "skipped", error: event.reason } : t
                  ),
                };
              });
            } else if (event.type === "synthesis_completed") {
              setPlan((prev) => (prev ? { ...prev, synthesis: event.synthesis } : prev));
            } else if (event.type === "plan_completed") {
              setPlan(event.plan);
              setIsRunning(false);
            }
          } catch (err) {
            console.warn("Failed to parse SSE event chunk", err);
          }
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  }, []);

  const stopSwarm = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const resetSwarm = useCallback(() => {
    stopSwarm();
    setPlan(null);
    setError(null);
  }, [stopSwarm]);

  return {
    plan,
    isRunning,
    currentBatchIndex,
    totalBatches,
    error,
    startSwarm,
    stopSwarm,
    resetSwarm,
  };
}

export function SwarmDAGCard({
  plan,
  isRunning,
  currentBatchIndex,
  totalBatches,
  onStop,
  onDismiss,
  onOpenFile,
}: {
  plan: SwarmPlan;
  isRunning: boolean;
  currentBatchIndex: number;
  totalBatches: number;
  onStop?: () => void;
  onDismiss?: () => void;
  onOpenFile?: (path: string) => void;
}) {
  const [selectedTask, setSelectedTask] = useState<SwarmTask | null>(null);

  const batches = useMemo(() => {
    return getExecutionBatches(plan.tasks);
  }, [plan.tasks]);

  const completedCount = useMemo(() => {
    return plan.tasks.filter((t) => t.status === "completed").length;
  }, [plan.tasks]);

  const totalCount = plan.tasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Escape key listener for the task inspection modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedTask) {
        e.preventDefault();
        setSelectedTask(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedTask]);

  return (
    <div className="my-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-2xl backdrop-blur-md">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/40 px-5 py-3.5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e7ff3a]/15 text-[#e7ff3a]">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">Multi-Agent Swarm Delegation</h3>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/70">
                {plan.status === "completed" ? "Completed" : isRunning ? `Stage ${currentBatchIndex}/${totalBatches || batches.length}` : "Ready"}
              </span>
            </div>
            <p className="line-clamp-1 max-w-md text-xs text-white/50">{plan.rootObjective}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isRunning && onStop ? (
            <button
              type="button"
              onClick={onStop}
              className="rounded-lg border border-red-500/30 bg-red-950/20 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-900/40"
            >
              Cancel Swarm
            </button>
          ) : null}
          {onDismiss && !isRunning ? (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
            >
              Dismiss
            </button>
          ) : null}
        </div>
      </div>

      {/* Progress Line */}
      <div className="h-1 w-full bg-white/5">
        <div
          className={`h-full transition-all duration-500 ${plan.status === "failed" ? "bg-red-500" : "bg-[#e7ff3a]"}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Topological Stages Graph */}
      <div className="overflow-x-auto p-5">
        <div className="flex min-w-max items-stretch gap-6">
          {batches.map((batch, batchIdx) => (
            <div key={`batch-${batchIdx}`} className="flex items-center gap-4">
              <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-black/20 p-3 min-w-[240px] max-w-[280px]">
                <div className="flex items-center justify-between text-[11px] font-medium text-white/40">
                  <span>STAGE {batchIdx + 1}</span>
                  <span>{batch.length} {batch.length === 1 ? "Agent" : "Parallel Agents"}</span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {batch.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setSelectedTask(task)}
                      className={`group relative flex flex-col items-start rounded-lg border p-3 text-left transition hover:scale-[1.01] ${
                        task.status === "running"
                          ? "border-amber-400/40 bg-amber-950/15 ring-1 ring-amber-400/30"
                          : task.status === "completed"
                            ? "border-emerald-500/30 bg-emerald-950/15"
                            : task.status === "failed"
                              ? "border-red-500/30 bg-red-950/15"
                              : task.status === "skipped"
                                ? "border-white/5 bg-white/[0.02] opacity-50"
                                : "border-white/10 bg-white/[0.04]"
                      }`}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-white">
                          <span>{SPECIALIST_ICONS[task.assignedCube] || "🤖"}</span>
                          <span className="capitalize">{task.assignedCube}</span>
                        </span>
                        <StatusBadge status={task.status} durationMs={task.durationMs} />
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs font-medium text-white/80">{task.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-white/40">{task.instruction}</p>
                    </button>
                  ))}
                </div>
              </div>

              {batchIdx < batches.length - 1 ? (
                <div className="text-white/20 text-lg font-light">→</div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* Synthesis Section (if available) */}
      {plan.synthesis ? (
        <div className="border-t border-white/10 bg-black/30 p-5">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-[#e7ff3a]">
            <span>👑</span>
            <span>Maestro Executive Briefing</span>
          </div>
          <div className="prose prose-invert max-w-none text-xs text-white/80 whitespace-pre-wrap leading-relaxed">
            {plan.synthesis}
          </div>
        </div>
      ) : null}

      {/* Task Inspection Modal */}
      {selectedTask ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setSelectedTask(null)}
        >
          <div
            className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/15 bg-[#14151a] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{SPECIALIST_ICONS[selectedTask.assignedCube] || "🤖"}</span>
                  <h4 id="task-dialog-title" className="text-base font-semibold text-white">
                    {selectedTask.title}
                  </h4>
                  <StatusBadge status={selectedTask.status} durationMs={selectedTask.durationMs} />
                </div>
                <p className="mt-1 text-xs text-white/50">
                  Assigned Cube: <span className="capitalize font-medium text-white/70">{selectedTask.assignedCube}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTask(null)}
                aria-label="Close details"
                className="rounded-lg border border-white/10 p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-4 text-xs">
              <div>
                <h5 className="font-semibold text-white/40 uppercase tracking-wider text-[10px] mb-1">Instruction</h5>
                <div className="rounded-lg border border-white/5 bg-black/40 p-3 text-white/80 font-mono text-[11px]">
                  {selectedTask.instruction}
                </div>
              </div>

              {selectedTask.output ? (
                <div>
                  <h5 className="font-semibold text-white/40 uppercase tracking-wider text-[10px] mb-1">Specialist Output</h5>
                  <div className="max-h-60 overflow-y-auto rounded-lg border border-white/5 bg-black/40 p-3 text-white/85 whitespace-pre-wrap">
                    {selectedTask.output}
                  </div>
                </div>
              ) : null}

              {selectedTask.artifactPaths && selectedTask.artifactPaths.length > 0 ? (
                <div>
                  <h5 className="font-semibold text-white/40 uppercase tracking-wider text-[10px] mb-1">Generated Artifacts</h5>
                  <div className="flex flex-wrap gap-2">
                    {selectedTask.artifactPaths.map((path) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() => onOpenFile?.(path)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80 hover:border-[#e7ff3a]/40 hover:bg-white/10 hover:text-white transition"
                      >
                        <span>📄</span>
                        <span className="font-mono text-[11px]">{path.split("/").pop() || path}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedTask.error ? (
                <div>
                  <h5 className="font-semibold text-red-400 uppercase tracking-wider text-[10px] mb-1">Error</h5>
                  <div className="rounded-lg border border-red-500/20 bg-red-950/20 p-3 text-red-300">
                    {selectedTask.error}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge({ status, durationMs }: { status: SwarmTaskStatus; durationMs?: number }) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
        Running
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
        ✓ {durationMs ? `${(durationMs / 1000).toFixed(1)}s` : "Done"}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-medium text-red-300">
        ✕ Failed
      </span>
    );
  }
  if (status === "skipped") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/40">
        Skipped
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/50">
      Waiting
    </span>
  );
}
