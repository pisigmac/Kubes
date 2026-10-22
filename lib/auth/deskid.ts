/**
 * DeskID IAM & Multi-Tenancy Production Adapter for Kubes.
 * Cryptographic JWT/JWKS verification (RS256, ES256, EdDSA), organization tenant scoping,
 * and role-based access control.
 */

import {
  createRemoteJWKSet,
  createLocalJWKSet,
  jwtVerify,
  importSPKI,
  importJWK,
  type JWTVerifyGetKey,
  type JSONWebKeySet,
} from "jose";

export type KeyType = CryptoKey | Uint8Array;

export type DeskIDTokenClaims = {
  sub: string;
  email?: string;
  org_id?: string;
  roles?: {
    kubes?: string | string[];
    [key: string]: string | string[] | undefined;
  };
  exp?: number;
  iat?: number;
  nbf?: number;
  iss?: string;
  aud?: string | string[];
};

export interface DeskIDValidationOptions {
  jwksUrl?: string;
  issuer?: string;
  audience?: string | string[];
  publicKey?: string | KeyType;
  jwks?: JSONWebKeySet;
}

let remoteJWKS: JWTVerifyGetKey | null = null;
let cachedJwksUrl: string | null = null;

function normalizeRolesClaim(value: unknown): DeskIDTokenClaims["roles"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { kubes: [] };
  }

  const kubesRoles = (value as Record<string, unknown>).kubes;
  if (typeof kubesRoles === "string") {
    return { kubes: [kubesRoles] };
  }
  if (Array.isArray(kubesRoles)) {
    return { kubes: kubesRoles.filter((role): role is string => typeof role === "string") };
  }
  return { kubes: [] };
}

export function getAuthMode(): "none" | "deskid" {
  const mode = process.env.AUTH_MODE?.trim().toLowerCase();
  return mode === "deskid" ? "deskid" : "none";
}

export function getDeskIDJwksUrl(): string {
  return process.env.DESKID_JWKS_URL?.trim() || "http://127.0.0.1:8090/.well-known/jwks.json";
}

export function getDeskIDIssuer(): string | undefined {
  return process.env.DESKID_ISSUER?.trim() || undefined;
}

export function getDeskIDAudience(): string | undefined {
  return process.env.DESKID_AUDIENCE?.trim() || "kubes";
}

/**
 * Validates a DeskID JWT token cryptographically using RS256/ES256 JWKS or public key.
 */
export async function validateDeskIDToken(
  token: string,
  options?: DeskIDValidationOptions,
): Promise<{ valid: boolean; claims?: DeskIDTokenClaims; error?: string }> {
  if (!token || !token.trim()) {
    return { valid: false, error: "Missing token" };
  }

  const cleanToken = token.startsWith("Bearer ") ? token.slice(7).trim() : token.trim();

  try {
    const issuer = options?.issuer ?? getDeskIDIssuer();
    const audience = options?.audience ?? getDeskIDAudience();

    let keyOrJwks: KeyType | JWTVerifyGetKey;

    const pubKey = options?.publicKey || (process.env.DESKID_PUBLIC_KEY?.trim() || undefined);
    if (pubKey) {
      if (typeof pubKey === "string") {
        if (pubKey.startsWith("-----BEGIN")) {
          keyOrJwks = (await importSPKI(pubKey, "RS256")) as KeyType;
        } else {
          keyOrJwks = (await importJWK(JSON.parse(pubKey), "RS256")) as KeyType;
        }
      } else {
        keyOrJwks = pubKey;
      }
    } else if (options?.jwks) {
      keyOrJwks = createLocalJWKSet(options.jwks);
    } else {
      const url = options?.jwksUrl || getDeskIDJwksUrl();
      if (!remoteJWKS || cachedJwksUrl !== url) {
        remoteJWKS = createRemoteJWKSet(new URL(url), {
          cooldownDuration: 30_000,
          cacheMaxAge: 600_000,
        });
        cachedJwksUrl = url;
      }
      keyOrJwks = remoteJWKS;
    }

    const { payload } = await jwtVerify(cleanToken, keyOrJwks as never, {
      issuer,
      audience,
      algorithms: ["RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "EdDSA"],
    });

    const sub = typeof payload.sub === "string" ? payload.sub : "";
    if (!sub) {
      return { valid: false, error: "Token payload missing subject ('sub')" };
    }

    const orgIdClaim = typeof payload.org_id === "string" ? payload.org_id.trim() : "";
    if (getAuthMode() === "deskid" && !orgIdClaim) {
      return { valid: false, error: "DeskID token missing required 'org_id' claim" };
    }

    const claims: DeskIDTokenClaims = {
      sub,
      email: typeof payload.email === "string" ? payload.email : undefined,
      org_id: orgIdClaim || "default",
      roles: normalizeRolesClaim(payload.roles),
      exp: payload.exp,
      iat: payload.iat,
      nbf: payload.nbf,
      iss: payload.iss,
      aud: payload.aud,
    };

    return { valid: true, claims };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cryptographic signature verification failed";
    return { valid: false, error: message };
  }
}

export type ResourceScope = {
  orgId: string;
  userId?: string | null;
  roles?: readonly string[] | string[];
};

export type AuthContext = {
  readonly mode: "local" | "deskid";
  readonly userId: string | null;
  readonly orgId: string;
  readonly roles: readonly string[];
};

export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/**
 * Extract bearer token or deskid_session cookie from a Request.
 */
export function extractAuthToken(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(/deskid_session=([^;]+)/);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }
  return null;
}

