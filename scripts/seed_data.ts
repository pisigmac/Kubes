import { db } from "../lib/db.ts";
import { createCube, createThread, saveThreadMessages } from "../lib/cubes/store.ts";
import { createSchedule } from "../lib/computer/schedule.ts";
import { saveMemory } from "../lib/memory/store.ts";

const database = db();
console.log("Connected to database:", database.name);

// Demo Organization 1: Acme Corp (Enterprise Tenant)
const orgAcme = "org-acme-corp";
const userAcme = "user-alice-acme";

// Demo Organization 2: Stellar Dynamics (Startup Tenant)
const orgStellar = "org-stellar-dyn";
const userStellar = "user-bob-stellar";

const tenants = [
  { orgId: orgAcme, userId: userAcme, company: "Acme Corp" },
  { orgId: orgStellar, userId: userStellar, company: "Stellar Dynamics" },
];

for (const tenant of tenants) {
  console.log(`Processing tenant: ${tenant.company} (${tenant.orgId})...`);

  // 1. Create Finance Specialist
  const financeCube = createCube({
    name: `${tenant.company} Finance Specialist`,
    painPoint: "Accounting reconciliation and fiscal quarter tracking",
    instructions: "Track budgets, analyze CSV ledgers, and summarize burn rates.",
    orgId: tenant.orgId,
    userId: tenant.userId,
    scope: tenant.orgId,
  });

  // 2. Create Research Specialist
  const researchCube = createCube({
    name: `${tenant.company} Market Intelligence`,
    painPoint: "Competitive intelligence and automated briefing",
    instructions: "Monitor industry competitors and summarize weekly trends.",
    orgId: tenant.orgId,
    userId: tenant.userId,
    scope: tenant.orgId,
  });

  // 3. Create Sample Thread
  const thread = createThread(financeCube.id, tenant.orgId, tenant.userId);
  saveThreadMessages(
    thread.id,
    [
      {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text: `Review our initial balance sheet for ${tenant.company}.` }],
      },
      {
        id: crypto.randomUUID(),
        role: "assistant",
        parts: [{ type: "text", text: `Understood. Ready to track balance sheets and financial syncs for ${tenant.company}.` }],
      },
    ],
    tenant.orgId,
  );

  // 4. Create Scheduled Monitor
  createSchedule({
    cubeId: financeCube.id,
    cron: "0 9 * * 1-5",
    instruction: `Daily 9:00 AM ${tenant.company} liquidity & cash balance check`,
    orgId: tenant.orgId,
    userId: tenant.userId,
    scope: tenant.orgId,
  });

  // 5. Create Core Memory
  saveMemory({
    cubeSlug: financeCube.slug,
    category: "preference",
    content: `Preferred financial currency is USD, fiscal year ends December 31.`,
    keywords: ["currency", "usd", "fiscal"],
    orgId: tenant.orgId,
    userId: tenant.userId,
    scope: tenant.orgId,
  });

  console.log(`  ✓ Created Cubes: "${financeCube.name}", "${researchCube.name}"`);
  console.log(`  ✓ Created Thread & Schedule for ${tenant.company}`);
}

console.log("✅ Seed completed successfully!");
