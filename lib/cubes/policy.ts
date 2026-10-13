import fs from "node:fs";
import path from "node:path";

export type NetworkEgressPolicy = "none" | "restricted" | "full";
export type FsAccessPolicy = "read_only" | "workspace_write" | "maestro_shared";

export interface CubePolicy {
  allowed_tools: string[];
  network_egress: NetworkEgressPolicy;
  fs_access: FsAccessPolicy;
}

export interface CubesConfig {
  policies: Record<string, CubePolicy>;
}

const CONFIG_PATH = path.join(process.cwd(), "config", "cubes.json");

const DEFAULT_POLICY: CubePolicy = {
  allowed_tools: [
    "computer_list",
    "computer_read",
    "computer_write",
    "list_tasks",
    "schedule_task",
  ],
  network_egress: "none",
  fs_access: "workspace_write",
};

let cachedPolicies: Record<string, CubePolicy> | null = null;

export function loadCubePolicies(): Record<string, CubePolicy> {
  if (cachedPolicies) return cachedPolicies;

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      const parsed = JSON.parse(raw) as CubesConfig;
      if (parsed.policies && typeof parsed.policies === "object") {
        cachedPolicies = parsed.policies;
        return cachedPolicies;
      }
    }
  } catch {
    // Fall back to default on parse/read error
  }

  cachedPolicies = {
    _default: DEFAULT_POLICY,
  };
  return cachedPolicies;
}

export function getCubePolicy(slug: string): CubePolicy {
  const policies = loadCubePolicies();
  const clean = slug.trim().toLowerCase();
  return policies[clean] || policies._default || DEFAULT_POLICY;
}

export function isToolAllowed(slug: string, toolName: string): boolean {
  const policy = getCubePolicy(slug);
  return policy.allowed_tools.includes(toolName);
}

export function assertToolAllowed(slug: string, toolName: string): void {
  if (!isToolAllowed(slug, toolName)) {
    throw new Error(
      `Policy violation: Tool "${toolName}" is not permitted for Cube "${slug}". Allowed tools: [${getCubePolicy(
        slug
      ).allowed_tools.join(", ")}]`
    );
  }
}
