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
import { loadEnvLocal } from "./lib/load-env-local.mjs";

loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];

if (!SUPABASE_URL) {
  console.error(
    "Missing SUPABASE_URL (or VITE_SUPABASE_URL as fallback).\n" +
    "  Set it in .env.local or export it in your shell before running this script.\n" +
    "  Example: export SUPABASE_URL=https://your-project-ref.supabase.co"
  );
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_SERVICE_ROLE_KEY.\n" +
    "  Get it from Supabase \u2192 Project Settings \u2192 API \u2192 service_role.\n" +
    "  Set it in .env.local or export it in your shell (unset it immediately after use).\n" +
    "  NEVER prefix it with VITE_ and NEVER commit it."
  );
  process.exit(1);
}
if (!email || !email.includes("@")) {
  console.error(
    "Usage: node scripts/seed-first-owner.mjs <email>\n" +
    "  e.g.   node scripts/seed-first-owner.mjs owner@example.com\n" +
    "  The email must match an existing user in Supabase Auth."
  );
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
    console.error(`No auth user found with email '${email}'. Create or invite this user in Supabase Auth first.`);
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
