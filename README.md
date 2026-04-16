# SmarterDog — Salon Dashboard

A booking and management dashboard for dog grooming salons. Built with React + Vite + Supabase.

## Features

- **Weekly calendar** with slot-based booking (08:30–13:00)
- **Capacity engine** — enforces the 2-2-1 rule for large dogs
- **Booking workflow** — Not Arrived → Checked In → In Bath → Ready for Pick-up → Completed
- **Dogs & Humans directories** — full contact management with alerts, notes, and trusted contacts
- **Role-based auth** — owner vs staff access levels
- **Offline mode** — works without Supabase using sample data
- **Responsive** — optimized for tablet (front desk) and mobile

## Quick Start

```bash
# Install dependencies
npm install

# Copy env template and fill in your Supabase credentials
cp .env.example .env.local

# Start dev server
npm run dev
```

## Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run the migrations in order via SQL Editor:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_auth_staff_profiles.sql`
   - `supabase/migrations/003_phase5_schema.sql`
3. Fill in `.env.local` with your project URL and anon key
4. (Optional) Seed sample data: `npm run seed`

## Deploy

### Vercel
Connect this repo — Vercel auto-detects Vite. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables.

### Manual
```bash
npm run build   # outputs to dist/
# Serve dist/ with any static file server
```

## Tech Stack

- **React 19** + **Vite 8**
- **Supabase** (PostgreSQL + Auth + Row Level Security)
- Inline CSS with brand design tokens
