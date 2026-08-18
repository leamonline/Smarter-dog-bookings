#!/usr/bin/env node
// Type-check every deployable Supabase Edge Function entrypoint.
//
// WHY THIS EXISTS
//
// CI's `agent-tests` job runs `deno test ... supabase/functions/`, and Deno
// only type-checks modules reachable from the *.test.ts files it discovers.
// No test imports an index.ts, so before this script every Edge Function
// entrypoint shipped unchecked. PR #589 proved the cost: the full lint +
// typecheck + test + build bar passed twice while two real type errors sat in
// an entrypoint (an unsound cast from PostgrestBuilder — a thenable, not a
// Promise — and setTimeout assumed to return number). Both were found only by
// running `deno check` by hand.
//
// It matters more than it looks because a change under
// supabase/functions/_shared/** redeploys *every* function, so an undetected
// entrypoint error surfaces after merge, during deployment, across all of them.
//
// WHY A SCRIPT RATHER THAN A GLOB IN THE WORKFLOW
//
// `deno check supabase/functions/*/index.ts` exits 0 when the glob matches
// nothing — a rename or a restructure would silently switch the gate off with
// CI still green. Discovery here fails loudly instead, prints exactly what it
// checked, and sorts so the output is stable run to run.
//
// Node builtins only: the agent-tests job deliberately never runs `npm ci`.

import { readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const FUNCTIONS_DIR = join("supabase", "functions");

// Directories under supabase/functions that are never deployed as a function.
// _shared is common code imported by the entrypoints; it gets type-checked
// transitively, through whichever entrypoint imports it.
const NON_DEPLOYABLE = new Set(["_shared"]);

/**
 * Deployable Edge Function entrypoints, as repo-relative paths, sorted.
 *
 * A directory counts as deployable when it contains an index.ts — the same
 * rule `supabase functions deploy` applies. Throws rather than returning []
 * so a discovery that finds nothing can never be mistaken for a clean run.
 */
export function discoverEdgeFunctionEntrypoints(root = process.cwd()) {
  const functionsRoot = join(root, FUNCTIONS_DIR);

  let entries;
  try {
    entries = readdirSync(functionsRoot, { withFileTypes: true });
  } catch (err) {
    throw new Error(
      `Cannot read ${FUNCTIONS_DIR} under ${root}: ${err.message}`,
    );
  }

  const entrypoints = entries
    .filter((entry) => entry.isDirectory() && !NON_DEPLOYABLE.has(entry.name))
    .map((entry) => join(FUNCTIONS_DIR, entry.name, "index.ts"))
    .filter((relative) => {
      const absolute = join(root, relative);
      return existsSync(absolute) && statSync(absolute).isFile();
    })
    .sort();

  if (entrypoints.length === 0) {
    throw new Error(
      `Found no deployable Edge Function entrypoints under ${FUNCTIONS_DIR}. ` +
        "Either the directory moved or discovery is broken — failing rather " +
        "than reporting a clean type check over nothing.",
    );
  }

  return entrypoints;
}

function main() {
  let entrypoints;
  try {
    entrypoints = discoverEdgeFunctionEntrypoints();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  console.log(
    `Type-checking ${entrypoints.length} Edge Function entrypoint(s):`,
  );
  for (const entrypoint of entrypoints) console.log(`  ${entrypoint}`);

  // --node-modules-dir=none: Deno must never resolve through node_modules,
  // whether or not one exists — the agent-tests job now installs it for
  // check:edge-auth's TypeScript parser, and locally it is always present.
  // Without the flag, package.json makes Deno expect npm-style resolution and
  // behaviour would differ between those environments. No --allow-* flags:
  // `deno check` performs no runtime work, it only resolves and type-checks.
  const result = spawnSync(
    "deno",
    ["check", "--node-modules-dir=none", ...entrypoints],
    { stdio: "inherit" },
  );

  if (result.error) {
    console.error(`Could not run deno: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

// Only run when invoked directly, so importing this module from a test does
// not shell out to deno.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
