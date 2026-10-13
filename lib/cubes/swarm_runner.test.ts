import test from "node:test";
import assert from "node:assert/strict";
import {
  executeSwarmPlan,
  decomposeObjectiveToPlan,
  type SwarmRunnerEvent,
} from "./swarm_runner.ts";
import { createSwarmPlan, type SwarmPlan } from "./swarm.ts";

test("Swarm Runner: decomposeObjectiveToPlan extracts multi-specialist sub-tasks", () => {
  const compositePrompt = "Relocating to London: analyze Senior AI Engineer roles and calculate living budget";
  const plan = decomposeObjectiveToPlan(compositePrompt);

  assert.equal(plan.status, "planning");
  assert.ok(plan.tasks.length >= 2);

  const assignedCubes = plan.tasks.map((t) => t.assignedCube);
  assert.ok(assignedCubes.includes("job-hunt"), "Must include job-hunt specialist");
  assert.ok(assignedCubes.includes("money"), "Must include money specialist");
});

test("Swarm Runner: decomposeObjectiveToPlan attaches diagram specialist when requested", () => {
  const prompt = "Build onboarding system architecture diagram and track jobs";
  const plan = decomposeObjectiveToPlan(prompt);

  const assignedCubes = plan.tasks.map((t) => t.assignedCube);
  assert.ok(assignedCubes.includes("learn"), "Must include learn specialist for diagrams");
  assert.ok(assignedCubes.includes("job-hunt"));

  // The diagram task should depend on upstream tasks
  const learnTask = plan.tasks.find((t) => t.assignedCube === "learn");
  assert.ok(learnTask);
  assert.ok(learnTask.dependencies.length > 0);
});

test("Swarm Runner: executes sequential and parallel batches with event streaming", async () => {
  const events: SwarmRunnerEvent[] = [];

  const plan: SwarmPlan = createSwarmPlan("Test Swarm Execution", [
    {
      id: "search-roles",
      parentCube: "maestro",
      assignedCube: "job-hunt",
      title: "Search AI Roles",
      instruction: "Find top 3 companies",
      dependencies: [],
    },
    {
      id: "calc-budget",
      parentCube: "maestro",
      assignedCube: "money",
      title: "Calculate Budget",
      instruction: "Estimate monthly rent",
      dependencies: [],
    },
    {
      id: "diagram-plan",
      parentCube: "maestro",
      assignedCube: "learn",
      title: "Roadmap Diagram",
      instruction: "Create sequence chart",
      dependencies: ["search-roles", "calc-budget"],
    },
  ]);

  const receivedPrompts: Record<string, string> = {};

  const mockExecutor = async (task: { id: string }, prompt: string) => {
    receivedPrompts[task.id] = prompt;
    if (task.id === "search-roles") return "Found 3 companies: Alpha, Beta, Gamma.";
    if (task.id === "calc-budget") return "Estimated monthly budget: £3,200.";
    if (task.id === "diagram-plan") return "```mermaid\nsequenceDiagram\n```";
    if (task.id === "synthesis") return "Executive briefing: All targets addressed successfully.";
    return "Output for " + task.id;
  };

  const executedPlan = await executeSwarmPlan({
    plan,
    onEvent: (event) => {
      events.push(event);
    },
    executor: mockExecutor,
  });

  assert.equal(executedPlan.status, "completed");
  assert.ok(executedPlan.synthesis);
  assert.ok(executedPlan.synthesis.includes("Executive briefing"));

  // Check downstream task received upstream outputs in prompt
  assert.ok(receivedPrompts["diagram-plan"].includes("Alpha, Beta, Gamma"));
  assert.ok(receivedPrompts["diagram-plan"].includes("£3,200"));

  // Check event stream sequence
  const eventTypes = events.map((e) => e.type);
  assert.ok(eventTypes.includes("plan_started"));
  assert.ok(eventTypes.includes("batch_started"));
  assert.ok(eventTypes.includes("task_started"));
  assert.ok(eventTypes.includes("task_completed"));
  assert.ok(eventTypes.includes("synthesis_started"));
  assert.ok(eventTypes.includes("synthesis_completed"));
  assert.ok(eventTypes.includes("plan_completed"));
});

test("Swarm Runner: handles task failure and skips downstream dependents", async () => {
  const events: SwarmRunnerEvent[] = [];

  const plan: SwarmPlan = createSwarmPlan("Fault tolerance test", [
    {
      id: "upstream",
      parentCube: "maestro",
      assignedCube: "work",
      title: "Upstream Task",
      instruction: "Will fail",
      dependencies: [],
    },
    {
      id: "downstream",
      parentCube: "maestro",
      assignedCube: "learn",
      title: "Downstream Task",
      instruction: "Must be skipped",
      dependencies: ["upstream"],
    },
  ]);

  const mockFailingExecutor = async (task: { id: string }) => {
    if (task.id === "upstream") {
      throw new Error("Network socket timeout");
    }
    return "ok";
  };

  const executedPlan = await executeSwarmPlan({
    plan,
    onEvent: (event) => {
      events.push(event);
    },
    executor: mockFailingExecutor,
  });

  assert.equal(executedPlan.status, "failed");
  const upstreamTask = executedPlan.tasks.find((t) => t.id === "upstream");
  const downstreamTask = executedPlan.tasks.find((t) => t.id === "downstream");

  assert.equal(upstreamTask?.status, "failed");
  assert.ok(upstreamTask?.error?.includes("Network socket timeout"));

  assert.equal(downstreamTask?.status, "skipped");
  assert.ok(downstreamTask?.error?.includes("Skipped"));

  const eventTypes = events.map((e) => e.type);
  assert.ok(eventTypes.includes("task_failed"));
  assert.ok(eventTypes.includes("task_skipped"));
  assert.ok(eventTypes.includes("plan_completed"));
});
