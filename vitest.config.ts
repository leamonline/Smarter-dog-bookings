import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "logic",
          globals: true,
          environment: "node",
          include: ["src/**/*.test.{js,ts}"],
          exclude: ["src/**/*.component.test.{jsx,tsx}"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "component",
          globals: true,
          environment: "jsdom",
          include: ["src/**/*.component.test.{jsx,tsx}"],
          setupFiles: ["./src/test/componentSetup.ts"],
        },
      },
    ],
  },
});
