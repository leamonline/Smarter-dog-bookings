/* global process */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import viteCompression from 'vite-plugin-compression'

// The bundle-size report is build diagnostics, not site content: it discloses
// the whole dependency tree and every module's size. It used to be written
// straight into dist/, so every publish shipped it — stats.html, plus the .gz
// the compression plugin then made of it — to a public URL nobody chose.
//
// Two independent things now keep it off the live site, so a regression in
// either one alone still cannot publish it:
//   1. the plugin only loads when ANALYZE is set (`npm run build:analyze`);
//   2. the report is written outside the build output directory.
// Guarded by vite.config.test.js.
export const BUNDLE_REPORT_FILE = 'bundle-analysis/stats.html'
export const isAnalyzeBuild = (env = process.env) => env.ANALYZE === 'true'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Bundle size visualization — local analysis only, never published.
    isAnalyzeBuild() &&
      visualizer({
        filename: BUNDLE_REPORT_FILE,
        open: false,
        gzipSize: true,
        brotliSize: true,
      }),
    // Gzip compression
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
    }),
    // Brotli compression
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
    }),
  ],
  build: {
    // Hidden sourcemaps: generated for error tracking but not exposed to end users
    sourcemap: 'hidden',
    // Set chunk size warnings
    chunkSizeWarningLimit: 500, // 500KB
    rollupOptions: {
      output: {
        // Manual chunking for better code splitting.
        // Function form is required by rolldown (Vite 8's default bundler).
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return;
          if (id.includes('react-router')) return 'router-vendor';
          if (id.includes('/react-dom/') || /\/react\//.test(id)) return 'react-vendor';
        },
      },
    },
  },
})
