import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import viteCompression from 'vite-plugin-compression'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Bundle size visualization (generates stats.html after build)
    visualizer({
      filename: './dist/stats.html',
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
