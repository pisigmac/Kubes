import assert from "node:assert/strict";
import test from "node:test";
import { assertPublicUrl } from "./url.ts";

test("localhost and private addresses are refused", async () => {
  await assert.rejects(assertPublicUrl("http://127.0.0.1:3010"), /this machine/);
  await assert.rejects(assertPublicUrl("http://localhost/secret"), /this machine/);
  await assert.rejects(assertPublicUrl("https://192.168.1.1/"), /this machine/);
  await assert.rejects(assertPublicUrl("file:///etc/passwd"), /http and https/);
});
