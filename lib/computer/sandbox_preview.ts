export interface ConsoleLogEntry {
  id: string;
  level: "log" | "warn" | "error" | "info";
  message: string;
  timestamp: number;
}

export const PREVIEW_CONSOLE_MESSAGE_TYPE = "KUBES_PREVIEW_CONSOLE";

/**
 * Builds the complete HTML string with an embedded console interception harness.
 * Intercepts console.log, info, warn, error, and unhandled errors, dispatching them
 * safely to the host via window.parent.postMessage.
 */
export function buildSandboxedHtml(rawHtml: string): string {
  const trimmed = rawHtml.trim();

  const harnessScript = `
<script>
(function() {
  var origLog = console.log;
  var origWarn = console.warn;
  var origError = console.error;
  var origInfo = console.info;

  function formatArg(arg) {
    if (arg === null) return "null";
    if (arg === undefined) return "undefined";
    if (typeof arg === "object") {
      try {
        return JSON.stringify(arg);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }

  function emit(level, args) {
    var message = Array.prototype.slice.call(args).map(formatArg).join(" ");
    try {
      window.parent.postMessage({
        type: "${PREVIEW_CONSOLE_MESSAGE_TYPE}",
        level: level,
        message: message,
        timestamp: Date.now()
      }, "*");
    } catch (e) {}
  }

  console.log = function() { emit("log", arguments); origLog.apply(console, arguments); };
  console.info = function() { emit("info", arguments); origInfo.apply(console, arguments); };
  console.warn = function() { emit("warn", arguments); origWarn.apply(console, arguments); };
  console.error = function() { emit("error", arguments); origError.apply(console, arguments); };

  window.addEventListener("error", function(e) {
    var msg = (e.error && e.error.message) ? e.error.message : (e.message || "Uncaught Error");
    emit("error", [msg]);
  });

  window.addEventListener("unhandledrejection", function(e) {
    var reason = e.reason ? (e.reason.message || String(e.reason)) : "Unhandled Promise Rejection";
    emit("error", [reason]);
  });
})();
</script>
`;

  // If user provided a full <html>...</html> document, inject after <head> or at top
  if (/<head[^>]*>/i.test(trimmed)) {
    return trimmed.replace(/<head[^>]*>/i, (match) => `${match}\n${harnessScript}`);
  }

  if (/<html[^>]*>/i.test(trimmed)) {
    return trimmed.replace(/<html[^>]*>/i, (match) => `${match}\n<head>${harnessScript}</head>`);
  }

  // Fragment: wrap in minimal HTML container
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${harnessScript}
  <style>
    body {
      margin: 0;
      padding: 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111827;
      background: #ffffff;
    }
  </style>
</head>
<body>
${trimmed}
</body>
</html>`;
}

/**
 * Validates and parses messages sent from the sandboxed iframe.
 */
export function parseConsoleMessage(data: unknown): ConsoleLogEntry | null {
  if (
    typeof data === "object" &&
    data !== null &&
    (data as Record<string, unknown>).type === PREVIEW_CONSOLE_MESSAGE_TYPE
  ) {
    const raw = data as Record<string, unknown>;
    const level = (raw.level as ConsoleLogEntry["level"]) || "log";
    const message = typeof raw.message === "string" ? raw.message : String(raw.message ?? "");
    const timestamp = typeof raw.timestamp === "number" ? raw.timestamp : Date.now();

    return {
      id: `log-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
      level: ["log", "info", "warn", "error"].includes(level) ? level : "log",
      message,
      timestamp,
    };
  }

  return null;
}
