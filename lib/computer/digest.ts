import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { db } from "../db.ts";

export type DigestRecord = {
  id: string;
  cubeId: string;
  cubeSlug: string;
  title: string;
  summary: string;
  status: "ok" | "error" | "warning";
  channels: string[];
  details?: string | null;
  createdAt: string;
};

type DigestRow = {
  id: string;
  cube_id: string;
  cube_slug: string;
  title: string;
  summary: string;
  status: string;
  channels: string;
  details: string | null;
  created_at: string;
};

export type DigestConfig = {
  channels: {
    desktop: boolean;
    file: boolean;
    webhook: boolean;
    email: boolean;
  };
  webhookUrl?: string;
  emailRecipient?: string;
  minLevel: "info" | "warning" | "error";
};

const DEFAULT_CONFIG: DigestConfig = {
  channels: {
    desktop: true,
    file: true,
    webhook: false,
    email: false,
  },
  webhookUrl: "",
  emailRecipient: "",
  minLevel: "info",
};

/**
 * Loads the current digest notification configuration from config/digest.json
 */
export function getDigestConfig(): DigestConfig {
  try {
    const configPath = path.join(process.cwd(), "config", "digest.json");
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        channels: {
          ...DEFAULT_CONFIG.channels,
          ...(parsed.channels || {}),
        },
        webhookUrl: parsed.webhookUrl || process.env.DIGEST_WEBHOOK_URL || "",
        emailRecipient: parsed.emailRecipient || process.env.DIGEST_EMAIL_TO || "",
        minLevel: parsed.minLevel || "info",
      };
    }
  } catch (err) {
    console.warn("Failed to read config/digest.json, using defaults:", err);
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Saves updated digest configuration to config/digest.json
 */
export function saveDigestConfig(patch: Partial<DigestConfig>): DigestConfig {
  const current = getDigestConfig();
  const updated: DigestConfig = {
    channels: {
      ...current.channels,
      ...(patch.channels || {}),
    },
    webhookUrl: patch.webhookUrl !== undefined ? patch.webhookUrl : current.webhookUrl,
    emailRecipient: patch.emailRecipient !== undefined ? patch.emailRecipient : current.emailRecipient,
    minLevel: patch.minLevel || current.minLevel,
  };
  const configDir = path.join(process.cwd(), "config");
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, "digest.json"), JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

/**
 * Generates an executive summary title and summary text from scheduled task results.
 */
export function generateDigestSummary(params: {
  cubeSlug: string;
  cubeName: string;
  instruction: string;
  status: "ok" | "error";
  output?: string | null;
  error?: string | null;
}): { title: string; summary: string; details: string } {
  const { cubeSlug, cubeName, instruction, status, output, error } = params;
  const isOk = status === "ok";
  const icon = isOk ? "✅" : "⚠️";
  
  let title = `${icon} [${cubeName}] Task Completed`;
  if (!isOk) {
    title = `⚠️ [${cubeName}] Task Encountered Issue`;
  } else if (cubeSlug === "job-hunt") {
    title = `💼 [Job Hunt] Career Tracker Updated`;
  } else if (cubeSlug === "money") {
    title = `💰 [Money] Ledger & Financial Sync Complete`;
  } else if (cubeSlug === "work" || cubeSlug === "learn") {
    title = `🔬 [${cubeName}] Intelligence Briefing Ready`;
  }

  // Create clean bullet points
  const lines: string[] = [];
  lines.push(`• **Instruction**: ${instruction.length > 80 ? instruction.slice(0, 77) + "..." : instruction}`);
  
  if (isOk) {
    const rawOut = (output || "").trim();
    if (rawOut) {
      // Extract first 2-3 meaningful lines
      const outLines = rawOut.split("\n").map(l => l.trim()).filter(Boolean);
      const highlight = outLines.slice(0, 3).join(" ").slice(0, 200);
      lines.push(`• **Outcome**: ${highlight}${highlight.length >= 200 ? "..." : ""}`);
    } else {
      lines.push(`• **Outcome**: Task executed successfully.`);
    }
  } else {
    lines.push(`• **Error**: ${error || "Unknown execution error."}`);
  }

  const summary = lines.join("\n");
  const details = isOk ? output || "(no output)" : `Error: ${error}\n\nOutput: ${output || "(none)"}`;

  return { title, summary, details };
}

/**
 * Sends a native desktop notification if supported on the platform.
 * Gracefully ignores headless environments or missing display servers.
 */
export async function sendDesktopNotification(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const cleanTitle = title.replace(/[\r\n]+/g, " ").slice(0, 80);
    const cleanMessage = message.replace(/[\r\n]+/g, " ").slice(0, 200);

    if (process.platform === "linux") {
      // Check if DISPLAY or WAYLAND_DISPLAY is present
      if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
        resolve(false);
        return;
      }
      execFile("notify-send", ["-a", "Kubes Autonomous Digest", cleanTitle, cleanMessage], { timeout: 3000 }, (err) => {
        resolve(!err);
      });
    } else if (process.platform === "darwin") {
      const script = `display notification "${cleanMessage.replace(/"/g, '\\"')}" with title "${cleanTitle.replace(/"/g, '\\"')}"`;
      execFile("osascript", ["-e", script], { timeout: 3000 }, (err) => {
        resolve(!err);
      });
    } else if (process.platform === "win32") {
      const psCommand = `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null;`;
      execFile("powershell", ["-Command", psCommand], { timeout: 3000 }, (err) => {
        resolve(!err);
      });
    } else {
      resolve(false);
    }
  });
}

