import assert from "node:assert/strict";
import test from "node:test";
import { createCube, getCube, listCubes, createThread, listThreads, saveThreadMessages, getMessages } from "../cubes/store.ts";
import { getScopedWorkspacePath } from "./deskid.ts";

test("Multi-Tenancy Isolation: Cubes and Threads are strictly isolated across org_id boundaries", () => {
  const orgAlpha = `org-alpha-${Date.now()}`;
  const orgBeta = `org-beta-${Date.now()}`;

  // 1. Create a specialized cube in Org Alpha
  const cubeAlpha = createCube({
    name: "Alpha Secret Specialist",
    painPoint: "Confidential strategy",
    instructions: "Do not disclose Alpha financial data",
    orgId: orgAlpha,
    userId: "user-alpha-1",
  });

  assert.equal(cubeAlpha.orgId, orgAlpha);
  assert.equal(cubeAlpha.userId, "user-alpha-1");

  // 2. Query cubes for Org Beta
  const betaCubes = listCubes(orgBeta);
  assert.equal(betaCubes.some((c) => c.id === cubeAlpha.id), false);

  // 3. Attempt direct cross-tenant getCube access
  const crossTenantCube = getCube(cubeAlpha.id, orgBeta);
  assert.equal(crossTenantCube, undefined);

  // 4. Authorized query in Org Alpha
  const authorizedCube = getCube(cubeAlpha.id, orgAlpha);
  assert.ok(authorizedCube);
  assert.equal(authorizedCube.name, "Alpha Secret Specialist");

  // 5. Create a thread in Org Alpha
  const threadAlpha = createThread(cubeAlpha.id, orgAlpha, "user-alpha-1");
  assert.equal(threadAlpha.orgId, orgAlpha);

  saveThreadMessages(threadAlpha.id, [
    {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: "Alpha confidential message" }],
    },
  ], orgAlpha);

  const messagesAlpha = getMessages(threadAlpha.id, orgAlpha);
  assert.equal(messagesAlpha.length, 1);
  assert.equal(messagesAlpha[0].parts[0].type === "text" && messagesAlpha[0].parts[0].text, "Alpha confidential message");

  // 6. Cross-tenant getMessages isolation (Org Beta cannot read Org Alpha thread messages)
  const messagesBeta = getMessages(threadAlpha.id, orgBeta);
  assert.equal(messagesBeta.length, 0);

  // 7. Cross-tenant saveThreadMessages isolation (Org Beta cannot overwrite Org Alpha thread messages)
  assert.throws(() => {
    saveThreadMessages(threadAlpha.id, [
      { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text: "Malicious overwrite" }] },
    ], orgBeta);
  }, /Thread not found/);

  // 8. Cross-tenant thread listing check
  const alphaThreads = listThreads(cubeAlpha.id, orgAlpha);
  assert.ok(alphaThreads.some((t) => t.id === threadAlpha.id));

  // 9. Cross-tenant thread reading check (fails closed with 404)
  assert.throws(() => listThreads(cubeAlpha.id, orgBeta), /Cube not found/);

  // 10. ResourceScope object interface test
  const scopeAlpha = { orgId: orgAlpha, userId: "user-alpha-1", roles: ["editor"] };
  const scopedCube = getCube(cubeAlpha.id, scopeAlpha);
  assert.ok(scopedCube);
  assert.equal(scopedCube.id, cubeAlpha.id);

  // 11. Scoped workspace path separation
  const pathAlpha = getScopedWorkspacePath(orgAlpha, "secret-cube");
  const pathBeta = getScopedWorkspacePath(orgBeta, "secret-cube");

  assert.ok(pathAlpha.includes(orgAlpha));
  assert.ok(pathBeta.includes(orgBeta));
  assert.notEqual(pathAlpha, pathBeta);
});

test("Jail Filesystem & Workspace Isolation: separate directories for tenants", async () => {
  const { ownRoot, ensureWorkspace } = await import("../computer/jail.ts");
  const org1 = `org-unit-1-${Date.now()}`;
  const org2 = `org-unit-2-${Date.now()}`;

  const root1 = ownRoot("finance-cube", false, org1);
  const root2 = ownRoot("finance-cube", false, org2);

  assert.ok(root1.includes(org1));
  assert.ok(root2.includes(org2));
  assert.notEqual(root1, root2);

  const ws1 = ensureWorkspace("finance-cube", false, org1);
  const ws2 = ensureWorkspace("finance-cube", false, org2);
  assert.notEqual(ws1, ws2);
});

test("DeskID requireAuth: fails closed in DeskID mode when request or token is missing", async () => {
  const { requireAuth } = await import("./deskid.ts");
  process.env.AUTH_MODE = "deskid";
  try {
    // Missing request object
    await assert.rejects(() => requireAuth(), /Request context required/);

    // Request missing token
    const emptyReq = new Request("http://localhost/api/cubes");
    await assert.rejects(() => requireAuth(emptyReq), /authentication token required/);
  } finally {
    delete process.env.AUTH_MODE;
  }
});

test("RBAC & Role Enforcement: assertRole properly restricts role boundaries", async () => {
  const { assertRole, requireAuth } = await import("./deskid.ts");

  // Local mode bypass
  const localAuth = await requireAuth();
  assert.doesNotThrow(() => assertRole(localAuth, "admin"));
  assert.doesNotThrow(() => assertRole(localAuth, "editor"));
  assert.doesNotThrow(() => assertRole(localAuth, "viewer"));

  // DeskID mode RBAC
  const viewerAuth = {
    mode: "deskid" as const,
    userId: "user-v",
    orgId: "org-test",
    roles: ["viewer"],
  };

  assert.doesNotThrow(() => assertRole(viewerAuth, "viewer"));
  assert.throws(() => assertRole(viewerAuth, "editor"), /Forbidden: 'editor' role required/);
  assert.throws(() => assertRole(viewerAuth, "admin"), /Forbidden: 'admin' role required/);

  const editorAuth = {
    mode: "deskid" as const,
    userId: "user-e",
    orgId: "org-test",
    roles: ["editor"],
  };

  assert.doesNotThrow(() => assertRole(editorAuth, "viewer"));
  assert.doesNotThrow(() => assertRole(editorAuth, "editor"));
  assert.throws(() => assertRole(editorAuth, "admin"), /Forbidden: 'admin' role required/);

  const adminAuth = {
    mode: "deskid" as const,
    userId: "user-a",
    orgId: "org-test",
    roles: ["admin"],
  };

  assert.doesNotThrow(() => assertRole(adminAuth, "viewer"));
  assert.doesNotThrow(() => assertRole(adminAuth, "editor"));
  assert.doesNotThrow(() => assertRole(adminAuth, "admin"));
});


