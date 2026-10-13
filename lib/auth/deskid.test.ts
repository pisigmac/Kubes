import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import {
  getAuthMode,
  getScopedWorkspacePath,
  hasRequiredRole,
  validateDeskIDToken,
} from "./deskid.ts";

test("DeskID adapter: auth mode defaults to none", () => {
  delete process.env.AUTH_MODE;
  assert.equal(getAuthMode(), "none");

  process.env.AUTH_MODE = "deskid";
  assert.equal(getAuthMode(), "deskid");
  delete process.env.AUTH_MODE;
});

test("DeskID adapter: cryptographically validates genuine RS256 signed JWTs", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-key-1";
  publicJwk.alg = "RS256";

  const token = await new SignJWT({
    email: "alice@acme.corp",
    org_id: "org-acme-77",
    roles: { kubes: ["admin", "editor"] },
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
    .setSubject("user-alice-1")
    .setIssuer("https://auth.desk.id")
    .setAudience("kubes")
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(privateKey);

  const res = await validateDeskIDToken(token, {
    jwks: { keys: [publicJwk] },
    issuer: "https://auth.desk.id",
    audience: "kubes",
  });

  assert.equal(res.valid, true);
  assert.equal(res.claims?.sub, "user-alice-1");
  assert.equal(res.claims?.org_id, "org-acme-77");
  assert.equal(res.claims?.email, "alice@acme.corp");
  assert.equal(hasRequiredRole(res.claims!, "admin"), true);
  assert.equal(hasRequiredRole(res.claims!, "editor"), true);
});

test("DeskID adapter: REJECTS forged / tampered token payload", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = "test-key-1";

  // Create valid token
  const validToken = await new SignJWT({
    org_id: "org-viewer",
    roles: { kubes: ["viewer"] },
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key-1" })
    .setSubject("user-normal")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  // Attacker attempts to modify payload to forge admin role
  const parts = validToken.split(".");
  const forgedPayload = Buffer.from(
    JSON.stringify({
      sub: "user-normal",
      org_id: "org-victim",
      roles: { kubes: ["admin"] },
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url");

  const tamperedToken = `${parts[0]}.${forgedPayload}.${parts[2]}`;

  const res = await validateDeskIDToken(tamperedToken, {
    jwks: { keys: [publicJwk] },
    audience: undefined,
  });

  assert.equal(res.valid, false);
  assert.ok(res.error?.includes("signature") || res.error?.includes("verification"));
});

test("DeskID adapter: REJECTS expired token", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);

  const token = await new SignJWT({ org_id: "org-1" })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject("user-expired")
    .setAudience("kubes")
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(privateKey);

  const res = await validateDeskIDToken(token, {
    jwks: { keys: [publicJwk] },
    audience: "kubes",
  });

  assert.equal(res.valid, false);
  assert.ok(res.error?.toLowerCase().includes("exp") || res.error?.toLowerCase().includes("expired"));
});

test("DeskID adapter: REJECTS token with mismatched issuer or audience", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);

  const token = await new SignJWT({ org_id: "org-1" })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject("user-1")
    .setIssuer("https://malicious-issuer.com")
    .setAudience("different-app")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  const res = await validateDeskIDToken(token, {
    jwks: { keys: [publicJwk] },
    issuer: "https://auth.desk.id",
    audience: "kubes",
  });

  assert.equal(res.valid, false);
});

test("DeskID adapter: scopes workspace path per organization", () => {
  const defaultPath = getScopedWorkspacePath("default", "work");
  assert.ok(defaultPath.includes("cubes/work") || defaultPath.includes("cubes\\work"));

  const orgPath = getScopedWorkspacePath("tenant-xyz", "focus");
  assert.ok(orgPath.includes("orgs/tenant-xyz/cubes/focus") || orgPath.includes("orgs\\tenant-xyz\\cubes\\focus"));
});

test("DeskID adapter: REJECTS token with missing org_id in enterprise DeskID mode", async () => {
  process.env.AUTH_MODE = "deskid";
  try {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const publicJwk = await exportJWK(publicKey);

    const token = await new SignJWT({
      email: "test@example.com",
    })
      .setProtectedHeader({ alg: "RS256" })
      .setSubject("user-no-org")
      .setAudience("kubes")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);

    const res = await validateDeskIDToken(token, {
      jwks: { keys: [publicJwk] },
      audience: "kubes",
    });

    assert.equal(res.valid, false);
    assert.ok(res.error?.includes("org_id"));
  } finally {
    delete process.env.AUTH_MODE;
  }
});

test("DeskID adapter: defaults missing roles to empty list (fail-closed, no editor auto-grant)", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);

  const token = await new SignJWT({
    org_id: "org-no-roles",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setSubject("user-no-roles")
    .setAudience("kubes")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  const res = await validateDeskIDToken(token, {
    jwks: { keys: [publicJwk] },
    audience: "kubes",
  });

  assert.equal(res.valid, true);
  assert.deepEqual(res.claims?.roles?.kubes, []);
  assert.equal(hasRequiredRole(res.claims!, "editor"), false);
  assert.equal(hasRequiredRole(res.claims!, "admin"), false);
});

