import test from "node:test";
import assert from "node:assert/strict";
import {
  createSwarmPlan,
  validateSwarmPlan,
  hasDependencyCycle,
  getExecutionBatches,
  getReadyTasks,
  updateTaskStatus,
  isPlanCompleted,
  type SwarmPlan,
  type SwarmTask,
} from "./swarm.ts";

test("Swarm: validateSwarmPlan verifies correct plan structure", () => {
  const plan: SwarmPlan = {
    id: "plan-1",
    rootObjective: "Relocation analysis",
    orgId: "org-test",
    status: "planning",
    createdAt: new Date().toISOString(),
    tasks: [
      {
        id: "t-1",
        parentCube: "maestro",
        assignedCube: "job-hunt",
        title: "Search AI roles",
        instruction: "Find Senior AI Engineer positions",
        dependencies: [],
        status: "pending",
      },
      {
        id: "t-2",
        parentCube: "maestro",
        assignedCube: "money",
        title: "Calculate budget",
        instruction: "Calculate living cost",
        dependencies: ["t-1"],
        status: "pending",
      },
    ],
  };

  const result = validateSwarmPlan(plan);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("Swarm: validateSwarmPlan detects invalid fields and missing dependencies", () => {
  const invalidPlan: SwarmPlan = {
    id: "",
    rootObjective: "",
    orgId: "org-test",
    status: "planning",
    createdAt: new Date().toISOString(),
    tasks: [
      {
        id: "t-1",
        parentCube: "maestro",
        assignedCube: "",
        title: "Task 1",
        instruction: "",
        dependencies: ["ghost-task"],
        status: "pending",
      },
      {
        id: "t-1", // duplicate id
        parentCube: "maestro",
        assignedCube: "money",
        title: "Task 2",
        instruction: "Do math",
        dependencies: ["t-1"], // self dependency
        status: "pending",
      },
    ],
  };

  const result = validateSwarmPlan(invalidPlan);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 4);
});

test("Swarm: hasDependencyCycle detects cycles in DAG", () => {
  // Direct cycle: A -> B -> A
  const directCycleTasks: SwarmTask[] = [
    {
      id: "a",
      parentCube: "maestro",
      assignedCube: "work",
      title: "A",
      instruction: "Do A",
      dependencies: ["b"],
      status: "pending",
    },
    {
      id: "b",
      parentCube: "maestro",
      assignedCube: "work",
      title: "B",
      instruction: "Do B",
      dependencies: ["a"],
      status: "pending",
    },
  ];
  assert.equal(hasDependencyCycle(directCycleTasks), true);

  // Indirect cycle: A -> B -> C -> A
  const indirectCycleTasks: SwarmTask[] = [
    {
      id: "a",
      parentCube: "maestro",
      assignedCube: "work",
      title: "A",
      instruction: "Do A",
      dependencies: ["c"],
      status: "pending",
    },
    {
      id: "b",
      parentCube: "maestro",
      assignedCube: "work",
      title: "B",
      instruction: "Do B",
      dependencies: ["a"],
      status: "pending",
    },
    {
      id: "c",
      parentCube: "maestro",
      assignedCube: "work",
      title: "C",
      instruction: "Do C",
      dependencies: ["b"],
      status: "pending",
    },
  ];
  assert.equal(hasDependencyCycle(indirectCycleTasks), true);

  // Acyclic diamond graph
  const acyclicDiamond: SwarmTask[] = [
    {
      id: "start",
      parentCube: "maestro",
      assignedCube: "work",
      title: "Start",
      instruction: "Init",
      dependencies: [],
      status: "pending",
    },
    {
      id: "branch-1",
      parentCube: "maestro",
      assignedCube: "job-hunt",
      title: "Branch 1",
      instruction: "Sub 1",
      dependencies: ["start"],
      status: "pending",
    },
    {
      id: "branch-2",
      parentCube: "maestro",
      assignedCube: "money",
      title: "Branch 2",
      instruction: "Sub 2",
      dependencies: ["start"],
      status: "pending",
    },
    {
      id: "join",
      parentCube: "maestro",
      assignedCube: "learn",
      title: "Join",
      instruction: "Synthesize",
      dependencies: ["branch-1", "branch-2"],
      status: "pending",
    },
  ];
  assert.equal(hasDependencyCycle(acyclicDiamond), false);
});

test("Swarm: getExecutionBatches groups tasks topologically into parallel stages", () => {
  const diamondTasks: SwarmTask[] = [
    {
      id: "start",
      parentCube: "maestro",
      assignedCube: "work",
      title: "Start",
      instruction: "Init",
      dependencies: [],
      status: "pending",
    },
    {
      id: "branch-1",
      parentCube: "maestro",
      assignedCube: "job-hunt",
      title: "Branch 1",
      instruction: "Sub 1",
      dependencies: ["start"],
      status: "pending",
    },
    {
      id: "branch-2",
      parentCube: "maestro",
      assignedCube: "money",
      title: "Branch 2",
      instruction: "Sub 2",
      dependencies: ["start"],
      status: "pending",
    },
    {
      id: "join",
      parentCube: "maestro",
      assignedCube: "learn",
      title: "Join",
      instruction: "Synthesize",
      dependencies: ["branch-1", "branch-2"],
      status: "pending",
    },
  ];

  const batches = getExecutionBatches(diamondTasks);
  assert.equal(batches.length, 3);

  // Batch 0 has [start]
  assert.equal(batches[0].length, 1);
  assert.equal(batches[0][0].id, "start");

  // Batch 1 has [branch-1, branch-2] in parallel
  assert.equal(batches[1].length, 2);
  const batch1Ids = batches[1].map((t) => t.id).sort();
  assert.deepEqual(batch1Ids, ["branch-1", "branch-2"]);

  // Batch 2 has [join]
  assert.equal(batches[2].length, 1);
  assert.equal(batches[2][0].id, "join");
});

test("Swarm: getReadyTasks identifies tasks ready for concurrent execution", () => {
  const plan = createSwarmPlan("Test objective", [
    {
      id: "t1",
      parentCube: "maestro",
      assignedCube: "job-hunt",
      title: "Job Task",
      instruction: "Find jobs",
      dependencies: [],
    },
    {
      id: "t2",
      parentCube: "maestro",
      assignedCube: "money",
      title: "Money Task",
      instruction: "Calc budget",
      dependencies: [],
    },
    {
      id: "t3",
      parentCube: "maestro",
      assignedCube: "learn",
      title: "Diagram Task",
      instruction: "Render diagram",
      dependencies: ["t1", "t2"],
    },
  ]);

  // Initially, t1 and t2 have 0 dependencies and are ready
  let ready = getReadyTasks(plan);
  assert.equal(ready.length, 2);
  assert.deepEqual(
    ready.map((t) => t.id).sort(),
    ["t1", "t2"]
  );

  // When t1 completes, t3 is still waiting for t2
  const updated1 = updateTaskStatus(plan, "t1", { status: "completed", output: "Jobs found" });
  ready = getReadyTasks(updated1);
  assert.equal(ready.length, 1);
  assert.equal(ready[0].id, "t2");

  // When t2 also completes, t3 becomes ready
  const updated2 = updateTaskStatus(updated1, "t2", { status: "completed", output: "Budget computed" });
  ready = getReadyTasks(updated2);
  assert.equal(ready.length, 1);
  assert.equal(ready[0].id, "t3");
});

test("Swarm: updateTaskStatus cascades failure to skip downstream dependents", () => {
  const plan = createSwarmPlan("Cascade failure test", [
    {
      id: "root",
      parentCube: "maestro",
      assignedCube: "work",
      title: "Root Task",
      instruction: "Do root",
      dependencies: [],
    },
    {
      id: "child-1",
      parentCube: "maestro",
      assignedCube: "job-hunt",
      title: "Child 1",
      instruction: "Needs root",
      dependencies: ["root"],
    },
    {
      id: "grandchild",
      parentCube: "maestro",
      assignedCube: "money",
      title: "Grandchild",
      instruction: "Needs child 1",
      dependencies: ["child-1"],
    },
  ]);

  // Mark root as failed
  const failedPlan = updateTaskStatus(plan, "root", {
    status: "failed",
    error: "API connection timed out",
  });

  assert.equal(failedPlan.tasks.find((t) => t.id === "root")?.status, "failed");
  assert.equal(failedPlan.tasks.find((t) => t.id === "child-1")?.status, "skipped");
  assert.equal(failedPlan.tasks.find((t) => t.id === "grandchild")?.status, "skipped");
  assert.equal(failedPlan.status, "failed");
  assert.equal(isPlanCompleted(failedPlan), true);
});

test("Swarm: createSwarmPlan throws on invalid plan definition", () => {
  assert.throws(
    () => {
      createSwarmPlan("Cyclic plan", [
        {
          id: "a",
          parentCube: "maestro",
          assignedCube: "work",
          title: "A",
          instruction: "Do A",
          dependencies: ["b"],
        },
        {
          id: "b",
          parentCube: "maestro",
          assignedCube: "work",
          title: "B",
          instruction: "Do B",
          dependencies: ["a"],
        },
      ]);
    },
    {
      message: /Cycle detected/,
    }
  );
});
