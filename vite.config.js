import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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

          if (id.includes("node_modules/@supabase/supabase-js")) {
            return "supabase";
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
