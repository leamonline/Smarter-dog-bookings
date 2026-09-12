// Tiny .env.local loader — no extra dep.
//
// This is a hand-rolled parser rather than a dotenv dependency because the
// need is tiny (a handful of KEY=VALUE lines, read once, at script start) and
// not worth a runtime dependency for. Shared by scripts/check-captcha-live.mjs
// and scripts/seed-first-owner.mjs — keep it here so a future fix to the
// parser only has to happen once.
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

// This file lives in scripts/lib/, so the repository root is two levels up.
const repoRoot = path.join(scriptDirectory, "..", "..");

/**
 * Load `.env.local` (repository root) into `process.env`, without
 * overwriting anything already set — real shell env and `--flag` arguments
 * keep winning over the file.
 *
 * Skips blank lines and lines starting with `#`, splits each remaining line
 * on the first `=` only, trims key and value, and strips one layer of
 * surrounding single or double quotes from the value.
 *
 * A missing `.env.local` is fine — the caller may have set vars directly —
 * so this swallows that case rather than throwing.
 *
 * @param {{ envPath?: string }} [options] - Optional overrides. `envPath`
 *   replaces the default repository-root `.env.local` path (useful for
 *   tests); both existing callers use the default.
 */
export function loadEnvLocal(options = {}) {
  const envPath = options.envPath || path.join(repoRoot, ".env.local");
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // No .env.local — fine if the caller passed flags or exported vars.
  }
}
