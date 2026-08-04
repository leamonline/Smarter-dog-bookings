// Discovery behaviour for scripts/check-edge-function-types.mjs.
//
// The script type-checks every deployable Edge Function entrypoint. Its
// discovery is the part worth pinning down: a hard-coded list would go stale
// the moment someone adds a function, and a bare `supabase/functions/*/index.ts`
// glob that matches nothing exits 0 — a check that silently stops checking is
// worse than no check.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { discoverEdgeFunctionEntrypoints } from "../../scripts/check-edge-function-types.mjs";

const temporaryRoots: string[] = [];

function makeFunctionsRoot(
  layout: Record<string, string[]>,
): string {
  const root = mkdtempSync(join(tmpdir(), "smarter-dog-edge-discovery-"));
  temporaryRoots.push(root);
  for (const [dir, files] of Object.entries(layout)) {
    mkdirSync(join(root, "supabase", "functions", dir), { recursive: true });
    for (const file of files) {
      writeFileSync(join(root, "supabase", "functions", dir, file), "export {};\n");
    }
  }
  return root;
}

afterEach(() => {
  while (temporaryRoots.length) {
    rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe("discoverEdgeFunctionEntrypoints", () => {
  it("includes every deployable function and excludes _shared", () => {
    const root = makeFunctionsRoot({
      "notify-booking-cancelled": ["index.ts"],
      "whatsapp-send": ["index.ts"],
      // _shared holds common modules, never a deployable entrypoint. It has no
      // index.ts today, but exclude it by name too so adding one wouldn't
      // quietly enrol it as a function.
      _shared: ["recipients.ts", "index.ts"],
    });

    expect(discoverEdgeFunctionEntrypoints(root)).toEqual([
      "supabase/functions/notify-booking-cancelled/index.ts",
      "supabase/functions/whatsapp-send/index.ts",
    ]);
  });

  it("skips directories with no index.ts", () => {
    const root = makeFunctionsRoot({
      "real-function": ["index.ts"],
      "helpers-only": ["util.ts"],
    });

    expect(discoverEdgeFunctionEntrypoints(root)).toEqual([
      "supabase/functions/real-function/index.ts",
    ]);
  });

  it("orders deterministically regardless of on-disk order", () => {
    const root = makeFunctionsRoot({
      zulu: ["index.ts"],
      alpha: ["index.ts"],
      mike: ["index.ts"],
    });

    const paths = discoverEdgeFunctionEntrypoints(root);
    expect(paths).toEqual([...paths].sort());
    expect(paths).toEqual([
      "supabase/functions/alpha/index.ts",
      "supabase/functions/mike/index.ts",
      "supabase/functions/zulu/index.ts",
    ]);
  });

  it("throws when discovery finds nothing rather than reporting success", () => {
    const root = makeFunctionsRoot({ _shared: ["recipients.ts"] });
    expect(() => discoverEdgeFunctionEntrypoints(root)).toThrow(
      /no deployable edge function entrypoints/i,
    );
  });

  it("throws when the functions directory is missing entirely", () => {
    const root = mkdtempSync(join(tmpdir(), "smarter-dog-edge-empty-"));
    temporaryRoots.push(root);
    expect(() => discoverEdgeFunctionEntrypoints(root)).toThrow();
  });

  it("finds the real repository's entrypoints, and never _shared", () => {
    const paths = discoverEdgeFunctionEntrypoints(process.cwd());
    expect(paths.length).toBeGreaterThan(20);
    expect(paths).toContain("supabase/functions/whatsapp-send/index.ts");
    expect(paths).toContain(
      "supabase/functions/notify-booking-cancelled/index.ts",
    );
    expect(paths.some((p) => p.includes("/_shared/"))).toBe(false);
    expect(paths.every((p) => p.endsWith("/index.ts"))).toBe(true);
  });
});
