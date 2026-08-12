#!/usr/bin/env node
// Enforce the Edge Function caller/authentication contract.
//
// WHY THIS EXISTS
//
// CI deploys every Edge Function with `--no-verify-jwt` (see
// .github/workflows/deploy-edge-functions.yml), so the Supabase gateway
// authenticates nothing. Each function's own in-function check IS the security
// boundary, and that boundary is spread across every entrypoint under
// supabase/functions/. Nothing previously stopped a new function shipping with
// no check at all, or an existing one quietly losing its check — the type check
// and the Deno tests both pass regardless.
//
// So this script does two jobs:
//
//   1. DISCOVERY. Every deployable entrypoint must appear in
//      _shared/authManifest.json, and every manifest entry must correspond to a
//      real deployable function. A new function fails the build until it is
//      classified.
//
//   2. ANTI-DRIFT. A manifest that is merely prose would rot. Every mechanically
//      checkable field is recomputed from the actual sources — the origin
//      allowlist env var, service-role usage, the config.toml declaration, and
//      the auth primitives the declared family requires — and compared with what
//      the entry claims. An entry cannot describe code that no longer exists.
//
// It deliberately does NOT try to prove the runtime behaviour of a check; that
// is what the Deno contract tests in _shared/authContracts.test.ts do for the
// shared primitives every family is built from.
//
// Node builtins only, and no npm install: this runs in the `agent-tests` job
// alongside check:edge-function-types, which never runs `npm ci`.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { discoverEdgeFunctionEntrypoints } from "./check-edge-function-types.mjs";

const FUNCTIONS_DIR = join("supabase", "functions");
const MANIFEST_PATH = join(FUNCTIONS_DIR, "_shared", "authManifest.json");
const CONFIG_TOML_PATH = join("supabase", "config.toml");
const DEPLOY_WORKFLOW_PATH = join(
  ".github",
  "workflows",
  "deploy-edge-functions.yml",
);

const REQUIRED_FUNCTION_FIELDS = [
  "authFamily",
  "authSource",
  "caller",
  "role",
  "gatewayVerifyJwt",
  "configToml",
  "serviceRole",
  "originPolicy",
  "replayDefence",
  "unauthorizedResponse",
  "emptySecretBehaviour",
  "notes",
];

// `notes` may legitimately be empty; everything else must say something.
const FIELDS_ALLOWED_EMPTY = new Set(["notes"]);

const VALID_CONFIG_TOML_STATES = new Set([
  "declared-false",
  "declared-unset",
  "absent",
]);

/** Function name from a "supabase/functions/<name>/index.ts" path. */
function functionNameFromEntrypoint(entrypoint) {
  return entrypoint.split(/[\\/]/).at(-2);
}

/**
 * Source of every non-test .ts file in a function directory, concatenated.
 *
 * Whole-directory rather than index.ts alone because auth does not always live
 * in the entrypoint: whatsapp-agent/index.ts is a bare `serve(handleAgentRequest)`
 * shim and the real check sits in handler.ts. Tests are excluded so a string in
 * a fixture can never satisfy a production requirement.
 */
function readFunctionSources(root, name) {
  const dir = join(root, FUNCTIONS_DIR, name);
  const sources = new Map();

  const walk = (current, relative) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      const absolute = join(current, entry.name);
      const relativePath = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(absolute, relativePath);
        continue;
      }
      if (!entry.name.endsWith(".ts")) continue;
      if (entry.name.endsWith(".test.ts")) continue;
      sources.set(relativePath, readFileSync(absolute, "utf8"));
    }
  };

  walk(dir, "");
  return sources;
}

/** The env var passed to buildAllowedOrigins(), or null when never called. */
function detectOriginPolicy(sources) {
  for (const source of sources.values()) {
    const match = source.match(/buildAllowedOrigins\(\s*["']([^"']+)["']\s*\)/);
    if (match) return match[1];
  }
  return null;
}

function detectServiceRole(sources) {
  for (const source of sources.values()) {
    if (source.includes("SUPABASE_SERVICE_ROLE_KEY")) return true;
  }
  return false;
}

/**
 * How config.toml declares a function.
 *
 * This matters because the two deploy paths disagree: CI passes
 * --no-verify-jwt and ignores this file, while a local
 * `supabase functions deploy` reads it. "absent" and "declared-unset" both mean
 * a local deploy would fall back to the Supabase default (verify_jwt = true) and
 * behave differently from production.
 */
