/**
 * DeskID IAM & Multi-Tenancy Adapter for Kubes.
 * Edge-compatible JWT validation, organization workspace scoping, and role-based access.
 */

export type DeskIDTokenClaims = {
  sub: string;
  email?: string;
  org_id?: string;
  roles?: {
    kubes?: string[];
    [key: string]: string[] | undefined;
  };
  exp?: number;
  iat?: number;
  iss?: string;
};

export function getAuthMode(): "none" | "deskid" {
  const mode = process.env.AUTH_MODE?.trim().toLowerCase();
  return mode === "deskid" ? "deskid" : "none";
}

export function getDeskIDJwksUrl(): string {
  return process.env.DESKID_JWKS_URL?.trim() || "http://127.0.0.1:8090/.well-known/jwks.json";
}

function decodeBase64Url(str: string): string {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  if (typeof atob === "function") {
    return atob(padded);
  }
  return Buffer.from(padded, "base64").toString("utf-8");
}

/**
 * Validate a DeskID JWT token.
 * In production/testing, validates structure, expiration, and claims.
 */
export async function validateDeskIDToken(
  token: string,
): Promise<{ valid: boolean; claims?: DeskIDTokenClaims; error?: string }> {
  if (!token || !token.trim()) {
    return { valid: false, error: "Missing token" };
  }

  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false, error: "Malformed JWT" };
    }

    // Decode JWT payload (Edge-safe base64url decode)
    const payloadJson = decodeBase64Url(parts[1]);
    const claims = JSON.parse(payloadJson) as DeskIDTokenClaims;

    if (!claims.sub) {
      return { valid: false, error: "Token payload missing subject ('sub')" };
    }

    // Validate expiration if present
    if (claims.exp && Date.now() >= claims.exp * 1000) {
      return { valid: false, error: "Token has expired" };
    }

    return { valid: true, claims };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : "Invalid token" };
  }
}

/**
 * Compute multi-tenant isolated workspace paths when running in enterprise DeskID mode.
 */
export function getScopedWorkspacePath(orgId?: string, cubeSlug?: string): string {
  const baseRoot = process.env.CUBES_COMPUTER_ROOT?.trim() || "data/computer";
  const normalizedRoot = baseRoot.replace(/[/\\]+$/, "");
  if (!orgId || orgId === "default") {
    return cubeSlug ? `${normalizedRoot}/cubes/${cubeSlug}` : normalizedRoot;
  }
  return cubeSlug
    ? `${normalizedRoot}/orgs/${orgId}/cubes/${cubeSlug}`
    : `${normalizedRoot}/orgs/${orgId}`;
}

/**
 * Check if the token claims have sufficient role permissions.
 */
export function hasRequiredRole(claims: DeskIDTokenClaims, requiredRole: "viewer" | "editor" | "admin"): boolean {
  const roles = claims.roles?.kubes || ["editor"]; // Default to editor for authenticated users
  if (roles.includes("admin")) return true;
  if (requiredRole === "editor" && roles.includes("editor")) return true;
  if (requiredRole === "viewer" && (roles.includes("viewer") || roles.includes("editor"))) return true;
  return false;
}
