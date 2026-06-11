import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false, // use public/manifest.json directly
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
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
