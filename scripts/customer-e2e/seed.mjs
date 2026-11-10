#!/usr/bin/env node
// Reset the local stack to the customer journey starting state.
//
//   CUSTOMER_E2E_STACK_DIR=<dir> node scripts/customer-e2e/seed.mjs
//
// Deterministic: it empties bookings and day settings, restores the default
// booking rules and re-creates the synthetic customers. It refuses to run
// against anything but the local stack (see localTarget.mjs), because that
// reset would destroy real records anywhere else.
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { readLocalStack } from "./localStack.mjs";
import { LOCAL_DB } from "./localTarget.mjs";
import { SYNTHETIC_CUSTOMERS, SYNTHETIC_PASSWORD } from "./syntheticData.mjs";

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

export function buildResetSql() {
  const phones = SYNTHETIC_CUSTOMERS.map((c) => quote(c.phoneE164.replace("+", ""))).join(", ");
  const ids = SYNTHETIC_CUSTOMERS.map((c) => quote(c.authUserId)).join(", ");
  return `
begin;
-- Resetting must not queue confirmations or cancellations for anyone.
set local session_replication_role = replica;
truncate table public.bookings cascade;
delete from public.waitlist_entries;
delete from public.day_settings;
delete from public.dogs;
delete from public.humans;
delete from public.salon_config;
insert into public.salon_config (settings, daily_dog_cap)
values ('{"minCancellationHours":24}'::jsonb, 14);
update public.booking_policy_settings
   set customer_intake_enabled = true,
       allow_customer_cancellations = true,
       allow_customer_rescheduling = true,
       allow_repeat_booking = true;
commit;
-- Synthetic sign-ins are re-created through the auth server after this. Done
-- outside replica mode so the auth schema's own cascades run and leave no
-- orphaned identity behind to collide with the next create.
delete from auth.identities where user_id in (${ids});
delete from auth.users where phone in (${phones}) or id in (${ids});
delete from auth.identities i where not exists (select 1 from auth.users u where u.id = i.user_id);
`;
}

export function buildSeedSql() {
  const humans = SYNTHETIC_CUSTOMERS.map(
    (c) =>
      `(${quote(c.humanId)}, ${quote(c.name)}, ${quote(c.surname)}, ${quote(c.phoneNational)}, ` +
      `'1 Synthetic Street', 'existing', now(), now(), 'customer-e2e', ${quote(c.authUserId)})`,
  ).join(",\n  ");
  const dogs = SYNTHETIC_CUSTOMERS.flatMap((c) =>
    c.dogs.map(
      (d) =>
        `(${quote(d.id)}, ${quote(d.name)}, ${quote(d.breed)}, ${quote(c.humanId)}, ${quote(d.size)}, false)`,
    ),
  ).join(",\n  ");
  return `
begin;
set local session_replication_role = replica;
insert into public.humans
  (id, name, surname, phone, address, source, approved_at, policies_accepted_at, policies_version, customer_user_id)
values
  ${humans};
insert into public.dogs (id, name, breed, human_id, size, is_pregnant)
values
  ${dogs};
commit;
`;
}

async function ensureAuthUser(stack, c) {
  const headers = {
    apikey: stack.serviceRoleKey,
    Authorization: `Bearer ${stack.serviceRoleKey}`,
    "Content-Type": "application/json",
  };
  const body = JSON.stringify({
    id: c.authUserId,
    phone: c.phoneE164,
    password: SYNTHETIC_PASSWORD,
    phone_confirm: true,
  });
  const response = await fetch(`${stack.apiUrl}/auth/v1/admin/users`, { method: "POST", headers, body });
  if (!response.ok) {
    throw new Error(`Could not prepare synthetic sign-in for ${c.key}: ${response.status} ${await response.text()}`);
  }
}

function runSql(sql) {
  const psql = spawnSync(
    "psql",
    ["-h", LOCAL_DB.host, "-p", LOCAL_DB.port, "-U", LOCAL_DB.user, "-d", LOCAL_DB.database,
      "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"],
    { input: sql, encoding: "utf8", env: { ...process.env, PGPASSWORD: LOCAL_DB.password } },
  );
  if (psql.status !== 0) throw new Error(`Seeding failed:\n${psql.stderr}`);
}

export async function seed(stack = readLocalStack()) {
  runSql(buildResetSql());
  for (const c of SYNTHETIC_CUSTOMERS) await ensureAuthUser(stack, c);
  runSql(buildSeedSql());
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await seed();
  console.log(`Seeded ${SYNTHETIC_CUSTOMERS.length} synthetic customers into the local stack.`);
}