/**
 * Server-side helper to require authentication and generate an immutable AuthContext.
 * In DeskID mode, missing requests or tokens fail closed with 401.
 */
export async function requireAuth(request?: Request): Promise<AuthContext> {
  const mode = getAuthMode();
  if (mode !== "deskid") {
    return Object.freeze({
      mode: "local" as const,
      userId: null,
      orgId: "default",
      roles: Object.freeze(["admin", "editor", "viewer"]),
    });
  }

  if (!request) {
    throw new AuthError("Request context required for authentication", 401);
  }

  const token = extractAuthToken(request);
  if (!token) {
    throw new AuthError("DeskID authentication token required", 401);
  }

  const validation = await validateDeskIDToken(token);
  if (!validation.valid || !validation.claims?.sub || !validation.claims?.org_id) {
    throw new AuthError(validation.error || "Unauthorized: invalid DeskID token", 401);
  }

  return Object.freeze({
    mode: "deskid" as const,
    userId: validation.claims.sub,
    orgId: validation.claims.org_id,
    roles: Object.freeze([...(validation.claims.roles?.kubes || [])]),
  });
}

/**
 * Enforce minimum role requirement, throwing 403 Forbidden if not met.
 */
export function assertRole(auth: AuthContext, requiredRole: "viewer" | "editor" | "admin"): void {
  if (auth.mode === "local") return;
  const roles = auth.roles;
  if (roles.includes("admin")) return;
  if (requiredRole === "editor" && roles.includes("editor")) return;
  if (requiredRole === "viewer" && (roles.includes("viewer") || roles.includes("editor"))) return;
  throw new AuthError(`Forbidden: '${requiredRole}' role required`, 403);
}

/**
 * Compute multi-tenant isolated workspace paths when running in enterprise DeskID mode.
 */
export function getScopedWorkspacePath(orgId?: string, cubeSlug?: string): string {
  const baseRoot = process.env.CUBES_COMPUTER_ROOT?.trim() || "data/computer";
  const normalizedRoot = baseRoot.replace(/[/\\]+$/, "");
  const normalizedOrg = (orgId || "default").trim().replace(/[^a-zA-Z0-9_-]/g, "_");
  
  if (normalizedOrg === "default") {
    return cubeSlug ? `${normalizedRoot}/cubes/${cubeSlug}` : normalizedRoot;
  }
  return cubeSlug
    ? `${normalizedRoot}/orgs/${normalizedOrg}/cubes/${cubeSlug}`
    : `${normalizedRoot}/orgs/${normalizedOrg}`;
}

/**
 * Check if the token claims have sufficient role permissions.
 */
export function hasRequiredRole(claims: DeskIDTokenClaims, requiredRole: "viewer" | "editor" | "admin"): boolean {
  const roles = claims.roles?.kubes || [];
  if (roles.includes("admin")) return true;
  if (requiredRole === "editor" && roles.includes("editor")) return true;
  if (requiredRole === "viewer" && (roles.includes("viewer") || roles.includes("editor"))) return true;
  return false;
}

