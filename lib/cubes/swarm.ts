/**
 * Swarm Task & DAG Orchestration Protocol
 * Standardized schema, validation, and topological dependency solver for multi-agent delegation.
 */

export type SwarmTaskStatus =
  | "pending"
  | "ready"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type SwarmPlanStatus =
  | "planning"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface SwarmTask {
  id: string;
  parentCube: string;
  assignedCube: string;
  title: string;
  instruction: string;
  inputs?: Record<string, unknown>;
  dependencies: string[];
  status: SwarmTaskStatus;
  output?: string;
  artifactPaths?: string[];
  error?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface SwarmPlan {
  id: string;
  rootObjective: string;
  orgId: string;
  tasks: SwarmTask[];
  status: SwarmPlanStatus;
  createdAt: string;
  completedAt?: string;
  synthesis?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a SwarmPlan for uniqueness of IDs, dependency existence, and absence of cycles.
 */
export function validateSwarmPlan(plan: SwarmPlan): ValidationResult {
  const errors: string[] = [];

  if (!plan.id || typeof plan.id !== "string") {
    errors.push("Plan id must be a non-empty string.");
  }
  if (!plan.rootObjective || typeof plan.rootObjective !== "string") {
    errors.push("Root objective must be a non-empty string.");
  }
  if (!Array.isArray(plan.tasks) || plan.tasks.length === 0) {
    errors.push("Plan must contain at least one task.");
    return { valid: false, errors };
  }

  const taskIds = new Set<string>();
  for (const task of plan.tasks) {
    if (!task.id || typeof task.id !== "string") {
      errors.push("Each task must have a non-empty id.");
    } else if (taskIds.has(task.id)) {
      errors.push(`Duplicate task id detected: '${task.id}'.`);
    } else {
      taskIds.add(task.id);
    }

    if (!task.assignedCube) {
      errors.push(`Task '${task.id || "unknown"}' must specify an assignedCube.`);
    }
    if (!task.instruction) {
      errors.push(`Task '${task.id || "unknown"}' must specify an instruction.`);
    }
  }

  // Verify that all declared dependencies exist in the task set
  for (const task of plan.tasks) {
    if (Array.isArray(task.dependencies)) {
      for (const depId of task.dependencies) {
        if (!taskIds.has(depId)) {
          errors.push(
            `Task '${task.id}' depends on non-existent task id: '${depId}'.`
          );
        }
        if (depId === task.id) {
          errors.push(`Task '${task.id}' cannot depend on itself.`);
        }
      }
    }
  }

  // Cycle detection via Kahn's algorithm or DFS
  if (errors.length === 0) {
    const cycleDetected = hasDependencyCycle(plan.tasks);
    if (cycleDetected) {
      errors.push("Cycle detected in task dependency graph.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Checks for cycles in the directed dependency graph using depth-first search with color tagging.
 */
export function hasDependencyCycle(tasks: SwarmTask[]): boolean {
  const taskMap = new Map<string, SwarmTask>(tasks.map((t) => [t.id, t]));
  // 0 = unvisited, 1 = visiting (in recursion stack), 2 = visited
  const visited = new Map<string, number>();

  function dfs(taskId: string): boolean {
    visited.set(taskId, 1);
    const task = taskMap.get(taskId);
    if (task && Array.isArray(task.dependencies)) {
      for (const depId of task.dependencies) {
        const state = visited.get(depId) || 0;
        if (state === 1) {
          return true; // Cycle detected
        }
        if (state === 0 && dfs(depId)) {
          return true;
        }
      }
    }
    visited.set(taskId, 2);
    return false;
  }

  for (const task of tasks) {
    if ((visited.get(task.id) || 0) === 0) {
      if (dfs(task.id)) return true;
    }
  }

  return false;
}

/**
 * Organizes tasks into parallel execution batches using topological levels.
 * Batch 0 contains tasks with 0 dependencies.
 * Subsequent batches contain tasks whose dependencies are resolved in earlier batches.
 */
export function getExecutionBatches(tasks: SwarmTask[]): SwarmTask[][] {
  if (tasks.length === 0) return [];

  const taskMap = new Map<string, SwarmTask>(tasks.map((t) => [t.id, t]));
  const inDegree = new Map<string, number>();
  const graph = new Map<string, string[]>(); // dependency -> dependents

  for (const task of tasks) {
    inDegree.set(task.id, task.dependencies ? task.dependencies.length : 0);
    graph.set(task.id, []);
  }

  for (const task of tasks) {
    if (task.dependencies) {
      for (const depId of task.dependencies) {
        const list = graph.get(depId) || [];
        list.push(task.id);
        graph.set(depId, list);
      }
    }
  }

  const batches: SwarmTask[][] = [];
  let currentBatchIds: string[] = [];

  for (const [taskId, deg] of inDegree.entries()) {
    if (deg === 0) {
      currentBatchIds.push(taskId);
    }
  }

  while (currentBatchIds.length > 0) {
    const currentBatchTasks: SwarmTask[] = currentBatchIds
      .map((id) => taskMap.get(id)!)
      .filter(Boolean);
    batches.push(currentBatchTasks);

    const nextBatchIds: string[] = [];
    for (const id of currentBatchIds) {
      const dependents = graph.get(id) || [];
      for (const depId of dependents) {
        const newDeg = (inDegree.get(depId) || 0) - 1;
        inDegree.set(depId, newDeg);
        if (newDeg === 0) {
          nextBatchIds.push(depId);
        }
      }
    }
    currentBatchIds = nextBatchIds;
  }

  return batches;
}

/**
 * Returns all tasks that are currently eligible for execution:
 * Status is "pending" and all dependencies have status "completed".
 */
export function getReadyTasks(plan: SwarmPlan): SwarmTask[] {
  const completedTaskIds = new Set<string>(
    plan.tasks.filter((t) => t.status === "completed").map((t) => t.id)
  );

  return plan.tasks.filter((task) => {
    if (task.status !== "pending") return false;
    if (!task.dependencies || task.dependencies.length === 0) return true;
    return task.dependencies.every((depId) => completedTaskIds.has(depId));
  });
}

/**
 * Immutably updates a specific task's status and metadata within a plan.
 * If a task fails, immediately marks downstream dependent pending tasks as "skipped".
 */
export function updateTaskStatus(
  plan: SwarmPlan,
  taskId: string,
  update: Partial<Omit<SwarmTask, "id">>
): SwarmPlan {
  const updatedTasks = plan.tasks.map((task) => {
    if (task.id !== taskId) return task;
    return {
      ...task,
      ...update,
    };
  });

  // If the updated task failed, mark any transitive dependent pending tasks as skipped
  if (update.status === "failed") {
    const failedIds = new Set<string>([taskId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of updatedTasks) {
        if (
          t.status === "pending" &&
          t.dependencies &&
          t.dependencies.some((depId) => failedIds.has(depId))
        ) {
          t.status = "skipped";
          t.error = `Skipped due to upstream failure in dependency.`;
          failedIds.add(t.id);
          changed = true;
        }
      }
    }
  }

  // Derive plan-level status
  const allTerminal = updatedTasks.every((t) =>
    ["completed", "failed", "skipped"].includes(t.status)
  );
  const anyFailed = updatedTasks.some((t) => t.status === "failed");
  const anyRunning = updatedTasks.some((t) => t.status === "running");

  let planStatus: SwarmPlanStatus = plan.status;
  let completedAt: string | undefined = plan.completedAt;

  if (allTerminal) {
    planStatus = anyFailed ? "failed" : "completed";
    completedAt = new Date().toISOString();
  } else if (anyRunning) {
    planStatus = "running";
  }

  return {
    ...plan,
    tasks: updatedTasks,
    status: planStatus,
    completedAt,
  };
}

/**
 * Checks whether all tasks in the plan have reached a terminal state.
 */
export function isPlanCompleted(plan: SwarmPlan): boolean {
  return plan.tasks.every((t) =>
    ["completed", "failed", "skipped"].includes(t.status)
  );
}

/**
 * Factory helper to construct a validated initial SwarmPlan.
 */
export function createSwarmPlan(
  rootObjective: string,
  taskDefinitions: Array<
    Omit<SwarmTask, "status" | "output" | "artifactPaths" | "error" | "durationMs">
  >,
  options?: {
    id?: string;
    orgId?: string;
  }
): SwarmPlan {
  const planId = options?.id || `swarm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const orgId = options?.orgId || "default";

  const tasks: SwarmTask[] = taskDefinitions.map((t) => ({
    ...t,
    status: "pending",
  }));

  const plan: SwarmPlan = {
    id: planId,
    rootObjective,
    orgId,
    tasks,
    status: "planning",
    createdAt: new Date().toISOString(),
  };

  const validation = validateSwarmPlan(plan);
  if (!validation.valid) {
    throw new Error(
      `Invalid SwarmPlan definition: ${validation.errors.join("; ")}`
    );
  }

  return plan;
}
