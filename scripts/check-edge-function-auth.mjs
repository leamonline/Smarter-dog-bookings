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
//   3. VERDICT FLOW. Referencing a primitive is not the same as obeying it: a
//      call whose result is discarded, or a guard whose branch no longer
//      returns, satisfies a substring check while authenticating nothing. So
//      each required primitive's source is parsed (TypeScript syntax only — no
//      type checking, no execution) and its result must either terminate in an
//      if-guard that returns or throws, or be returned to a caller whose own
//      call sites do. A family may list a primitive under flowOnlyPrimitives,
//      meaning its result only has to be captured and used — the shape of
//      buildAllowedOrigins, whose verdict becomes CORS headers rather than a
//      401. Anything the analysis cannot follow fails the build: restructure
//      the guard into a recognised shape, or extend the analyzer. Fail closed.
//
// It still does not execute any handler; the runtime behaviour of the shared
// primitives is proven by the Deno contract tests in
// _shared/authContracts.test.ts.
//
// Needs node_modules: the verdict-flow pass uses the `typescript` package
// (already a devDependency, the same compiler `npm run typecheck` uses), so
// the agent-tests job runs `npm ci` before this step. The Deno steps in that
// job are unaffected — they pass --node-modules-dir=none and never resolve
// through node_modules.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
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

// ---------------------------------------------------------------------------
// Verdict-flow analysis.
//
// A substring match proves a primitive is mentioned; this proves its result is
// acted on. The walk is deliberately syntactic and fail-closed: it follows the
// verdict through the shapes this codebase actually uses — a call inside an
// if-condition, a captured boolean tested later, a helper that returns the
// verdict to a guarded call site, a header value passed onward into a verifier
// — and reports anything it cannot follow rather than assuming the best. A
// pass therefore means every required primitive's verdict reaches an exit; an
// unrecognisable chain is a build failure, never a silent success.

const GUARD_KIND = "guard";
const FLOW_KIND = "flow";
const MAX_VERDICT_DEPTH = 6;

function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

/**
 * Innermost CallExpressions that invoke the primitive.
 *
 * Two shapes count, and only two:
 *   - the callee names it (`timingSafeEqualHeader(...)`, `client.auth.getUser()`),
 *   - a string argument IS it, exactly (`rpc("is_staff")`,
 *     `headers.get("x-hub-signature-256")`).
 * Exact argument equality matters: `console.error("is_staff rpc failed")` must
 * not count as an is_staff call site, or every log line becomes a false alarm.
 *
 * Innermost, because in `verify(req.headers.get("x-hub-signature-256"))` the
 * verdict starts at the headers.get call and flows INTO verify — tracking the
 * outer call as well would double-count.
 */
function collectPrimitiveCalls(sf, primitive) {
  const matches = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const calleeNames = node.expression.getText(sf).includes(primitive);
      const argIs = node.arguments.some(
        (arg) => ts.isStringLiteralLike(arg) && arg.text === primitive,
      );
      if (calleeNames || argIs) matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return matches.filter(
    (call) => !matches.some((other) => other !== call && other.pos >= call.pos && other.end <= call.end),
  );
}

/** May the verdict keep ascending through this parent unchanged? */
function ascendsThrough(parent, child) {
  if (ts.isParenthesizedExpression(parent)) return true;
  if (ts.isAwaitExpression(parent)) return true;
  if (ts.isNonNullExpression(parent)) return true;
  if (ts.isAsExpression(parent)) return true;
  if (ts.isPrefixUnaryExpression(parent) && parent.operator === ts.SyntaxKind.ExclamationToken) return true;
  if (ts.isBinaryExpression(parent)) {
    const op = parent.operatorToken.kind;
    return (
      op === ts.SyntaxKind.AmpersandAmpersandToken ||
      op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.QuestionQuestionToken ||
      op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      op === ts.SyntaxKind.EqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsToken
    );
  }
  if (ts.isConditionalExpression(parent)) return true;
  if (ts.isPropertyAccessExpression(parent) && parent.expression === child) return true;
  if (ts.isElementAccessExpression(parent) && parent.expression === child) return true;
  if (ts.isPropertyAssignment(parent) && parent.initializer === child) return true;
  if (ts.isShorthandPropertyAssignment(parent)) return true;
  if (ts.isObjectLiteralExpression(parent) || ts.isArrayLiteralExpression(parent)) return true;
  return false;
}

/** Does this subtree exit (return/throw), without crediting nested functions? */
function subtreeExits(node) {
  if (!node) return false;
  if (ts.isReturnStatement(node) || ts.isThrowStatement(node)) return true;
  if (ts.isFunctionLike(node)) return false;
  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found) found = subtreeExits(child);
  });
  return found;
}

function collectBoundNames(bindingName, into) {
  if (ts.isIdentifier(bindingName)) {
    into.push(bindingName);
    return;
  }
  if (ts.isObjectBindingPattern(bindingName) || ts.isArrayBindingPattern(bindingName)) {
    for (const element of bindingName.elements) {
      if (ts.isBindingElement(element)) collectBoundNames(element.name, into);
    }
  }
}

