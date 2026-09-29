#!/usr/bin/env node
// `npm run dev` — the Vite dev server, on sample data unless you ask otherwise.
//
// WHY THIS EXISTS (#875)
//
// A normal .env.local holds production Supabase credentials, and plain `vite`
// used them: a dev session was a production client. Signed in as staff it
// could read real customer records and, through the edge functions and the
// booking triggers, send real WhatsApp, SMS and email to real customers.
//
// So the default is now VITE_FORCE_OFFLINE=1 — the same deterministic sample
// data Vitest and Playwright already use — and connecting to a real project is
// a deliberate, named act: `npm run dev:live`. In live mode the app shows a
// banner naming the project it is connected to (src/components/dev/).
//
// A process env var wins over .env files in Vite, which is also how
// playwright.config.ts forces offline mode; nothing here reads .env.local.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const LIVE_FLAG = "--live";

/**
 * Decide the dev server's environment and arguments. Pure, so the default
 * (offline) is pinned by a test rather than by memory.
 */
export function resolveDevLaunch(argv, env) {
  const live = argv.includes(LIVE_FLAG);
  const viteArgs = argv.filter((arg) => arg !== LIVE_FLAG);
  const nextEnv = { ...env };
  if (live) {
    // An inherited VITE_FORCE_OFFLINE would silently undo the opt-in.
    delete nextEnv.VITE_FORCE_OFFLINE;
  } else {
    nextEnv.VITE_FORCE_OFFLINE = "1";
  }
  return { live, viteArgs, env: nextEnv };
}

function main() {
  const { live, viteArgs, env } = resolveDevLaunch(process.argv.slice(2), process.env);
  process.stdout.write(
    live
      ? "\n  ⚠  dev:live — connecting to the Supabase project in your .env.local.\n" +
          "     Actions here can read real customer data and send real messages.\n\n"
      : "\n  Sample data (offline). Run `npm run dev:live` to connect to a real project.\n\n",
  );
  const require = createRequire(import.meta.url);
  // vite/bin is not in the package's exports map, so resolve via package.json.
  const viteBin = path.join(path.dirname(require.resolve("vite/package.json")), "bin/vite.js");
  const child = spawn(process.execPath, [viteBin, ...viteArgs], { env, stdio: "inherit" });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 0);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
