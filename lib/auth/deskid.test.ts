import assert from "node:assert/strict";
import test from "node:test";
import {
  getAuthMode,
  getScopedWorkspacePath,
  hasRequiredRole,
  validateDeskIDToken,
} from "./deskid.ts";

function createMockJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = "mock_signature";
  return `${header}.${body}.${signature}`;
}

test("DeskID adapter: auth mode defaults to none", () => {
  delete process.env.AUTH_MODE;
  assert.equal(getAuthMode(), "none");

  process.env.AUTH_MODE = "deskid";
  assert.equal(getAuthMode(), "deskid");
  delete process.env.AUTH_MODE;
});

test("DeskID adapter: validates valid JWT with claims", async () => {
  const future = Math.floor(Date.now() / 1000) + 3600;
  const token = createMockJwt({
    sub: "user-123",
    email: "dev@kubes.ai",
    org_id: "org-alpha",
    roles: { kubes: ["admin", "editor"] },
    exp: future,
  });

  const res = await validateDeskIDToken(token);
  assert.equal(res.valid, true);
  assert.equal(res.claims?.sub, "user-123");
  assert.equal(res.claims?.org_id, "org-alpha");
  assert.equal(hasRequiredRole(res.claims!, "admin"), true);
  assert.equal(hasRequiredRole(res.claims!, "editor"), true);
});

test("DeskID adapter: rejects expired token", async () => {
  const past = Math.floor(Date.now() / 1000) - 3600;
  const token = createMockJwt({
    sub: "user-456",
    exp: past,
  });

  const res = await validateDeskIDToken(token);
  assert.equal(res.valid, false);
  assert.equal(res.error, "Token has expired");
});

test("DeskID adapter: scopes workspace path per organization", () => {
  const defaultPath = getScopedWorkspacePath("default", "work");
  assert.ok(defaultPath.includes("cubes/work") || defaultPath.includes("cubes\\work"));

  const orgPath = getScopedWorkspacePath("tenant-xyz", "focus");
  assert.ok(orgPath.includes("orgs/tenant-xyz/cubes/focus") || orgPath.includes("orgs\\tenant-xyz\\cubes\\focus"));
});