function enclosingScope(node, sf) {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionLike(current) && current.body) return current.body;
    current = current.parent;
  }
  return sf;
}

/** Is this identifier a read of the variable, rather than a name/declaration? */
function isValueUse(id) {
  const parent = id.parent;
  if (ts.isVariableDeclaration(parent) && parent.name === id) return false;
  if (ts.isBindingElement(parent)) return false;
  if (ts.isPropertyAccessExpression(parent) && parent.name === id) return false;
  if (ts.isPropertyAssignment(parent) && parent.name === id) return false;
  if (ts.isParameter(parent) && parent.name === id) return false;
  if (ts.isFunctionDeclaration(parent) && parent.name === id) return false;
  if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isNamespaceImport(parent)) return false;
  return true;
}

function findIdentifierUses(scope, name, declarationNode) {
  const uses = [];
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === name && node !== declarationNode && isValueUse(node)) {
      uses.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return uses;
}

function collectNamedCalls(sf, name) {
  const calls = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (
        (ts.isIdentifier(callee) && callee.text === name) ||
        (ts.isPropertyAccessExpression(callee) && callee.name.text === name)
      ) {
        calls.push(node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return calls;
}

/**
 * Follow one verdict-carrying expression upward.
 *
 * `direct` marks the primitive call itself, where a discarded or unfollowable
 * result is a hard error. Derived uses that go nowhere are merely unguarded —
 * a captured verdict may legitimately also be logged or stored (the webhook
 * records signature_valid for forensics) as long as SOME use reaches an exit.
 * Chain explanations (a conditional that never exits, an anonymous carrier)
 * land in state.diagnostics and surface only when no chain guards at all:
 * they explain a failure, and are noise beside a success — tokenInfo.feedType
 * branching for staff-name enrichment is not a broken guard when
 * `if (!tokenInfo) return 401` sits fifty lines above it.
 */
function followVerdict(node, sf, label, primitive, state, direct) {
  if (state.depth > MAX_VERDICT_DEPTH) {
    state.diagnostics.push(
      `"${primitive}": verdict chain deeper than ${MAX_VERDICT_DEPTH} levels at ${label}:${lineOf(sf, node)} — flatten the indirection or extend the analyzer.`,
    );
    return false;
  }

  let current = node;
  for (;;) {
    const parent = current.parent;
    if (!parent) return false;

    if (ascendsThrough(parent, current)) {
      current = parent;
      continue;
    }

    if (ts.isIfStatement(parent) && parent.expression === current) {
      if (subtreeExits(parent.thenStatement) || subtreeExits(parent.elseStatement)) return true;
      state.diagnostics.push(
        `"${primitive}": the guard at ${label}:${lineOf(sf, parent)} never returns or throws in either branch — an unauthorized caller falls straight through.`,
      );
      return false;
    }

    if (ts.isReturnStatement(parent) || (ts.isArrowFunction(parent) && parent.body === current)) {
      return followCarrier(parent, sf, label, primitive, state);
    }

    if (ts.isVariableDeclaration(parent) && parent.initializer === current) {
      return followBinding(parent, sf, label, primitive, state, direct);
    }

    if (
      ts.isBinaryExpression(parent) &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      parent.right === current &&
      ts.isIdentifier(parent.left)
    ) {
      const scope = enclosingScope(parent, sf);
      state.depth += 1;
      const uses = findIdentifierUses(scope, parent.left.text, parent.left);
      let guarded = false;
      for (const use of uses) {
        if (followVerdict(use, sf, label, primitive, state, false)) guarded = true;
      }
      state.depth -= 1;
      return guarded;
    }

    if (ts.isCallExpression(parent) && parent.arguments.includes(current)) {
      // The verdict feeds another call (a verifier, a response builder); its
      // result becomes the thing to track.
      current = parent;
      continue;
    }

    if (ts.isExpressionStatement(parent)) {
      if (direct) {
        state.problems.push(
          `"${primitive}": the call at ${label}:${lineOf(sf, current)} discards its result — the check runs but nothing acts on the verdict.`,
        );
      }
      return false;
    }

    if (direct) {
      state.problems.push(
        `"${primitive}": unrecognised verdict flow (${ts.SyntaxKind[parent.kind]}) at ${label}:${lineOf(sf, current)} — restructure into a guard shape the analyzer recognises, or extend scripts/check-edge-function-auth.mjs. This check fails closed.`,
      );
    }
    return false;
  }
}

/** The verdict is returned: verify the enclosing function's call sites. */
function followCarrier(exitNode, sf, label, primitive, state) {
  let fn = exitNode;
  while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
  if (!fn) return false;

  let name = null;
  if ((ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)) && fn.name) {
    name = fn.name.text;
  } else if (fn.parent && ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) {
    name = fn.parent.name.text;
  } else if (ts.isMethodDeclaration(fn) && ts.isIdentifier(fn.name)) {
    name = fn.name.text;
  }
  if (!name) {
    state.diagnostics.push(
      `"${primitive}": verdict returned from an anonymous function at ${label}:${lineOf(sf, fn)} — bind it to a name so its call sites can be verified.`,
    );
    return false;
  }

  if (state.carrierMemo.has(name)) {
    const memoised = state.carrierMemo.get(name);
    return memoised === true; // "pending" (a cycle) counts as unguarded
  }
  state.carrierMemo.set(name, "pending");

  const sites = collectNamedCalls(sf, name);
  if (sites.length === 0) {
    state.diagnostics.push(
      `"${primitive}": ${name}() returns the verdict but is never called (${label}:${lineOf(sf, fn)}) — the check is unreachable.`,
    );
    state.carrierMemo.set(name, false);
    return false;
  }

  state.depth += 1;
  let guarded = false;
  for (const site of sites) {
    if (followVerdict(site, sf, label, primitive, state, false)) guarded = true;
  }
  state.depth -= 1;
  state.carrierMemo.set(name, guarded);
  return guarded;
}

/** The verdict is captured into bindings: verify their later uses. */
function followBinding(declaration, sf, label, primitive, state, direct) {
  const names = [];
  collectBoundNames(declaration.name, names);
  if (names.length === 0) return false;

  const scope = enclosingScope(declaration, sf);
  state.depth += 1;
  let guarded = false;
  let anyUse = false;
  for (const nameNode of names) {
    const uses = findIdentifierUses(scope, nameNode.text, nameNode);
    if (uses.length > 0) anyUse = true;
    for (const use of uses) {
      if (followVerdict(use, sf, label, primitive, state, false)) guarded = true;
    }
  }
  state.depth -= 1;

  if (!anyUse && direct) {
    state.problems.push(
      `"${primitive}": result captured at ${label}:${lineOf(sf, declaration)} but the binding is never used — the check runs and nothing reads the verdict.`,
    );
  }
  return guarded;
}

/**
 * Analyze one primitive's verdict flow through one source file.
 *
 * kind "guard": at least one chain must end in an if-guard that returns or
 * throws. kind "flow": the result only has to be captured and used — for
 * primitives whose verdict is enforced by something other than an early exit.
 */
export function analyzeVerdictFlow(sourceText, primitive, kind, label) {
  const sf = ts.createSourceFile(label, sourceText, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const calls = collectPrimitiveCalls(sf, primitive);
  if (calls.length === 0) return { callSites: 0, problems: [] };

  const state = { depth: 0, carrierMemo: new Map(), problems: [], diagnostics: [] };
  let guarded = false;
  for (const call of calls) {
    if (followVerdict(call, sf, label, primitive, state, true)) guarded = true;
  }

  // Hard problems always surface. Diagnostics are the why-not breadcrumbs —
  // relevant only when a guard-kind primitive found no guard at all.
  const problems = [...new Set(state.problems)];
  if (kind === GUARD_KIND && !guarded) {
    problems.push(...new Set(state.diagnostics));
    problems.push(
      `"${primitive}": ${calls.length} call site(s) in ${label}, but no verdict reaches an if-guard that returns or throws — the check is decorative.`,
    );
  }
  return { callSites: calls.length, problems };
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
      // says the check lives — as executable call sites whose verdict is acted
      // on, not as substrings. This is what catches a check being deleted, and
      // equally a check left in place but stripped of its consequences.
      const authSource = readFileSync(authSourcePath, "utf8");
      const flowOnly = new Set(family.flowOnlyPrimitives ?? []);
      for (const primitive of family.requiredPrimitives ?? []) {
        const kind = flowOnly.has(primitive) ? FLOW_KIND : GUARD_KIND;
        const { callSites, problems: flowProblems } = analyzeVerdictFlow(
          authSource,
          primitive,
          kind,
          entry.authSource,
        );
        if (callSites === 0) {
          problems.push(
            `${name}: declares auth family "${entry.authFamily}", which requires "${primitive}", but ${entry.authSource} does not reference it in executable code (comments and import lists do not count). Either the check was removed or the family is wrong.`,
          );
          continue;
        }
        for (const problem of flowProblems) problems.push(`${name}: ${problem}`);
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
    if (family.flowOnlyPrimitives !== undefined) {
      if (!Array.isArray(family.flowOnlyPrimitives)) {
        problems.push(
          `Family "${id}": flowOnlyPrimitives must be an array when present.`,
        );
      } else {
        for (const primitive of family.flowOnlyPrimitives) {
          if (!(family.requiredPrimitives ?? []).includes(primitive)) {
            problems.push(
              `Family "${id}": flowOnlyPrimitives lists "${primitive}", which is not in requiredPrimitives — a flow exemption for a primitive the family does not require is meaningless.`,
            );
          }
        }
      }
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
