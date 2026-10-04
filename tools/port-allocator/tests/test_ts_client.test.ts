import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PortAllocatorClient } from "../ts/client.ts";

test("PortAllocatorClient operations in custom isolated registry", () => {
  const tmpRegistry = path.join(os.tmpdir(), `test-ports-${Date.now()}.json`);
  const client = new PortAllocatorClient(tmpRegistry);

  assert.equal(client.getRegistryPath(), tmpRegistry);

  // 1. Initial state is empty
  const initial = client.readRegistry();
  assert.deepEqual(initial.services, {});

  // 2. Allocate port via client
  const port = client.allocate({
    service: "test-node-svc",
    preferred: 9123,
  });

  assert.ok(port >= 9123, `Port ${port} should be >= 9123`);

  // 3. Query service
  const entry = client.get("test-node-svc");
  assert.ok(entry, "Entry should exist");
  assert.equal(entry?.port, port);

  // 4. Release service
  const released = client.release("test-node-svc");
  assert.equal(released, true);
  assert.equal(client.get("test-node-svc"), null);

  // Cleanup
  if (fs.existsSync(tmpRegistry)) {
    fs.unlinkSync(tmpRegistry);
  }
});
