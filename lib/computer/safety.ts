import fs from "node:fs";
import path from "node:path";

export interface SafeCommandConfig {
  safePrefixes: string[];
  disallowedTokens: string[];
}

const DEFAULT_CONFIG_PATH = path.join(process.cwd(), "config", "safe_commands.json");
const USER_CONFIG_PATH = path.join(process.cwd(), "data", "safe_commands_user.json");

let cachedConfig: SafeCommandConfig | null = null;

export function loadSafeCommandConfig(): SafeCommandConfig {
  if (cachedConfig) return cachedConfig;
  try {
    if (fs.existsSync(DEFAULT_CONFIG_PATH)) {
      const raw = fs.readFileSync(DEFAULT_CONFIG_PATH, "utf-8");
      cachedConfig = JSON.parse(raw) as SafeCommandConfig;
      return cachedConfig;
    }
  } catch {}
  return {
    safePrefixes: ["pwd", "ls", "cat", "echo", "git status", "git log", "git branch", "git diff", "which"],
    disallowedTokens: [";", "&&", "||", "|", ">", ">>", "<", "`", "$(", "${", "rm", "mv", "chmod", "curl", "wget", "sudo"],
  };
}

export function loadUserPersistedSafeCommands(): string[] {
  try {
    if (fs.existsSync(USER_CONFIG_PATH)) {
      const raw = fs.readFileSync(USER_CONFIG_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((c) => String(c).trim()).filter(Boolean);
    }
  } catch {}
  return [];
}

export function saveUserPersistedSafeCommand(command: string): string[] {
  const normalized = command.trim();
  if (!normalized) return loadUserPersistedSafeCommands();

  const current = loadUserPersistedSafeCommands();
  if (!current.includes(normalized)) {
    const updated = [...current, normalized];
    const dir = path.dirname(USER_CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(USER_CONFIG_PATH, JSON.stringify(updated, null, 2), "utf-8");
    return updated;
  }
  return current;
}

export function removeUserPersistedSafeCommand(command: string): string[] {
  const normalized = command.trim();
  const current = loadUserPersistedSafeCommands();
  const updated = current.filter((c) => c !== normalized);
  const dir = path.dirname(USER_CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USER_CONFIG_PATH, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

/**
 * Checks whether a shell command is verified safe to run without interactive approval.
 * 
 * Rules:
 * 1. An empty or whitespace command is never treated as a safe executable command.
 * 2. If the command contains any dangerous token (chaining, redirection, command substitution, destructive binaries),
 *    it is NEVER safe via baseline prefix matching.
 * 3. If the command exactly matches a user-persisted safe command, it is considered safe.
 * 4. If the command starts with an allowed safe prefix (word-boundary matched) and contains no disallowed tokens,
 *    it is considered safe.
 */
export function isSafeCommand(
  rawCommand: string,
  userAllowedCommands?: string[],
  config: SafeCommandConfig = loadSafeCommandConfig(),
): boolean {
  const command = rawCommand.trim();
  if (!command) return false;

  const userCommands = userAllowedCommands || loadUserPersistedSafeCommands();

  // 1. Direct exact match against user's persisted safe list
  if (userCommands.includes(command)) {
    return true;
  }

  // 2. Reject commands containing disallowed tokens or operators
  for (const token of config.disallowedTokens) {
    if (token === "$(" || token === "${" || token === "`" || token === ";" || token === "&&" || token === "||" || token === "|" || token === ">" || token === ">>" || token === "<") {
      if (command.includes(token)) return false;
    } else {
      // For binary names (e.g. 'rm', 'mv', 'curl'), match on word boundaries so 'terminal' or 'farm' isn't rejected
      const wordBoundaryRegex = new RegExp(`(^|\\s|/|;)${escapeRegex(token)}(\\s|$|/)`);
      if (wordBoundaryRegex.test(command)) {
        return false;
      }
    }
  }

  // 3. Match against safe prefixes
  for (const prefix of config.safePrefixes) {
    if (command === prefix || command.startsWith(`${prefix} `)) {
      return true;
    }
  }

  return false;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