function parseConfigTomlStates(configSource) {
  const states = new Map();
  const lines = configSource.split(/\r?\n/);
  let current = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const section = trimmed.match(/^\[([^\]]+)\]$/);
    if (section) {
      const path = section[1];
      current = path.startsWith("functions.")
        ? path.slice("functions.".length)
        : null;
      if (current) states.set(current, "declared-unset");
      continue;
    }
    if (current && /^verify_jwt\s*=\s*false\b/.test(trimmed)) {
      states.set(current, "declared-false");
    }
  }

  return states;
}

function checkDeployWorkflowPremise(root, problems) {
  const workflowPath = join(root, DEPLOY_WORKFLOW_PATH);
  if (!existsSync(workflowPath)) {
    problems.push(
      `${DEPLOY_WORKFLOW_PATH} is missing. The manifest asserts gatewayVerifyJwt=false for every function on the strength of this workflow's --no-verify-jwt flag; without the file that premise is unverified.`,
    );
    return;
  }
  const source = readFileSync(workflowPath, "utf8");
  if (!source.includes("--no-verify-jwt")) {
    problems.push(
      `${DEPLOY_WORKFLOW_PATH} no longer passes --no-verify-jwt. Every manifest entry claims gatewayVerifyJwt=false because of that flag. If gateway verification is now on for some functions, update both the workflow comment and each affected manifest entry.`,
    );
  }
}

