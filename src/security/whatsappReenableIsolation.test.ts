// Switching WhatsApp back on must stay one audited path (#1016 follow-up).
//
// A STOP is the customer withdrawing consent. The database refuses an
// ordinary untick of it, but the app must not even try: the only way back is
// the staff re-enable, which names every switched-off record on the number,
// the latest STOP staff saw, and the customer's renewed permission. This
// guard keeps the two functions behind one wrapper file and one repository
// (the repository is what makes a partial scope or a reformatted timestamp
// unsendable), and keeps the opt-out columns out of every ordinary write.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(join(root, dir))) {
    const rel = join(dir, entry);
    if (statSync(join(root, rel)).isDirectory()) {
      sourceFiles(rel, acc);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      acc.push(rel);
    }
  }
  return acc;
}

const EXCLUDED = new Set([
  join("src", "supabase", "database.types.ts"),
  join("src", "data", "sample.js"),
]);

/** Production source under src: no tests, no generated types, no sample data. */
const production = sourceFiles("src")
  .filter((path) => !/\.test\./.test(path))
  .filter((path) => !EXCLUDED.has(path))
  .map((path) => ({ path, text: readFileSync(join(root, path), "utf8") }));

const RPC_FILE = join("src", "supabase", "rpc.ts");
const REPOSITORY = join("src", "supabase", "repositories", "whatsappOptOutRepo.ts");

function filesMatching(pattern: RegExp): string[] {
  return production.filter(({ text }) => pattern.test(text)).map(({ path }) => path);
}

describe("WhatsApp re-enable isolation", () => {
  it("scans the real source tree", () => {
    expect(production.length).toBeGreaterThan(100);
    expect(production.some(({ path }) => path === RPC_FILE)).toBe(true);
    expect(production.some(({ path }) => path === REPOSITORY)).toBe(true);
  });

  it("names the two functions only in rpc.ts", () => {
    expect(filesMatching(/staff_reenable_whatsapp_number|staff_whatsapp_number_opt_out_scope/)).toEqual([
      RPC_FILE,
    ]);
  });

  it("calls the two wrappers only from the repository", () => {
    const callers = production
      .filter(({ path }) => path !== RPC_FILE)
      .filter(({ text }) => /\b(?:reenableWhatsappNumber|getWhatsappNumberOptOutScope)\b/.test(text))
      .map(({ path }) => path);
    expect(callers).toEqual([REPOSITORY]);
  });

  it("reads the re-enable audit only through the repository", () => {
    // The audit is what settles an outcome (a record leaving the scope is not
    // proof it was switched back on), so one narrowed read owns it.
    expect(filesMatching(/["'`]whatsapp_opt_out_reenables["'`]/)).toEqual([REPOSITORY]);
  });

  it("never writes the opt-out through an ordinary update", () => {
    expect(filesMatching(/dbUpdates\.whatsapp_opted_out/)).toEqual([]);
    expect(filesMatching(/\.update\(\s*\{[^)]*whatsapp_opted_out/s)).toEqual([]);
  });
});
