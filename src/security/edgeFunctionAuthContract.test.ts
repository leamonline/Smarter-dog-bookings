// Drift behaviour for scripts/check-edge-function-auth.mjs.
//
// Every Edge Function is deployed with --no-verify-jwt, so its own in-function
// check is the whole security boundary. The manifest describes that boundary;
// this file proves the guard actually notices when the description and the code
// stop agreeing. A guard that only ever passes is indistinguishable from no
// guard, so each drift mode below is exercised as a negative control.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkEdgeFunctionAuth } from "../../scripts/check-edge-function-auth.mjs";

const temporaryRoots: string[] = [];

interface ManifestShape {
  families: Record<string, unknown>;
  functions: Record<string, unknown>;
}

interface RootSpec {
  /** function name -> { file name -> source } */
  functions: Record<string, Record<string, string>>;
  manifest: ManifestShape;
  configToml?: string;
  deployWorkflow?: string;
}

const STAFF_JWT_FAMILY = {
  description: "Staff session JWT verified via auth.getUser(), then is_staff().",
  requiredPrimitives: ["auth.getUser", "is_staff"],
  unauthorizedStatuses: [401, 403],
  failsClosedOnEmptySecret: true,
  emptySecretRationale: "No shared secret participates.",
};

/**
 * A source that satisfies the staff-jwt family and nothing else.
 *
 * Guard-complete on purpose: the verdict-flow pass requires each primitive's
 * result to reach an if-guard that exits, so a fixture of bare calls would
 * fail for the right reasons in the wrong tests.
 */
const STAFF_JWT_SOURCE = `
export async function requireStaff(req: Request): Promise<Response | null> {
  const { data } = await userClient.auth.getUser();
  if (!data.user) return new Response("unauthorized", { status: 401 });
  const { data: staff } = await userClient.rpc("is_staff");
  if (staff !== true) return new Response("forbidden", { status: 403 });
  return null;
}
`;

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    authFamily: "staff-jwt",
    authSource: "index.ts",
    caller: "staff dashboard browser",
    role: "staff",
    gatewayVerifyJwt: false,
    configToml: "declared-false",
    serviceRole: false,
    originPolicy: null,
    replayDefence: "none — read-only",
    unauthorizedResponse: "401 / 403",
    emptySecretBehaviour: "n/a",
    notes: "",
    ...overrides,
  };
}

function makeRoot(spec: RootSpec): string {
  const root = mkdtempSync(join(tmpdir(), "smarter-dog-edge-auth-"));
  temporaryRoots.push(root);

  for (const [name, files] of Object.entries(spec.functions)) {
    const dir = join(root, "supabase", "functions", name);
    mkdirSync(dir, { recursive: true });
    for (const [file, source] of Object.entries(files)) {
      const target = join(dir, file);
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, source);
    }
  }

  const sharedDir = join(root, "supabase", "functions", "_shared");
  mkdirSync(sharedDir, { recursive: true });
  writeFileSync(
    join(sharedDir, "authManifest.json"),
    JSON.stringify(spec.manifest, null, 2),
  );

  writeFileSync(
    join(root, "supabase", "config.toml"),
    spec.configToml ??
      Object.keys(spec.functions)
        .map((name) => `[functions.${name}]\nverify_jwt = false\n`)
        .join(""),
  );

  const workflowDir = join(root, ".github", "workflows");
  mkdirSync(workflowDir, { recursive: true });
  writeFileSync(
    join(workflowDir, "deploy-edge-functions.yml"),
    spec.deployWorkflow ?? "run: supabase functions deploy x --no-verify-jwt\n",
  );

  return root;
}

/** A minimal, internally consistent root that the guard should accept. */
function healthyRoot(): string {
  return makeRoot({
    functions: { "dashboard-summary": { "index.ts": STAFF_JWT_SOURCE } },
    manifest: {
      families: { "staff-jwt": STAFF_JWT_FAMILY },
      functions: { "dashboard-summary": baseEntry() },
    },
  });
}

