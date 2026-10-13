import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import {
  EgressCredentialProxy,
  getDefaultEgressRules,
  isPrivateOrForbiddenHost,
} from "./egress_proxy.ts";
import { sanitizeSandboxEnv } from "./sandbox.ts";

test("isPrivateOrForbiddenHost flags localhost, private IPs, and cloud metadata", () => {
  assert.equal(isPrivateOrForbiddenHost("localhost"), true);
  assert.equal(isPrivateOrForbiddenHost("127.0.0.1"), true);
  assert.equal(isPrivateOrForbiddenHost("169.254.169.254"), true);
  assert.equal(isPrivateOrForbiddenHost("10.0.1.5"), true);
  assert.equal(isPrivateOrForbiddenHost("192.168.1.1"), true);
  assert.equal(isPrivateOrForbiddenHost("172.16.0.10"), true);
  assert.equal(isPrivateOrForbiddenHost("api.groq.com"), false);
  assert.equal(isPrivateOrForbiddenHost("api.openai.com"), false);
});

test("sanitizeSandboxEnv strips secrets, keys, and tokens from environment", () => {
  const dirtyEnv: Record<string, string> = {
    CUSTOM_FLAG: "true",
    OPENAI_API_KEY: "sk-secret-12345",
    ANTHROPIC_API_KEY: "ant-secret-abc",
    DESKID_SECRET_TOKEN: "jwt-secret",
    DATABASE_PASSWORD: "pw",
    GROQ_KEY: "groq-token",
  };

  const safe = sanitizeSandboxEnv(dirtyEnv, "/tmp/sandbox");
  assert.equal(safe.CUSTOM_FLAG, "true");
  assert.equal(safe.HOME, "/tmp/sandbox");
  assert.equal(safe.OPENAI_API_KEY, undefined);
  assert.equal(safe.ANTHROPIC_API_KEY, undefined);
  assert.equal(safe.DESKID_SECRET_TOKEN, undefined);
  assert.equal(safe.DATABASE_PASSWORD, undefined);
  assert.equal(safe.GROQ_KEY, undefined);
});

test("getDefaultEgressRules configures standard providers", () => {
  const rules = getDefaultEgressRules({
    groqKey: "gsk_test",
    openaiKey: "sk_test",
  });
  assert.equal(rules.length, 4);
  const groqRule = rules.find((r) => r.hostPattern === "api.groq.com");
  assert.ok(groqRule);
  assert.equal(groqRule.injectHeaders?.Authorization, "Bearer gsk_test");
});

test("EgressCredentialProxy blocks forbidden targets and injects headers", async () => {
  const proxy = new EgressCredentialProxy([
    {
      hostPattern: "127.0.0.1",
      allow: false,
    },
  ]);
  const proxyPort = await proxy.start();
  assert.ok(proxyPort > 0);

  try {
    // Egress to private/forbidden destination returns 403
    const res = await new Promise<{ statusCode?: number }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: proxyPort,
          path: "http://127.0.0.1:9999/v1/models",
          method: "GET",
          agent: false,
          timeout: 2000,
        },
        (r) => {
          r.resume(); // drain response
          resolve({ statusCode: r.statusCode });
        }
      );
      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Request timed out"));
      });
      req.end();
    });

    assert.equal(res.statusCode, 403);
  } finally {
    await proxy.stop();
  }
});
