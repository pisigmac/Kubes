import test from "node:test";
import assert from "node:assert/strict";
import {
  inferArtifactKind,
  extractArtifactLinks,
  buildSynthesisPrompt,
  parseActionItems,
  generateFallbackSynthesis,
  synthesizeSwarmPlan,
} from "./synthesizer.ts";
import type { SwarmPlan, SwarmTask } from "./swarm.ts";

test("Synthesizer: inferArtifactKind identifies correct file categories", () => {
  assert.equal(inferArtifactKind("docs/architecture.mmd"), "diagram");
  assert.equal(inferArtifactKind("system_diagram.mermaid"), "diagram");
  assert.equal(inferArtifactKind("budget.csv"), "csv");
  assert.equal(inferArtifactKind("ledger.xlsx"), "csv");
  assert.equal(inferArtifactKind("server.ts"), "code");
  assert.equal(inferArtifactKind("config.json"), "code");
  assert.equal(inferArtifactKind("notes.md"), "markdown");
  assert.equal(inferArtifactKind("briefing.txt"), "markdown");
  assert.equal(inferArtifactKind("report.pdf"), "document");
});

test("Synthesizer: extractArtifactLinks extracts metadata and inline output paths without duplicates", () => {
  const tasks: SwarmTask[] = [
    {
      id: "task-1",
      parentCube: "maestro",
      assignedCube: "money",
      title: "Cost Analysis",
      instruction: "Compute living costs",
      status: "completed",
      artifactPaths: ["data/budget.csv", "data/summary.md"],
      dependencies: [],
      output: "Calculated costs and saved data/budget.csv. Also wrote `notes/breakdown.md` for review.",
    },
    {
      id: "task-2",
      parentCube: "maestro",
      assignedCube: "learn",
      title: "System Architecture",
      instruction: "Generate diagram",
      status: "completed",
      artifactPaths: ["diagrams/arch.mmd"],
      dependencies: [],
      output: "Created architecture.mmd with Mermaid graph.",
    },
  ];

  const artifacts = extractArtifactLinks(tasks);
  assert.equal(artifacts.length, 5);

  const paths = artifacts.map((a) => a.path);
  assert.ok(paths.includes("data/budget.csv"));
  assert.ok(paths.includes("data/summary.md"));
  assert.ok(paths.includes("notes/breakdown.md"));
  assert.ok(paths.includes("diagrams/arch.mmd"));
  assert.ok(paths.includes("architecture.mmd"));

  const budget = artifacts.find((a) => a.path === "data/budget.csv");
  assert.equal(budget?.kind, "csv");
  assert.equal(budget?.specialist, "money");

  const arch = artifacts.find((a) => a.path === "diagrams/arch.mmd");
  assert.equal(arch?.kind, "diagram");
  assert.equal(arch?.specialist, "learn");
});

test("Synthesizer: buildSynthesisPrompt includes completed, failed, and skipped tasks", () => {
  const tasks: SwarmTask[] = [
    {
      id: "task-1",
      parentCube: "maestro",
      assignedCube: "job-hunt",
      title: "Berlin AI Roles",
      instruction: "Find senior roles",
      status: "completed",
      dependencies: [],
      output: "Found 12 Senior AI roles in Berlin.",
    },
    {
      id: "task-2",
      parentCube: "maestro",
      assignedCube: "money",
      title: "Tax Bracket Calc",
      instruction: "Estimate taxes",
      status: "failed",
      dependencies: [],
      error: "Tax calculator service timeout.",
    },
    {
      id: "task-3",
      parentCube: "maestro",
      assignedCube: "work",
      title: "Contract Negotiation",
      instruction: "Prepare contract terms",
      status: "skipped",
      dependencies: ["task-2"],
    },
  ];

  const artifacts = extractArtifactLinks(tasks);
  const prompt = buildSynthesisPrompt("Relocation to Berlin", tasks, artifacts);

  assert.ok(prompt.includes("Relocation to Berlin"));
  assert.ok(prompt.includes("[JOB-HUNT] Berlin AI Roles"));
  assert.ok(prompt.includes("Found 12 Senior AI roles"));
  assert.ok(prompt.includes("Failed Sub-Tasks"));
  assert.ok(prompt.includes("Tax calculator service timeout"));
  assert.ok(prompt.includes("Skipped Sub-Tasks"));
  assert.ok(prompt.includes("Contract Negotiation"));
});

