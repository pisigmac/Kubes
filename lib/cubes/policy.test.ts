import assert from "node:assert/strict";
import test from "node:test";
import {
  getCubePolicy,
  isToolAllowed,
  assertToolAllowed,
} from "./policy.ts";

test("getCubePolicy returns specific policy for known cube slugs", () => {
  const maestroPolicy = getCubePolicy("maestro");
  assert.equal(maestroPolicy.network_egress, "restricted");
  assert.equal(maestroPolicy.fs_access, "maestro_shared");
  assert.ok(maestroPolicy.allowed_tools.includes("computer_exec"));
  assert.ok(maestroPolicy.allowed_tools.includes("computer_browse"));

  const focusPolicy = getCubePolicy("focus");
  assert.equal(focusPolicy.network_egress, "none");
  assert.equal(focusPolicy.fs_access, "workspace_write");
  assert.ok(focusPolicy.allowed_tools.includes("computer_exec"));
  assert.equal(focusPolicy.allowed_tools.includes("computer_browse"), false);

  const moneyPolicy = getCubePolicy("money");
  assert.equal(moneyPolicy.network_egress, "none");
  assert.equal(moneyPolicy.allowed_tools.includes("computer_exec"), false);
  assert.ok(moneyPolicy.allowed_tools.includes("record_transaction"));
});

test("getCubePolicy returns default policy for unknown cube slugs", () => {
  const customPolicy = getCubePolicy("custom-specialist-99");
  assert.equal(customPolicy.network_egress, "none");
  assert.equal(customPolicy.fs_access, "workspace_write");
  assert.ok(customPolicy.allowed_tools.includes("computer_read"));
  assert.equal(customPolicy.allowed_tools.includes("computer_exec"), false);
});

test("isToolAllowed and assertToolAllowed enforce permission boundaries", () => {
  assert.equal(isToolAllowed("maestro", "computer_exec"), true);
  assert.equal(isToolAllowed("money", "computer_exec"), false);
  assert.equal(isToolAllowed("focus", "computer_read"), true);

  assert.doesNotThrow(() => assertToolAllowed("maestro", "computer_exec"));
  assert.throws(
    () => assertToolAllowed("money", "computer_exec"),
    /Policy violation: Tool "computer_exec" is not permitted for Cube "money"/,
  );
  assert.throws(
    () => assertToolAllowed("focus", "computer_browse"),
    /Policy violation: Tool "computer_browse" is not permitted for Cube "focus"/,
  );
});
