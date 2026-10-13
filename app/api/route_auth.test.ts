import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { GET as getCubes, POST as postCubes } from "./cubes/route.ts";
import { GET as getCubeById } from "./cubes/[id]/route.ts";
import { POST as postThreads } from "./threads/route.ts";
import { GET as getThreadById } from "./threads/[id]/route.ts";
import { POST as postSchedules } from "./schedules/route.ts";
import { PATCH as patchScheduleById, DELETE as deleteScheduleById } from "./schedules/[id]/route.ts";
import { GET as getMemories, POST as postMemories } from "./memories/route.ts";
import { GET as getDigests } from "./digests/route.ts";
import { GET as getProviders } from "./providers/route.ts";
import { GET as getModels } from "./models/route.ts";
import type { NextRequest } from "next/server";

test("HTTP Route Auth & Tenancy Integration: verifies 401, 403, and cross-tenant isolation", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-route-key";
  publicJwk.alg = "RS256";

  process.env.AUTH_MODE = "deskid";
  process.env.DESKID_PUBLIC_KEY = JSON.stringify(publicJwk);

  try {
    async function makeToken(claims: { org_id?: string; roles?: string[]; sub?: string }) {
      return await new SignJWT({
        org_id: claims.org_id,
        roles: { kubes: claims.roles || ["editor"] },
      })
        .setProtectedHeader({ alg: "RS256", kid: "test-route-key" })
        .setSubject(claims.sub || "test-user")
        .setAudience("kubes")
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(privateKey);
    }

    const orgAlpha = `org-alpha-${Date.now()}`;
    const orgBeta = `org-beta-${Date.now()}`;

    const tokenAlpha = await makeToken({ org_id: orgAlpha, roles: ["editor"], sub: "user-alpha" });
    const tokenAlphaViewer = await makeToken({ org_id: orgAlpha, roles: ["viewer"], sub: "user-alpha-viewer" });
    const tokenBeta = await makeToken({ org_id: orgBeta, roles: ["editor"], sub: "user-beta" });

    // 1. Missing token returns 401
    const unauthReq = new Request("http://localhost/api/cubes", { method: "GET" });
    const unauthRes = await getCubes(unauthReq);
    assert.equal(unauthRes.status, 401);

    // 2. Tampered token returns 401
    const badTokenReq = new Request("http://localhost/api/cubes", {
      method: "GET",
      headers: { authorization: "Bearer invalid.token.payload" },
    });
    const badTokenRes = await getCubes(badTokenReq);
    assert.equal(badTokenRes.status, 401);

    // 3. Viewer role attempting POST /api/cubes returns 403 Forbidden
    const viewerReq = new Request("http://localhost/api/cubes", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenAlphaViewer}` },
      body: JSON.stringify({ name: "Viewer Forbidden Cube", painPoint: "testing", instructions: "none" }),
    });
    const viewerRes = await postCubes(viewerReq);
    assert.equal(viewerRes.status, 403);

    // 4. Editor in Org Alpha creating a Cube returns 201 Created
    const createReq = new Request("http://localhost/api/cubes", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenAlpha}` },
      body: JSON.stringify({ name: "Alpha Financial Specialist", painPoint: "finance", instructions: "confidential" }),
    });
    const createRes = await postCubes(createReq);
    assert.equal(createRes.status, 201);
    const { cube: createdCube } = (await createRes.json()) as { cube: { id: string; slug: string; orgId: string } };
    assert.equal(createdCube.orgId, orgAlpha);

    // 5. Cross-tenant GET /api/cubes/[id]: Org Beta gets 404 Not Found for Org Alpha's cube
    const crossGetReq = new Request(`http://localhost/api/cubes/${createdCube.id}`, {
      method: "GET",
      headers: { authorization: `Bearer ${tokenBeta}` },
    });
    const crossGetRes = await getCubeById(crossGetReq, { params: Promise.resolve({ id: createdCube.id }) });
    assert.equal(crossGetRes.status, 404);

    // 6. Authorized GET /api/cubes/[id]: Org Alpha gets 200 OK
    const authGetReq = new Request(`http://localhost/api/cubes/${createdCube.id}`, {
      method: "GET",
      headers: { authorization: `Bearer ${tokenAlpha}` },
    });
    const authGetRes = await getCubeById(authGetReq, { params: Promise.resolve({ id: createdCube.id }) });
    assert.equal(authGetRes.status, 200);

    // 7. Threads API: Org Alpha creates a thread
    const threadReq = new Request("http://localhost/api/threads", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenAlpha}` },
      body: JSON.stringify({ cubeId: createdCube.id }),
    });
    const threadRes = await postThreads(threadReq);
    assert.equal(threadRes.status, 201);
    const { thread: createdThread } = (await threadRes.json()) as { thread: { id: string; orgId: string } };
    assert.equal(createdThread.orgId, orgAlpha);

    // 8. Cross-tenant Threads GET /api/threads/[id]: Org Beta gets 404
    const crossThreadReq = new Request(`http://localhost/api/threads/${createdThread.id}`, {
      method: "GET",
      headers: { authorization: `Bearer ${tokenBeta}` },
    });
    const crossThreadRes = await getThreadById(crossThreadReq, { params: Promise.resolve({ id: createdThread.id }) });
    assert.equal(crossThreadRes.status, 404);

    // 9. Schedules API: Viewer role attempting to schedule returns 403 Forbidden
    const viewerSchedReq = new Request("http://localhost/api/schedules", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenAlphaViewer}` },
      body: JSON.stringify({ cubeId: createdCube.id, cron: "0 9 * * *", instruction: "run daily" }),
    });
    const viewerSchedRes = await postSchedules(viewerSchedReq);
    assert.equal(viewerSchedRes.status, 403);

    // 10. Schedules API: Editor creates schedule
    const createSchedReq = new Request("http://localhost/api/schedules", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenAlpha}` },
      body: JSON.stringify({ cubeId: createdCube.id, cron: "0 9 * * *", instruction: "run daily" }),
    });
    const createSchedRes = await postSchedules(createSchedReq);
    assert.equal(createSchedRes.status, 201);
    const { schedule: createdSchedule } = (await createSchedRes.json()) as { schedule: { id: string } };

    // 11. Cross-tenant Schedule PATCH /api/schedules/[id]: Org Beta cannot update Org Alpha schedule
    const crossPatchReq = new Request(`http://localhost/api/schedules/${createdSchedule.id}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${tokenBeta}` },
      body: JSON.stringify({ instruction: "hijacked task" }),
    });
    const crossPatchRes = await patchScheduleById(crossPatchReq, { params: Promise.resolve({ id: createdSchedule.id }) });
    assert.equal(crossPatchRes.status, 400);

    // 12. Cross-tenant Schedule DELETE /api/schedules/[id]: Org Beta cannot delete Org Alpha schedule
    const crossDelReq = new Request(`http://localhost/api/schedules/${createdSchedule.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${tokenBeta}` },
    });
    const crossDelRes = await deleteScheduleById(crossDelReq, { params: Promise.resolve({ id: createdSchedule.id }) });
    assert.equal(crossDelRes.status, 400);

    // 13. Memories API: Viewer role cannot POST memory (403)
    const viewerMemReq = new Request("http://localhost/api/memories", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenAlphaViewer}` },
      body: JSON.stringify({ cubeSlug: "finance", content: "secret memo" }),
    });
    const viewerMemRes = await postMemories(viewerMemReq as unknown as NextRequest);
    assert.equal(viewerMemRes.status, 403);

    // 14. Memories API: Editor in Org Alpha creates memory (201)
    const createMemReq = new Request("http://localhost/api/memories", {
      method: "POST",
      headers: { authorization: `Bearer ${tokenAlpha}` },
      body: JSON.stringify({ cubeSlug: "finance", content: "secret alpha memo" }),
    });
    const createMemRes = await postMemories(createMemReq as unknown as NextRequest);
    assert.equal(createMemRes.status, 201);

    // 15. Cross-tenant Memories GET: Org Beta sees 0 memories
    const crossMemReq = new Request("http://localhost/api/memories", {
      method: "GET",
      headers: { authorization: `Bearer ${tokenBeta}` },
    });
    const crossMemRes = await getMemories(crossMemReq as unknown as NextRequest);
    assert.equal(crossMemRes.status, 200);
    const { memories: betaMemories } = (await crossMemRes.json()) as { memories: unknown[] };
    assert.equal(betaMemories.length, 0);

    // 16. Unauthenticated requests to Providers, Models, Digests return 401
    const unauthDigReq = new Request("http://localhost/api/digests", { method: "GET" });
    assert.equal((await getDigests(unauthDigReq)).status, 401);

    const unauthProvReq = new Request("http://localhost/api/providers", { method: "GET" });
    assert.equal((await getProviders(unauthProvReq)).status, 401);

    const unauthModReq = new Request("http://localhost/api/models", { method: "GET" });
    assert.equal((await getModels(unauthModReq)).status, 401);

    // 17. Authenticated viewer can access Providers, Models, Digests (200)
    const authDigReq = new Request("http://localhost/api/digests", {
      method: "GET",
      headers: { authorization: `Bearer ${tokenAlphaViewer}` },
    });
    assert.equal((await getDigests(authDigReq)).status, 200);

    const authProvReq = new Request("http://localhost/api/providers", {
      method: "GET",
      headers: { authorization: `Bearer ${tokenAlphaViewer}` },
    });
    assert.equal((await getProviders(authProvReq)).status, 200);

    const authModReq = new Request("http://localhost/api/models", {
      method: "GET",
      headers: { authorization: `Bearer ${tokenAlphaViewer}` },
    });
    assert.equal((await getModels(authModReq)).status, 200);
  } finally {
    delete process.env.AUTH_MODE;
    delete process.env.DESKID_PUBLIC_KEY;
  }
});

