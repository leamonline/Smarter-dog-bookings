import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import process from 'node:process';
import { resolve } from 'node:path';
export default defineConfig({
 optimizeDeps: { entries: ['output/playwright/approval/index.html'] },
 root: process.cwd(), envDir: '/tmp/approval-preview-no-env', plugins: [
 { name: 'approval-preview-only', enforce: 'pre', resolveId(source) {
 if (source.endsWith('/supabase/client') || source === '../../client') return resolve('output/playwright/approval/client.ts');
 if (source.endsWith('/signupApprovalRepo')) return resolve('output/playwright/approval/repository.ts');
 } }, react(), tailwindcss()],
 server: { host:'127.0.0.1', port: 4187, strictPort: true }
});
