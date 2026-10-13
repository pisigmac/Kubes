import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSandboxedHtml,
  parseConsoleMessage,
  PREVIEW_CONSOLE_MESSAGE_TYPE,
} from "./sandbox_preview.ts";

test("Sandbox Preview: buildSandboxedHtml wraps HTML fragments with harness", () => {
  const fragment = "<h1>Hello World</h1><button>Click Me</button>";
  const wrapped = buildSandboxedHtml(fragment);

  assert.ok(wrapped.includes("<!DOCTYPE html>"));
  assert.ok(wrapped.includes(PREVIEW_CONSOLE_MESSAGE_TYPE));
  assert.ok(wrapped.includes("<h1>Hello World</h1>"));
});

test("Sandbox Preview: buildSandboxedHtml injects into existing full HTML document", () => {
  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <title>Custom App</title>
</head>
<body>
  <div>Content</div>
</body>
</html>`;

  const injected = buildSandboxedHtml(fullHtml);
  assert.ok(injected.includes("<title>Custom App</title>"));
  assert.ok(injected.includes(PREVIEW_CONSOLE_MESSAGE_TYPE));
});

test("Sandbox Preview: parseConsoleMessage extracts valid log entries", () => {
  const validPayload = {
    type: PREVIEW_CONSOLE_MESSAGE_TYPE,
    level: "warn",
    message: "Resource deprecated",
    timestamp: 1700000000,
  };

  const parsed = parseConsoleMessage(validPayload);
  assert.ok(parsed);
  assert.equal(parsed?.level, "warn");
  assert.equal(parsed?.message, "Resource deprecated");
  assert.equal(parsed?.timestamp, 1700000000);
});

test("Sandbox Preview: parseConsoleMessage ignores unrelated postMessage events", () => {
  const randomPayload = {
    type: "OTHER_EVENT",
    data: 123,
  };

  assert.equal(parseConsoleMessage(randomPayload), null);
  assert.equal(parseConsoleMessage("string"), null);
  assert.equal(parseConsoleMessage(null), null);
});