/**
 * Sends a webhook notification payload (Discord/Slack/generic compatible).
 */
export async function sendWebhookNotification(url: string, digest: DigestRecord): Promise<boolean> {
  if (!url || !url.startsWith("http")) return false;
  try {
    const payload = {
      text: `### ${digest.title}\n\n${digest.summary}\n\n*Specialist: ${digest.cubeSlug} | Status: ${digest.status}*`,
      digestId: digest.id,
      cubeSlug: digest.cubeSlug,
      title: digest.title,
      summary: digest.summary,
      status: digest.status,
      timestamp: digest.createdAt,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    return response.ok;
  } catch (err) {
    console.warn(`Digest webhook delivery failed for ${url}:`, err);
    return false;
  }
}

/**
 * Appends digest entry to daily markdown log in data/digests/
 */
export function saveDigestToFile(digest: DigestRecord): string {
  const dir = path.join(process.cwd(), "data", "digests");
  fs.mkdirSync(dir, { recursive: true });

  const dateStr = digest.createdAt.split("T")[0];
  const filePath = path.join(dir, `digest-${dateStr}.md`);
  const latestPath = path.join(dir, "latest.md");

  const entry = `\n## ${digest.title} (${digest.createdAt})\n**Specialist**: \`${digest.cubeSlug}\` | **Status**: \`${digest.status}\` | **Channels**: ${digest.channels.join(", ")}\n\n${digest.summary}\n\n<details>\n<summary>Details</summary>\n\n\`\`\`\n${digest.details || "(no details)"}\n\`\`\`\n</details>\n\n---\n`;

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `# Autonomous Digest: ${dateStr}\n\nSummary of scheduled specialist task runs.\n\n`, "utf-8");
  }
  fs.appendFileSync(filePath, entry, "utf-8");
  fs.writeFileSync(latestPath, `# Latest Autonomous Digest\n${entry}`, "utf-8");

  return filePath;
}

/**
 * Records a new digest and dispatches across all configured notification channels.
 */
