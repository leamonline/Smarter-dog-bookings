import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// The booking app shares an origin with the marketing site, where "/" is the
// marketing page. So the booking shell also gets a home of its own that no
// merge can take from it, and the service worker precaches THAT — otherwise
// the installed staff PWA would fall back to the marketing page offline.
// It runs on writeBundle, before vite-plugin-pwa globs the output on
// closeBundle, so the copy lands in the precache manifest.
function emitNamespacedShell() {
  return {
    name: "smarterdog-namespaced-shell",
    apply: "build",
    writeBundle(options) {
      const outDir = options.dir ?? resolve("dist");
      mkdirSync(resolve(outDir, "app"), { recursive: true });
      copyFileSync(resolve(outDir, "index.html"), resolve(outDir, "app/index.html"));
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    emitNamespacedShell(),
    VitePWA({
      registerType: "autoUpdate",
      // Staff-only. The installed staff PWA is what needs precaching; the
      // customer portal goes without. sw.js stays at the deployment root
      // because a worker can only claim a scope at or below its own directory,
      // and it has to be able to claim /staff/.
      scope: "/staff/",
      manifest: false, // use public/app/manifest.json directly
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // The shell at its namespaced home, never "/" — which belongs to the
        // marketing site once the two are served together.
        navigateFallback: "app/index.html",
        // Pull the staff Web Push handlers (push / notificationclick) into the
        // generated precache SW. importScripts keeps generateSW + precache +
        // the manualChunks shape untouched — it only ADDS listeners. The file
        // lives in public/ so it ships verbatim at /push-sw.js. Staff-only;
        // a customer or unsubscribed staff member never receives a push.
        importScripts: ["/push-sw.js"],
        // When a new SW activates, evict precache entries from
        // previous deployments. Without this, an old SW holding
        // stale precached chunks can serve the SPA fallback HTML
        // for renamed chunk URLs, which the browser then rejects
        // with "'text/html' is not a valid JavaScript MIME type".
        cleanupOutdatedCaches: true,
        // Apply the new SW immediately rather than waiting for all
        // existing tabs to close. autoUpdate + these two together
        // mean a single hard refresh is enough to pick up a deploy.
        skipWaiting: true,
        clientsClaim: true,
        // Don't let the SW intercept Supabase function calls — the
        // customer-phone-on-file invoke uses POST and we never want
        // a cached response served back for an auth-adjacent call.
        navigateFallbackDenylist: [/^\/api/, /^\/functions\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 10, maxAgeSeconds: 31536000 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },
  build: {
    // Every file this build emits lives under /app/ so the booking app can be
    // served from the same origin as the public marketing pages without either
    // one overwriting the other's output. Static files come from public/app/;
    // this puts the hashed JS/CSS beside them.
    assetsDir: "app/assets",
    // NB: this MUST be rollupOptions — the previous `rolldownOptions` key is
    // silently ignored by standard Vite/Rollup, which shipped a single 443 KB
    // entry chunk that every deploy invalidated in the PWA precache. A logic
    // test asserts this shape so the dead-key bug can't recur.
    rollupOptions: {
      output: {
        // Whole-package vendor groups only. Path-anchored regexes, because
        // substring matching on "node_modules/react" also swallows
        // react-router / react-aria. Deliberately NOT grouped:
        //   - src views/modals — Rollup's natural per-lazy() chunks are the
        //     right boundaries; merging them regresses first-use loads.
        //   - lucide-react — already tree-shakes to per-icon chunks.
        //   - @vercel/analytics — dynamically imported, keeps itself out.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) {
            return "react-vendor";
          }
          // NB: a build WITHOUT VITE_SUPABASE_URL / _PUBLISHABLE_KEY (E2E,
          // a fresh clone, CI without secrets) logs `Generated an empty
          // chunk: "supabase"`. That is expected, not a broken matcher:
          // src/supabase/client.ts and customerClient.ts only call
          // createClient() when the credentials exist, so Rollup tree-shakes
          // the whole library out and the chunk it was assigned to is
          // empty. A credentialed build (Vercel production) emits a
          // ~217 KB supabase-*.js. src/test/viteConfig.test.js pins the
          // routing of every @supabase/* sub-package into this group.
          if (/node_modules\/@supabase\//.test(id)) {
            return "supabase";
          }
          if (/node_modules\/@sentry(-internal)?\//.test(id)) {
            return "sentry";
          }
          if (/node_modules\/react-router(-dom)?\//.test(id)) {
            return "router";
          }
        },
      },
    },
  },
});
