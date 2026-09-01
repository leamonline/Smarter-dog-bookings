import { describe, it, expect } from "vitest";
import config from "../../vite.config.js";

// Regression guard: the vendor-splitting config once sat under
// `build.rolldownOptions`, a key standard Vite/Rollup silently ignores —
// the app shipped a single 443 KB entry chunk for weeks with the config
// "present". Assert the shape the bundler actually reads.
describe("vite config", () => {
  it("declares manualChunks where Rollup actually looks", () => {
    expect(typeof config.build?.rollupOptions?.output?.manualChunks).toBe(
      "function",
    );
    // The dead key must not come back alongside it either.
    expect(config.build?.rolldownOptions).toBeUndefined();
  });

  it("keeps vendor groups path-anchored and per-package", () => {
    const manualChunks = config.build.rollupOptions.output.manualChunks;
    expect(manualChunks("/x/node_modules/react/index.js")).toBe("react-vendor");
    expect(manualChunks("/x/node_modules/react-dom/client.js")).toBe("react-vendor");
    // Substring matching on "node_modules/react" used to swallow these:
    expect(manualChunks("/x/node_modules/react-router/dist/main.js")).toBe("router");
    expect(manualChunks("/x/node_modules/react-aria/dist/main.js")).toBeUndefined();
    expect(manualChunks("/x/node_modules/@supabase/supabase-js/index.js")).toBe("supabase");
    // supabase-js is a thin facade; the weight is in its scoped sub-packages,
    // which must land in the same group or the "supabase" chunk is a stub
    // and the real client code drifts into whichever lazy chunk imports it.
    for (const pkg of ["auth-js", "postgrest-js", "realtime-js", "storage-js", "functions-js", "phoenix"]) {
      expect(manualChunks(`/x/node_modules/@supabase/${pkg}/dist/module/index.js`)).toBe("supabase");
    }
    // Sentry's Supabase integration lives under @sentry, not @supabase:
    expect(manualChunks("/x/node_modules/@sentry/core/build/esm/integrations/supabase.js")).toBe("sentry");
    expect(manualChunks("/x/node_modules/@sentry/react/index.js")).toBe("sentry");
    expect(manualChunks("/x/node_modules/@sentry-internal/replay/index.js")).toBe("sentry");
    // App code must stay on Rollup's natural per-lazy() boundaries.
    expect(manualChunks("/x/src/components/views/SettingsView.jsx")).toBeUndefined();
    expect(manualChunks("/x/src/components/modals/DogCardModal.jsx")).toBeUndefined();
  });
});
