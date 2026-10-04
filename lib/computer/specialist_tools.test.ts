import assert from "node:assert/strict";
import test from "node:test";
import {
  parseApplicationsMarkdown,
  formatApplicationsMarkdown,
  recordApplication,
  getApplications,
} from "../specialist/job_hunt.ts";
import {
  parseLedgerCsv,
  formatLedgerCsv,
  calculateBudgetSummary,
  recordTransaction,
} from "../specialist/money_ledger.ts";
import { saveDiagramArtifact } from "../specialist/diagrams.ts";
import { computerTools } from "./tools.ts";

test("Job Hunt: parses, formats, and persists application tracker rows", () => {
  const sampleMarkdown = `# Job Applications Tracker

| Role | Company | Link | Status | Next Step | Date | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| Senior Frontend Eng | Acme Corp | https://acme.com/jobs/123 | Interviewing | Tech Screen on Thursday | 2026-10-04 | React & Next.js 16 |
| AI Systems Engineer | OpenAI Labs | https://openai.com/jobs/456 | Applied | Waiting for recruiter email | 2026-10-03 | LangGraph experience |
`;

  const parsed = parseApplicationsMarkdown(sampleMarkdown);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].role, "Senior Frontend Eng");
  assert.equal(parsed[0].status, "Interviewing");

  const formatted = formatApplicationsMarkdown(parsed);
  assert.ok(formatted.includes("Acme Corp"));
  assert.ok(formatted.includes("OpenAI Labs"));

  // Record application in test workspace
  const updated = recordApplication(
    {
      role: "Staff AI Engineer",
      company: "DeepMind",
      link: "https://deepmind.google/careers",
      status: "Wishlist",
      nextStep: "Reach out to hiring manager",
      date: "2026-10-05",
      notes: "Autonomous agents role",
    },
    "test-job-hunt",
  );

  assert.ok(updated.length >= 1);
  assert.equal(updated[0].company, "DeepMind");

  const fetched = getApplications("test-job-hunt");
  assert.ok(fetched.some((a) => a.company === "DeepMind"));
});

test("Money: parses CSV, records transactions, and computes budget summaries", () => {
  const sampleCsv = `Date,Payee,Category,Amount,Type,Notes
2026-10-01,"Employer Inc","Salary",5000,income,"Monthly paycheck"
2026-10-02,"Landlord LLC","Rent",1800,expense,"Apartment lease"
2026-10-03,"Cloud Services","Dev Tools",100,subscription,"Server hosting"
2026-10-04,"Supermarket","Groceries",200,expense,"Weekly grocery"
`;

  const transactions = parseLedgerCsv(sampleCsv);
  assert.equal(transactions.length, 4);

  const exportedCsv = formatLedgerCsv(transactions);
  assert.ok(exportedCsv.includes("Salary"));
  assert.ok(exportedCsv.includes("Landlord LLC"));

  const summary = calculateBudgetSummary(transactions);
  assert.equal(summary.totalIncome, 5000);
  assert.equal(summary.totalExpenses, 2100);
  assert.equal(summary.netSavings, 2900);
  assert.equal(summary.savingsRatePercent, 58);
  assert.equal(summary.byCategory["Rent"], 1800);
  assert.equal(summary.subscriptions.length, 1);

  // Record a transaction
  const updatedSummary = recordTransaction(
    {
      date: "2026-10-05",
      payee: "Coffee Shop",
      category: "Dining",
      amount: 15,
      type: "expense",
      notes: "Espresso",
    },
    "test-money",
  );

  assert.ok(updatedSummary.totalExpenses >= 15);
});

test("Learn / Work: generates and saves Mermaid diagram artifacts", () => {
  const result = saveDiagramArtifact(
    {
      title: "Agent Architecture Flowchart",
      type: "flowchart",
      mermaidCode: `flowchart TD
  User -->|Prompt| Maestro[Maestro Agent]
  Maestro -->|Handoff| Specialist[Specialist Kube]
  Specialist -->|Execution| Tools[Sandbox Tools]`,
      explanation: "Shows message routing from User to Maestro and Specialist.",
    },
    "test-learn",
    "architecture_flow.mmd",
  );

  assert.ok(result.path.includes("architecture_flow.mmd"));
  assert.ok(result.markdown.includes("flowchart TD"));
});

test("computerTools includes specialist domain tools", () => {
  const tools = computerTools({ slug: "job-hunt", name: "Job hunt", isMaestro: false });
  assert.ok("job_application_track" in tools);
  assert.ok("money_ledger_record" in tools);
  assert.ok("concept_diagram_create" in tools);
});
