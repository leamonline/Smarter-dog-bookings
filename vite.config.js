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
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api",
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
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
