#!/usr/bin/env node
// scripts/seed-first-owner.mjs
//
// Promotes a Supabase Auth user to `role = 'owner'` on the staff_profiles row.
// Run this once for the first owner; after that, the existing owner can
// promote/demote others via the staff_profiles table directly.
//
// Why a script and not a migration: a migration would re-run on every
// fresh-clone deploy and risk re-promoting an old user. This script is
// explicit, one-off, and uses the service-role key only locally.
//
// Usage:
//   1. Add to .env.local:
//        SUPABASE_URL=https://<project-ref>.supabase.co
//        SUPABASE_SERVICE_ROLE_KEY=<the long secret service-role key>
//      Get the service-role key from Supabase dashboard → Settings → API.
//      DO NOT commit this key. .env.local is in .gitignore.
//   2. Run:
//        node scripts/seed-first-owner.mjs <email>
//      e.g. node scripts/seed-first-owner.mjs leam@leamonline.uk

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Tiny .env.local loader — no extra dep.
function loadEnvLocal() {
  try {
    const raw = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // No .env.local — that's fine if the user set vars directly.
  }
}

loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env / .env.local.");
  process.exit(1);
}
if (!email) {
  console.error("Usage: node scripts/seed-first-owner.mjs <email>");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Find the auth user by email
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listErr) throw listErr;
  const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error(`No auth user found with email '${email}'. Have they signed up via the app first?`);
    process.exit(1);
  }

  // 2. Find or create the staff_profiles row, then set role = 'owner'
  const { data: existing } = await admin
    .from("staff_profiles")
    .select("id, role, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing) {
    const { error: insErr } = await admin
      .from("staff_profiles")
      .insert({ user_id: user.id, role: "owner", display_name: email.split("@")[0] });
    if (insErr) throw insErr;
    console.log(`Created staff_profiles row for ${email} as owner.`);
    return;
  }

  if (existing.role === "owner") {
    console.log(`${email} is already an owner. Nothing to do.`);
    return;
  }

  const { error: updErr } = await admin
    .from("staff_profiles")
    .update({ role: "owner" })
    .eq("user_id", user.id);
  if (updErr) throw updErr;

  console.log(`Promoted ${email} from '${existing.role}' to 'owner'.`);
}

main().catch((err) => {
  console.error("seed-first-owner failed:", err);
  process.exit(1);
});
