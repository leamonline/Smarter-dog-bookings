# Codebase Audit Report — SmarterDog

**Date:** 2026-04-14
**Auditor:** Claude (Opus 4.6)
**Scope:** Full file-by-file read-only audit of the `leamonline/Smarter-dogs-smart-humans` repository

---

## 1. Stack Overview

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend framework** | React | 19.2.4 |
| **Routing** | react-router-dom | 7.13.2 |
| **Styling** | Tailwind CSS v4 (via `@tailwindcss/vite`) | 4.2.2 |
| **Accessibility** | react-aria (`FocusScope`, `useDialog`) | 3.47.0 |
| **Backend / BaaS** | Supabase (Postgres + Auth + Edge Functions + Realtime) | supabase-js 2.100.0 |
| **Build tool** | Vite 7 | 7.3.2 |
| **PWA** | vite-plugin-pwa (Workbox) | 1.2.0 |
| **Language** | TypeScript 6 (mixed `.js`/`.jsx`/`.ts`/`.tsx`) | 6.0.2 |
| **Testing** | Vitest | 4.1.4 |
| **Analytics** | @vercel/analytics | 2.0.1 |
| **Hosting** | Vercel (primary) + Netlify (alt config) | — |
| **Edge runtime** | Deno (Supabase Edge Functions) | std@0.168.0 |

**Architecture pattern:** Single-page app (SPA) with two entry points — a **staff dashboard** (`/`) and a **customer portal** (`/customer/*`). Both share a single Supabase project but use separate auth clients with distinct storage keys to prevent session interference. The backend is entirely Supabase: Postgres for data, RLS for authorization, Edge Functions for notifications and calendar feeds, and pg_cron for scheduled reminders.

**Source file count:** ~95 source files (excluding node_modules, build output, docs, and tooling config).

**Total estimated source lines:** ~16,000 lines across frontend components, hooks, engine logic, Supabase hooks, SQL migrations, and Edge Functions.
