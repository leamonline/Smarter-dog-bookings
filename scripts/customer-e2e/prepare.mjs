#!/usr/bin/env node
// Prepare a disposable Supabase project for the customer journey tests.
//
//   node scripts/customer-e2e/prepare.mjs <dir>
//   supabase --workdir <dir> start
//
// It is the database-test project (scripts/prepare-db-test-project.mjs: every
// committed migration, replayed from nothing) with one addition to the COPIED
// config: phone sign-in. Customers sign in by phone, and the local auth
// server refuses phone logins unless an SMS provider is configured. The
// provider below is a placeholder with no real account behind it, and every
// synthetic number has a fixed code, so no text message can be sent.
// The repository's own supabase/config.toml is never touched.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SYNTHETIC_CUSTOMERS } from "./syntheticData.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/customer-e2e/prepare.mjs <dir>");
  process.exit(2);
}

const prepared = spawnSync(
  process.execPath,
  [join(here, "..", "prepare-db-test-project.mjs"), target],
  { stdio: "inherit" },
);
if (prepared.status !== 0) process.exit(prepared.status ?? 1);

const configPath = join(resolve(target), "supabase", "config.toml");
const config = readFileSync(configPath, "utf8");
const anchor = "[auth.email]";
if (config.split(anchor).length !== 2) {
  console.error(`Expected exactly one ${anchor} section in ${configPath}.`);
  process.exit(1);
}
if (config.includes("[auth.sms")) {
  console.error(`${configPath} already configures [auth.sms]; refusing to guess how to merge it.`);
  process.exit(1);
}

const testCodes = SYNTHETIC_CUSTOMERS.map(
  (customer) => `${customer.phoneE164.replace("+", "")} = "${customer.otp}"`,
).join("\n");

const phoneSignIn = `[auth.sms]
enable_signup = true
enable_confirmations = false
[auth.sms.twilio]
enabled = true
account_sid = "AC00000000000000000000000000000000"
message_service_sid = "MG00000000000000000000000000000000"
auth_token = "local-placeholder-not-a-credential"
[auth.sms.test_otp]
${testCodes}
`;

writeFileSync(configPath, config.replace(anchor, phoneSignIn + anchor));

console.log(`Customer journey project ready in ${resolve(target)} (phone sign-in on, fixed codes, no SMS).`);