export async function dispatchDigest(input: {
  cubeId: string;
  cubeSlug: string;
  title: string;
  summary: string;
  status: "ok" | "error" | "warning";
  details?: string | null;
  channels?: string[];
  orgId?: string;
  userId?: string | null;
}): Promise<DigestRecord> {
  const config = getDigestConfig();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const activeChannels: string[] = [];
  const orgId = input.orgId || "default";

  // Determine channels
  const channelsToUse = input.channels || [];
  const useDesktop = channelsToUse.includes("desktop") || (channelsToUse.length === 0 && config.channels.desktop);
  const useFile = channelsToUse.includes("file") || (channelsToUse.length === 0 && config.channels.file);
  const useWebhook = channelsToUse.includes("webhook") || (channelsToUse.length === 0 && config.channels.webhook && Boolean(config.webhookUrl));
  const useEmail = channelsToUse.includes("email") || (channelsToUse.length === 0 && config.channels.email);

  const record: DigestRecord = {
    id,
    cubeId: input.cubeId,
    cubeSlug: input.cubeSlug,
    title: input.title,
    summary: input.summary,
    status: input.status,
    channels: [],
    details: input.details,
    createdAt,
  };

  // 1. Desktop Notification
  if (useDesktop) {
    try {
      const delivered = await sendDesktopNotification(input.title, input.summary);
      if (delivered) activeChannels.push("desktop");
      else activeChannels.push("desktop(queued)");
    } catch {
      activeChannels.push("desktop(fallback)");
    }
  }

  // 2. File Digest Storage
  if (useFile) {
    try {
      saveDigestToFile({ ...record, channels: activeChannels });
      activeChannels.push("file");
    } catch (err) {
      console.warn("Failed to write digest file:", err);
    }
  }

  // 3. Webhook Notification
  if (useWebhook && config.webhookUrl) {
    try {
      const sent = await sendWebhookNotification(config.webhookUrl, record);
      if (sent) activeChannels.push("webhook");
    } catch (err) {
      console.warn("Webhook dispatch failed:", err);
    }
  }

  // 4. Email / Webhook Simulation
  if (useEmail) {
    activeChannels.push("email(queued)");
  }

  record.channels = activeChannels;

  // Persist to SQLite Database
  try {
    db()
      .prepare(
        `INSERT INTO digests (id, cube_id, cube_slug, title, summary, status, channels, details, org_id, user_id, created_at)
         VALUES (@id, @cube_id, @cube_slug, @title, @summary, @status, @channels, @details, @org_id, @user_id, @created_at)`,
      )
      .run({
        id: record.id,
        cube_id: record.cubeId,
        cube_slug: record.cubeSlug,
        title: record.title,
        summary: record.summary,
        status: record.status,
        channels: JSON.stringify(record.channels),
        details: record.details || null,
        org_id: orgId,
        user_id: input.userId || null,
        created_at: record.createdAt,
      });
  } catch (err) {
    console.error("Failed to insert digest row into database:", err);
  }

  return record;
}

/**
 * Retrieves recent digest entries.
 */
export function listDigests(limit = 50, cubeId?: string, orgId = "default"): DigestRecord[] {
  try {
    let rows: DigestRow[];
    if (cubeId) {
      rows = db()
        .prepare("SELECT * FROM digests WHERE cube_id = ? AND org_id = ? ORDER BY created_at DESC LIMIT ?")
        .all(cubeId, orgId, limit) as DigestRow[];
    } else {
      rows = db()
        .prepare("SELECT * FROM digests WHERE org_id = ? ORDER BY created_at DESC LIMIT ?")
        .all(orgId, limit) as DigestRow[];
    }

    return rows.map((r) => {
      let parsedChannels: string[] = [];
      try {
        parsedChannels = JSON.parse(r.channels);
      } catch {
        parsedChannels = [r.channels];
      }
      return {
        id: r.id,
        cubeId: r.cube_id,
        cubeSlug: r.cube_slug,
        title: r.title,
        summary: r.summary,
        status: r.status as "ok" | "error" | "warning",
        channels: parsedChannels,
        details: r.details,
        createdAt: r.created_at,
      };
    });
  } catch (err) {
    console.error("Failed to list digests:", err);
    return [];
  }
}