test("Synthesizer: parseActionItems correctly parses checklist items", () => {
  const sampleSynthesis = `## Executive Summary
All tasks ran successfully.

## Action Items & Next Steps
- [ ] Review the generated job tracker at data/tracker.csv
- [ ] Schedule interview prep for Friday
1. Confirm apartment lease deposit
* Follow up with German embassy`;

  const items = parseActionItems(sampleSynthesis);
  assert.equal(items.length, 4);
  assert.equal(items[0], "Review the generated job tracker at data/tracker.csv");
  assert.equal(items[1], "Schedule interview prep for Friday");
  assert.equal(items[2], "Confirm apartment lease deposit");
  assert.equal(items[3], "Follow up with German embassy");
});

test("Synthesizer: generateFallbackSynthesis produces structured markdown with deliverable links", () => {
  const tasks: SwarmTask[] = [
    {
      id: "task-1",
      parentCube: "maestro",
      assignedCube: "money",
      title: "Cost of Living",
      instruction: "Calculate budget",
      status: "completed",
      dependencies: [],
      output: "Monthly living estimate is 3,200 EUR.",
      artifactPaths: ["reports/budget.csv"],
    },
  ];

  const artifacts = extractArtifactLinks(tasks);
  const fallback = generateFallbackSynthesis("Berlin Move", tasks, artifacts);

  assert.ok(fallback.markdown.includes("# Executive Swarm Briefing: Berlin Move"));
  assert.ok(fallback.markdown.includes("Monthly living estimate is 3,200 EUR."));
  assert.ok(fallback.markdown.includes("budget.csv"));
  assert.equal(fallback.artifacts.length, 1);
  assert.ok(fallback.actionItems.length > 0);
});

test("Synthesizer: synthesizeSwarmPlan returns early error briefing when no tasks completed", async () => {
  const plan: SwarmPlan = {
    id: "plan-failed",
    rootObjective: "Test Failure",
    orgId: "org-1",
    tasks: [
      {
        id: "task-1",
        parentCube: "maestro",
        assignedCube: "work",
        title: "Work Task",
        instruction: "Do work",
        dependencies: [],
        status: "failed",
        error: "Fatal execution failure",
      },
    ],
    status: "failed",
    createdAt: new Date().toISOString(),
  };

  const result = await synthesizeSwarmPlan(plan);
  assert.ok(result.markdown.includes("All sub-tasks failed or were skipped"));
  assert.equal(result.findings.length, 0);
});

test("Synthesizer: synthesizeSwarmPlan executes custom executor and appends deliverables", async () => {
  const plan: SwarmPlan = {
    id: "plan-success",
    rootObjective: "Relocation to Berlin",
    orgId: "org-1",
    tasks: [
      {
        id: "task-1",
        parentCube: "maestro",
        assignedCube: "job-hunt",
        title: "Senior AI Roles",
        instruction: "Find jobs",
        dependencies: [],
        status: "completed",
        output: "Found 10 roles in Berlin.",
        artifactPaths: ["data/jobs.csv"],
      },
    ],
    status: "running",
    createdAt: new Date().toISOString(),
  };

  const mockExecutor = async (_task: SwarmTask, prompt: string): Promise<string> => {
    assert.ok(prompt.includes("Relocation to Berlin"));
    return `## Executive Summary\nStrong job market in Berlin.\n\n## Action Items\n- [ ] Apply to top 3 roles`;
  };

  const result = await synthesizeSwarmPlan(plan, { executor: mockExecutor });
  assert.ok(result.markdown.includes("Strong job market in Berlin"));
  assert.ok(result.markdown.includes("jobs.csv"));
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.actionItems[0], "Apply to top 3 roles");
});
