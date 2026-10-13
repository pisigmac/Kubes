import assert from "node:assert/strict";
import test from "node:test";
import { POST as postSwarm } from "./swarm/route.ts";

test("API Swarm Route: validates request body and returns 400 for empty payload", async () => {
  const req = new Request("http://localhost/api/swarm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  const res = await postSwarm(req);
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.ok(json.error.includes("Either 'plan' or 'objective'"));
});

test("API Swarm Route: rejects invalid SwarmPlan with 400", async () => {
  const req = new Request("http://localhost/api/swarm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      plan: {
        id: "plan-bad",
        rootObjective: "Test",
        tasks: [], // empty tasks
      },
    }),
  });

  const res = await postSwarm(req);
  assert.equal(res.status, 400);
  const json = await res.json();
  assert.ok(json.error.includes("Invalid SwarmPlan"));
});