afterEach(() => {
  while (temporaryRoots.length) {
    rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe("checkEdgeFunctionAuth", () => {
  it("accepts a manifest that matches its sources", () => {
    const { problems, checked } = checkEdgeFunctionAuth(healthyRoot());
    expect(problems).toEqual([]);
    expect(checked).toBe(1);
  });

  it("fails when a deployable function is not classified at all", () => {
    // The case that matters most: someone adds a function and ships it with no
    // documented caller. It is live and unauthenticated at the gateway.
    const root = makeRoot({
      functions: {
        "dashboard-summary": { "index.ts": STAFF_JWT_SOURCE },
        "brand-new-function": { "index.ts": "serve(() => new Response('ok'));" },
      },
      manifest: {
        families: { "staff-jwt": STAFF_JWT_FAMILY },
        functions: { "dashboard-summary": baseEntry() },
      },
    });

    const { problems } = checkEdgeFunctionAuth(root);
    expect(problems.join("\n")).toContain("brand-new-function");
    expect(problems.join("\n")).toContain("no entry");
  });

  it("fails when the manifest describes a function that no longer exists", () => {
    const root = makeRoot({
      functions: { "dashboard-summary": { "index.ts": STAFF_JWT_SOURCE } },
      manifest: {
        families: { "staff-jwt": STAFF_JWT_FAMILY },
        functions: {
          "dashboard-summary": baseEntry(),
          "deleted-function": baseEntry(),
        },
      },
    });

    expect(checkEdgeFunctionAuth(root).problems.join("\n")).toContain(
      "deleted-function",
    );
  });

  it("fails when the declared family's auth primitive is missing from the source", () => {
    // The regression this is really guarding: the is_staff() gate gets deleted
    // while the manifest still advertises a staff-only endpoint.
    const root = makeRoot({
      functions: {
        "dashboard-summary": {
          "index.ts": "const { data } = await userClient.auth.getUser();",
        },
      },
      manifest: {
        families: { "staff-jwt": STAFF_JWT_FAMILY },
        functions: { "dashboard-summary": baseEntry() },
      },
    });

    const joined = checkEdgeFunctionAuth(root).problems.join("\n");
    expect(joined).toContain("is_staff");
    expect(joined).toContain("does not reference it");
  });

  it("finds the check in a sibling file when the entrypoint is only a shim", () => {
    // whatsapp-agent's real shape: index.ts is `serve(handleAgentRequest)` and
    // the auth check lives in handler.ts.
    const root = makeRoot({
      functions: {
        "whatsapp-agent": {
          "index.ts": "serve(handleAgentRequest);",
          "handler.ts": STAFF_JWT_SOURCE,
        },
      },
      manifest: {
        families: { "staff-jwt": STAFF_JWT_FAMILY },
        functions: {
          "whatsapp-agent": baseEntry({ authSource: "handler.ts" }),
        },
      },
    });

    expect(checkEdgeFunctionAuth(root).problems).toEqual([]);
  });

  it("does not accept an auth primitive that only appears in a test fixture", () => {
    // A string in __tests__ must never satisfy a production requirement.
    const root = makeRoot({
      functions: {
        "dashboard-summary": {
          "index.ts": "const { data } = await userClient.auth.getUser();",
          "__tests__/fixture.ts": 'rpc("is_staff");',
        },
      },
      manifest: {
        families: { "staff-jwt": STAFF_JWT_FAMILY },
        functions: { "dashboard-summary": baseEntry() },
      },
    });

    expect(checkEdgeFunctionAuth(root).problems.join("\n")).toContain("is_staff");
  });

  it("fails when the declared origin policy is not the one the code uses", () => {
    const root = makeRoot({
      functions: {
        "dashboard-summary": {
          "index.ts": `${STAFF_JWT_SOURCE}\nbuildAllowedOrigins("ACTUAL_ORIGINS");`,
        },
      },
      manifest: {
        families: { "staff-jwt": STAFF_JWT_FAMILY },
        functions: {
          "dashboard-summary": baseEntry({ originPolicy: "CLAIMED_ORIGINS" }),
        },
      },
    });

    const joined = checkEdgeFunctionAuth(root).problems.join("\n");
    expect(joined).toContain("CLAIMED_ORIGINS");
    expect(joined).toContain("ACTUAL_ORIGINS");
  });

  it("fails when a function silently gains service-role access", () => {
    // Service role bypasses RLS, so this field going stale is a real problem.
    const root = makeRoot({
      functions: {
        "dashboard-summary": {
          "index.ts": `${STAFF_JWT_SOURCE}\nDeno.env.get("SUPABASE_SERVICE_ROLE_KEY");`,
        },
      },
      manifest: {
        families: { "staff-jwt": STAFF_JWT_FAMILY },
        functions: { "dashboard-summary": baseEntry({ serviceRole: false }) },
      },
    });

    expect(checkEdgeFunctionAuth(root).problems.join("\n")).toContain(
      "SUPABASE_SERVICE_ROLE_KEY",
    );
  });

  it("fails when config.toml and the manifest disagree", () => {
    const root = makeRoot({
      functions: { "dashboard-summary": { "index.ts": STAFF_JWT_SOURCE } },
      manifest: {
        families: { "staff-jwt": STAFF_JWT_FAMILY },
        functions: {
          "dashboard-summary": baseEntry({ configToml: "declared-false" }),
        },
      },
      // Block present but no verify_jwt: a local deploy would default to true
      // while CI forces false.
      configToml: "[functions.dashboard-summary]\n",
    });

    expect(checkEdgeFunctionAuth(root).problems.join("\n")).toContain(
      "declared-unset",
    );
  });

  it("detects a function absent from config.toml entirely", () => {
    const root = makeRoot({
      functions: { "dashboard-summary": { "index.ts": STAFF_JWT_SOURCE } },
      manifest: {
        families: { "staff-jwt": STAFF_JWT_FAMILY },
        functions: {
          "dashboard-summary": baseEntry({ configToml: "declared-false" }),
        },
      },
      configToml: "[api]\nenabled = true\n",
    });

    expect(checkEdgeFunctionAuth(root).problems.join("\n")).toContain("absent");
  });

  it("rejects a claim that the gateway verifies the JWT", () => {
    const root = makeRoot({
      functions: { "dashboard-summary": { "index.ts": STAFF_JWT_SOURCE } },
      manifest: {
        families: { "staff-jwt": STAFF_JWT_FAMILY },
        functions: { "dashboard-summary": baseEntry({ gatewayVerifyJwt: true }) },
      },
    });

    expect(checkEdgeFunctionAuth(root).problems.join("\n")).toContain(
      "gatewayVerifyJwt must be false",
    );
  });

  it("fails when the deploy workflow stops passing --no-verify-jwt", () => {
    // Every entry claims gatewayVerifyJwt=false because of that flag. If the
    // flag goes, the premise behind all 27 entries has changed.
    const root = makeRoot({
      functions: { "dashboard-summary": { "index.ts": STAFF_JWT_SOURCE } },
      manifest: {
        families: { "staff-jwt": STAFF_JWT_FAMILY },
        functions: { "dashboard-summary": baseEntry() },
      },
      deployWorkflow: "run: supabase functions deploy x\n",
    });

    expect(checkEdgeFunctionAuth(root).problems.join("\n")).toContain(
      "--no-verify-jwt",
    );
  });

  it("requires a rationale from any family that can fail open", () => {
    const root = makeRoot({
      functions: { "dashboard-summary": { "index.ts": STAFF_JWT_SOURCE } },
      manifest: {
        families: {
          "staff-jwt": {
            ...STAFF_JWT_FAMILY,
            failsClosedOnEmptySecret: false,
            emptySecretRationale: "",
          },
        },
        functions: { "dashboard-summary": baseEntry() },
      },
    });

    expect(checkEdgeFunctionAuth(root).problems.join("\n")).toContain(
      "emptySecretRationale",
    );
  });

  it("rejects an empty contract field rather than treating it as answered", () => {
    const root = makeRoot({
      functions: { "dashboard-summary": { "index.ts": STAFF_JWT_SOURCE } },
      manifest: {
        families: { "staff-jwt": STAFF_JWT_FAMILY },
        functions: { "dashboard-summary": baseEntry({ caller: "   " }) },
      },
    });

    expect(checkEdgeFunctionAuth(root).problems.join("\n")).toContain("caller");
  });

  it("flags a family nothing uses, so the family list stays truthful", () => {
    const root = makeRoot({
      functions: { "dashboard-summary": { "index.ts": STAFF_JWT_SOURCE } },
      manifest: {
        families: {
          "staff-jwt": STAFF_JWT_FAMILY,
          "orphan-family": { ...STAFF_JWT_FAMILY, requiredPrimitives: ["nope"] },
        },
        functions: { "dashboard-summary": baseEntry() },
      },
    });

    expect(checkEdgeFunctionAuth(root).problems.join("\n")).toContain(
      "orphan-family",
    );
  });
});

// A family whose single primitive is a plain guard call, for verdict-flow
// cases where the staff-jwt double-primitive shape would blur the assertion.
const INTERNAL_SECRET_FAMILY = {
  description: "x-internal-secret compared with timingSafeEqualHeader.",
  requiredPrimitives: ["timingSafeEqualHeader"],
  unauthorizedStatuses: [401],
  failsClosedOnEmptySecret: true,
  emptySecretRationale: "timingSafeEqualHeader rejects an unset secret.",
};

function internalEntry(overrides: Record<string, unknown> = {}) {
  return baseEntry({ authFamily: "internal-secret", ...overrides });
}

function internalRoot(indexSource: string): string {
  return makeRoot({
    functions: { "some-fn": { "index.ts": indexSource } },
    manifest: {
      families: { "internal-secret": INTERNAL_SECRET_FAMILY },
      functions: { "some-fn": internalEntry() },
    },
  });
}

describe("verdict-flow analysis", () => {
  // The whole point of the pass: every shape below satisfies the old substring
  // check while authenticating nothing.

  it("fails a call whose result is discarded", () => {
    const root = internalRoot(
      `timingSafeEqualHeader(req.headers.get("x-internal-secret"), SECRET);`,
    );
    expect(checkEdgeFunctionAuth(root).problems.join("\n")).toContain(
      "discards its result",
    );
  });

  it("fails a guard whose branches never exit", () => {
    const root = internalRoot(`
      if (!timingSafeEqualHeader(req.headers.get("x-internal-secret"), SECRET)) {
        console.warn("unauthorized caller, carrying on anyway");
      }
    `);
    expect(checkEdgeFunctionAuth(root).problems.join("\n")).toContain(
      "never returns or throws",
    );
  });

  it("does not accept a primitive that only appears in a comment", () => {
    const root = internalRoot(`
      // timingSafeEqualHeader(header, secret) used to be called here.
      const ok = true;
    `);
    expect(checkEdgeFunctionAuth(root).problems.join("\n")).toContain(
      "does not reference it",
    );
  });

  it("accepts the named-helper shape: verdict returned to a guarded call site", () => {
    const root = internalRoot(`
      function isInternalCaller(req: Request): boolean {
        return timingSafeEqualHeader(req.headers.get("x-internal-secret"), SECRET);
      }
      export function handler(req: Request): Response {
        if (!isInternalCaller(req)) return new Response("unauthorized", { status: 401 });
        return new Response("ok");
      }
    `);
    expect(checkEdgeFunctionAuth(root).problems).toEqual([]);
  });

  it("fails when the helper holding the verdict is never called", () => {
    const root = internalRoot(`
      function isInternalCaller(req: Request): boolean {
        return timingSafeEqualHeader(req.headers.get("x-internal-secret"), SECRET);
      }
    `);
    expect(checkEdgeFunctionAuth(root).problems.join("\n")).toContain(
      "never called",
    );
  });

  it("fails a captured verdict that nothing ever reads", () => {
    const root = internalRoot(`
      const ok = timingSafeEqualHeader(req.headers.get("x-internal-secret"), SECRET);
    `);
    expect(checkEdgeFunctionAuth(root).problems.join("\n")).toContain(
      "never used",
    );
  });

  const PUBLIC_FAMILY = {
    description: "Unauthenticated; origin allowlist plus rate limits.",
    requiredPrimitives: ["buildAllowedOrigins"],
    flowOnlyPrimitives: ["buildAllowedOrigins"],
    unauthorizedStatuses: [429],
    failsClosedOnEmptySecret: true,
    emptySecretRationale: "No secret participates; abuse is rate limited.",
  };

  it("lets a flow-only primitive pass without a guard, as long as its result is used", () => {
    // buildAllowedOrigins' verdict becomes CORS headers, not a 401 — the one
    // declared exception to the guard requirement.
    const root = makeRoot({
      functions: {
        "public-fn": {
          "index.ts": `
            const ALLOWED = buildAllowedOrigins("X_ORIGINS");
            export const corsFor = (req: Request) => buildCorsHeaders(req, ALLOWED);
          `,
        },
      },
      manifest: {
        families: { "public-rate-limited": PUBLIC_FAMILY },
        functions: {
          "public-fn": baseEntry({
            authFamily: "public-rate-limited",
            originPolicy: "X_ORIGINS",
          }),
        },
      },
    });
    expect(checkEdgeFunctionAuth(root).problems).toEqual([]);
  });

  it("still fails a flow-only primitive whose result is discarded", () => {
    const root = makeRoot({
      functions: {
        "public-fn": { "index.ts": `buildAllowedOrigins("X_ORIGINS");` },
      },
      manifest: {
        families: { "public-rate-limited": PUBLIC_FAMILY },
        functions: {
          "public-fn": baseEntry({
            authFamily: "public-rate-limited",
            originPolicy: "X_ORIGINS",
          }),
        },
      },
    });
    expect(checkEdgeFunctionAuth(root).problems.join("\n")).toContain(
      "discards its result",
    );
  });

  it("rejects a flowOnlyPrimitives entry the family does not require", () => {
    const root = makeRoot({
      functions: { "some-fn": { "index.ts": STAFF_JWT_SOURCE } },
      manifest: {
        families: {
          "staff-jwt": { ...STAFF_JWT_FAMILY, flowOnlyPrimitives: ["nope"] },
        },
        functions: { "some-fn": baseEntry() },
      },
    });
    expect(checkEdgeFunctionAuth(root).problems.join("\n")).toContain(
      "not in requiredPrimitives",
    );
  });
});

describe("the repository's own Edge Function auth manifest", () => {
  it("classifies every deployable function and agrees with the sources", () => {
    // The live assertion. If someone adds a function, or deletes an auth check,
    // this fails here as well as in CI.
    const { problems, checked } = checkEdgeFunctionAuth(process.cwd());
    expect(problems).toEqual([]);
    expect(checked).toBeGreaterThan(0);
  });
});
