// _shared/authManifest.ts — typed access to the Edge Function auth contract.
//
// The data lives in authManifest.json rather than in this file because two
// different runtimes need it: Deno (these tests, via a JSON import) and Node
// (scripts/check-edge-function-auth.mjs, via fs). A .ts source of truth would
// force the Node guard to parse TypeScript; a .json one costs nothing on
// either side.
//
// The guard is the thing that keeps this honest — it recomputes originPolicy,
// serviceRole, configToml and the required auth primitives from the actual
// sources and fails when an entry disagrees with the code it claims to
// describe. Read docs/edge-function-auth.md before changing the shape here.

import manifest from "./authManifest.json" with { type: "json" };

/** Every authentication family used by a deployable Edge Function. */
export type AuthFamilyId =
  | "webhook-bearer"
  | "webhook-bearer-or-internal-secret"
  | "webhook-bearer-or-staff-jwt"
  | "staff-jwt"
  | "staff-jwt-or-internal-secret"
  | "internal-secret"
  | "agent-secret"
  | "meta-signature"
  | "feed-token"
  | "public-rate-limited";

export interface AuthFamily {
  description: string;
  /**
   * Auth primitives every function in this family must call. The guard
   * requires each one's verdict to reach an if-guard that returns or throws —
   * not merely to be mentioned — unless listed in flowOnlyPrimitives.
   */
  requiredPrimitives: string[];
  /**
   * Primitives whose verdict is enforced by something other than an early
   * exit, so the guard only requires the result to be captured and used.
   * buildAllowedOrigins is the one case: its output becomes CORS headers.
   */
  flowOnlyPrimitives?: string[];
  /** HTTP statuses this family may use to refuse an unauthorised caller. */
  unauthorizedStatuses: number[];
  /**
   * Whether an unset/empty secret closes the door. False only where a
   * documented degraded mode exists — see emptySecretRationale.
   */
  failsClosedOnEmptySecret: boolean;
  emptySecretRationale: string;
}

/** How config.toml declares a function, independent of what CI actually does. */
export type ConfigTomlState =
  /** [functions.x] exists with verify_jwt = false — agrees with CI. */
  | "declared-false"
  /** [functions.x] exists but sets no verify_jwt — local deploy would default to true. */
  | "declared-unset"
  /** No [functions.x] block at all — local deploy would default to true. */
  | "absent";

export interface EdgeFunctionAuth {
  authFamily: AuthFamilyId;
  /** File within the function directory that performs the check. */
  authSource: string;
  caller: string;
  role: "staff" | "customer" | "service" | "external" | "anonymous" | string;
  /** Always false: CI deploys every function with --no-verify-jwt. */
  gatewayVerifyJwt: boolean;
  configToml: ConfigTomlState;
  serviceRole: boolean;
  /** Env var naming the origin allowlist, or null when not browser-callable. */
  originPolicy: string | null;
  replayDefence: string;
  unauthorizedResponse: string;
  emptySecretBehaviour: string;
  notes: string;
}

interface AuthManifest {
  $comment: string[];
  families: Record<AuthFamilyId, AuthFamily>;
  functions: Record<string, EdgeFunctionAuth>;
}

const typedManifest = manifest as unknown as AuthManifest;

export const AUTH_FAMILIES: Record<AuthFamilyId, AuthFamily> =
  typedManifest.families;

export const EDGE_FUNCTION_AUTH: Record<string, EdgeFunctionAuth> =
  typedManifest.functions;

/** Function names, sorted, so callers iterate deterministically. */
export function edgeFunctionNames(): string[] {
  return Object.keys(EDGE_FUNCTION_AUTH).sort();
}

/** Throws rather than returning undefined — an unclassified name is a bug. */
export function authFor(functionName: string): EdgeFunctionAuth {
  const entry = EDGE_FUNCTION_AUTH[functionName];
  if (!entry) {
    throw new Error(
      `No auth manifest entry for Edge Function "${functionName}". ` +
        "Add one to _shared/authManifest.json in the same commit as the function.",
    );
  }
  return entry;
}

export function familyFor(functionName: string): AuthFamily {
  const { authFamily } = authFor(functionName);
  const family = AUTH_FAMILIES[authFamily];
  if (!family) {
    throw new Error(
      `Edge Function "${functionName}" declares unknown auth family "${authFamily}".`,
    );
  }
  return family;
}

/** Names in a given family, sorted. */
export function functionsInFamily(family: AuthFamilyId): string[] {
  return edgeFunctionNames().filter(
    (name) => EDGE_FUNCTION_AUTH[name].authFamily === family,
  );
}
