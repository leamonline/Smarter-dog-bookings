// Reads the running local stack's address and keys from the Supabase CLI and
// refuses anything that is not this machine.
import { spawnSync } from "node:child_process";
import { assertLoopbackUrl } from "./localTarget.mjs";

export function readLocalStack(stackDir = process.env.CUSTOMER_E2E_STACK_DIR) {
  if (!stackDir) {
    throw new Error(
      "Set CUSTOMER_E2E_STACK_DIR to the directory given to scripts/customer-e2e/prepare.mjs.",
    );
  }
  const status = spawnSync("supabase", ["--workdir", stackDir, "status", "-o", "json"], {
    encoding: "utf8",
  });
  if (status.status !== 0) {
    throw new Error(
      `The local Supabase stack in ${stackDir} is not running (supabase status failed). ` +
        `Start it with: supabase --workdir ${stackDir} start`,
    );
  }
  const parsed = JSON.parse(status.stdout.slice(status.stdout.indexOf("{")));
  const apiUrl = assertLoopbackUrl(parsed.API_URL, "The local stack's API_URL").origin;
  // The database the CLI reports for THIS stack is the only one the reset may
  // touch. A second local project on the default port must never be emptied
  // because a port was assumed.
  const dbUrl = assertLoopbackUrl(
    String(parsed.DB_URL ?? "").replace(/^postgres(ql)?:/, "http:"),
    "The local stack's DB_URL",
  );
  const db = {
    host: dbUrl.hostname.replace(/^\[|\]$/g, ""),
    port: dbUrl.port || "5432",
    user: decodeURIComponent(dbUrl.username),
    password: decodeURIComponent(dbUrl.password),
    database: decodeURIComponent(dbUrl.pathname.replace(/^\//, "")) || "postgres",
  };
  const anonKey = parsed.ANON_KEY ?? parsed.PUBLISHABLE_KEY;
  const serviceRoleKey = parsed.SERVICE_ROLE_KEY ?? parsed.SECRET_KEY;
  if (!anonKey || !serviceRoleKey) throw new Error("The local stack reported no API keys.");
  return { apiUrl, anonKey, serviceRoleKey, db };
}

/** psql arguments and environment for the verified stack's own database. */
export function psqlInvocation(db) {
  return {
    args: ["-h", db.host, "-p", db.port, "-U", db.user, "-d", db.database, "-X", "-q", "-v", "ON_ERROR_STOP=1"],
    env: { ...process.env, PGPASSWORD: db.password },
  };
}