export function checkEdgeFunctionAuth(root = process.cwd()) {
  const problems = [];

  const manifestPath = join(root, MANIFEST_PATH);
  if (!existsSync(manifestPath)) {
    return { problems: [`${MANIFEST_PATH} not found.`], checked: 0 };
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    return {
      problems: [`${MANIFEST_PATH} is not valid JSON: ${err.message}`],
      checked: 0,
    };
  }

  const families = manifest.families ?? {};
  const entries = manifest.functions ?? {};

  if (Object.keys(families).length === 0) {
    problems.push(`${MANIFEST_PATH} declares no auth families.`);
  }

  // --- 1. Discovery: filesystem and manifest must agree exactly -------------
  const entrypoints = discoverEdgeFunctionEntrypoints(root);
  const deployed = entrypoints.map(functionNameFromEntrypoint).sort();
  const classified = Object.keys(entries).sort();

  for (const name of deployed) {
    if (!classified.includes(name)) {
      problems.push(
        `Edge Function "${name}" is deployable but has no entry in ${MANIFEST_PATH}. Every deployable function must declare its caller and authentication contract — it is deployed with --no-verify-jwt, so an unclassified function is an unreviewed public endpoint.`,
      );
    }
  }
  for (const name of classified) {
    if (!deployed.includes(name)) {
      problems.push(
        `${MANIFEST_PATH} classifies "${name}", but supabase/functions/${name}/index.ts does not exist. Remove the stale entry or restore the function.`,
      );
    }
  }

  checkDeployWorkflowPremise(root, problems);

  // --- 2. config.toml, read once -------------------------------------------
  const configPath = join(root, CONFIG_TOML_PATH);
  const configStates = existsSync(configPath)
    ? parseConfigTomlStates(readFileSync(configPath, "utf8"))
    : new Map();
  if (!existsSync(configPath)) {
    problems.push(`${CONFIG_TOML_PATH} not found.`);
  }

  // --- 3. Per-function field and anti-drift checks --------------------------
  for (const name of deployed) {
    const entry = entries[name];
    if (!entry) continue; // already reported above

    for (const field of REQUIRED_FUNCTION_FIELDS) {
      if (!(field in entry)) {
        problems.push(`${name}: missing required field "${field}".`);
        continue;
      }
      const value = entry[field];
      if (
        typeof value === "string" &&
        value.trim() === "" &&
        !FIELDS_ALLOWED_EMPTY.has(field)
      ) {
        problems.push(
          `${name}: field "${field}" is empty. State the contract explicitly — a blank field reads as "nobody checked".`,
        );
      }
    }

    const family = families[entry.authFamily];
    if (!family) {
      problems.push(
        `${name}: declares unknown auth family "${entry.authFamily}". Known families: ${Object.keys(families).sort().join(", ")}.`,
      );
      continue;
    }

    if (entry.gatewayVerifyJwt !== false) {
      problems.push(
        `${name}: gatewayVerifyJwt must be false — CI deploys every function with --no-verify-jwt. If this function genuinely needs gateway verification, it must also be deployed outside the workflow's blanket loop.`,
      );
    }

    if (!VALID_CONFIG_TOML_STATES.has(entry.configToml)) {
      problems.push(
        `${name}: configToml must be one of ${[...VALID_CONFIG_TOML_STATES].join(", ")}, got "${entry.configToml}".`,
      );
    }

    const sources = readFunctionSources(root, name);

    const authSourcePath = join(root, FUNCTIONS_DIR, name, entry.authSource);
    if (!existsSync(authSourcePath) || !statSync(authSourcePath).isFile()) {
      problems.push(
        `${name}: authSource "${entry.authSource}" does not exist in supabase/functions/${name}/.`,
      );
    } else {
      // The declared family's primitives must actually appear where the entry
      // says the check lives. This is what catches a check being deleted.
      const authSource = readFileSync(authSourcePath, "utf8");
      for (const primitive of family.requiredPrimitives ?? []) {
        if (!authSource.includes(primitive)) {
          problems.push(
            `${name}: declares auth family "${entry.authFamily}", which requires "${primitive}", but ${entry.authSource} does not reference it. Either the check was removed or the family is wrong.`,
          );
        }
      }
    }

    const actualOrigin = detectOriginPolicy(sources);
    const declaredOrigin = entry.originPolicy ?? null;
    if (actualOrigin !== declaredOrigin) {
      problems.push(
        `${name}: originPolicy says ${declaredOrigin === null ? "null" : `"${declaredOrigin}"`}, but the source ${actualOrigin === null ? "never calls buildAllowedOrigins()" : `calls buildAllowedOrigins("${actualOrigin}")`}.`,
      );
    }

    const actualServiceRole = detectServiceRole(sources);
    if (entry.serviceRole !== actualServiceRole) {
      problems.push(
        `${name}: serviceRole says ${entry.serviceRole}, but the source ${actualServiceRole ? "does" : "does not"} reference SUPABASE_SERVICE_ROLE_KEY. Service-role access bypasses RLS, so this field must be accurate.`,
      );
    }

    const actualConfigState = configStates.get(name) ?? "absent";
    if (entry.configToml !== actualConfigState) {
      problems.push(
        `${name}: configToml says "${entry.configToml}", but supabase/config.toml is "${actualConfigState}".`,
      );
    }
  }

  // --- 4. Family shape ------------------------------------------------------
  for (const [id, family] of Object.entries(families)) {
    if (!Array.isArray(family.requiredPrimitives) || family.requiredPrimitives.length === 0) {
      problems.push(
        `Family "${id}": requiredPrimitives must be a non-empty array — it is the only thing tying the family to real code.`,
      );
    }
    if (!Array.isArray(family.unauthorizedStatuses) || family.unauthorizedStatuses.length === 0) {
      problems.push(
        `Family "${id}": unauthorizedStatuses must be a non-empty array.`,
      );
    }
    if (typeof family.failsClosedOnEmptySecret !== "boolean") {
      problems.push(
        `Family "${id}": failsClosedOnEmptySecret must be a boolean.`,
      );
    }
    if (
      family.failsClosedOnEmptySecret === false &&
      !String(family.emptySecretRationale ?? "").trim()
    ) {
      problems.push(
        `Family "${id}": declares failsClosedOnEmptySecret=false without an emptySecretRationale. A family that can fail open must say exactly why that is acceptable.`,
      );
    }
    const used = deployed.some((name) => entries[name]?.authFamily === id);
    if (!used) {
      problems.push(
        `Family "${id}" is declared but no deployable function uses it. Remove it, so the family list stays an accurate description of the live surface.`,
      );
    }
  }

  return { problems, checked: deployed.length };
}

function main() {
  let result;
  try {
    result = checkEdgeFunctionAuth();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const { problems, checked } = result;

  if (problems.length > 0) {
    console.error(
      `Edge Function auth contract: ${problems.length} problem(s) across ${checked} function(s).\n`,
    );
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    console.error(
      "\nSee docs/edge-function-auth.md for what each field means and how to classify a new function.",
    );
    process.exit(1);
  }

  console.log(
    `Edge Function auth contract: ${checked} deployable function(s) classified and consistent with their sources.`,
  );
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
