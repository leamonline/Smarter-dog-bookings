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
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/react") ||
            id.includes("node_modules/react-dom")
          ) {
            return "react-vendor";
          }

          if (id.includes("node_modules/@supabase/")) {
            return "supabase";
          }

          if (id.includes("node_modules/@vercel/analytics")) {
            return "analytics";
          }

          if (
            id.includes("node_modules/react-router") ||
            id.includes("node_modules/react-router-dom")
          ) {
            return "router";
          }

          if (id.includes("node_modules/lucide-react")) {
            return "lucide";
          }

          if (id.includes("/src/components/views/")) {
            return "views";
          }

          if (id.includes("/src/components/modals/")) {
            return "modals";
          }
        },
      },
    },
  },
});
