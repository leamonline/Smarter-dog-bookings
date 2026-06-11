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
    expect(manualChunks("/x/node_modules/@sentry/react/index.js")).toBe("sentry");
    expect(manualChunks("/x/node_modules/@sentry-internal/replay/index.js")).toBe("sentry");
    // App code must stay on Rollup's natural per-lazy() boundaries.
    expect(manualChunks("/x/src/components/views/SettingsView.jsx")).toBeUndefined();
    expect(manualChunks("/x/src/components/modals/DogCardModal.jsx")).toBeUndefined();
  });
});
