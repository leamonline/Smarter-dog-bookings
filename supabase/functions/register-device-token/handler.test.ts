// Gate order and the row that is actually stored. No database and no network:
// a missing credential must not build a client, and a successful call is
// checked by reading the stored row back, not the arguments we hoped to pass.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");

const { createRegisterDeviceTokenHandler } = await import("./handler.ts");

const TOKEN = "ab".repeat(32);
const BUNDLE = "uk.co.smarterdog.app";

interface Row {
  id: string;
  user_id: string;
  role: "customer" | "staff";
  apns_token: string;
  environment: "sandbox" | "production";
  bundle_id: string;
  last_seen_at: string;
  notifications_enabled: boolean;
  updated_at: string;
}

function world(opts: { staff?: boolean; roleLookupFails?: boolean; userId?: string; now?: string } = {}) {
  const rows: Row[] = [];
  let userClients = 0;
  let adminClients = 0;
  let seq = 0;
  const handle = createRegisterDeviceTokenHandler({
    expectedBundleId: BUNDLE,
    now: () => new Date(opts.now ?? "2026-11-22T12:00:00.000Z"),
    makeUserClient: () => {
      userClients += 1;
      return {
        auth: {
          getUser: () => {
            if (opts.userId === "") {
              return Promise.resolve({ data: { user: null }, error: { message: "bad" } });
            }
            return Promise.resolve({ data: { user: { id: opts.userId ?? "user-a" } }, error: null });
          },
        },
        rpc: () => {
          if (opts.roleLookupFails) return Promise.resolve({ data: null, error: { message: "down" } });
          return Promise.resolve({ data: opts.staff === true, error: null });
        },
      };
    },
    makeAdminClient: () => {
      adminClients += 1;
      return {
        from: () => ({
          upsert: (row: Omit<Row, "id">) => {
            const existing = rows.find((item) => item.apns_token === row.apns_token);
            const stored: Row = existing
              ? Object.assign(existing, row)
              : { id: `tok-${++seq}`, ...row };
            if (!existing) rows.push(stored);
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { ...stored }, error: null }),
              }),
            };
          },
        }),
      };
    },
  });
  return { rows, handle, counts: () => ({ userClients, adminClients }) };
}

function post(token: string | null, body: Record<string, unknown> | string) {
  return new Request("http://localhost/register-device-token", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const good = {
  apns_token: TOKEN,
  environment: "sandbox",
  bundle_id: BUNDLE,
  notifications_enabled: true,
  role: "staff",
  user_id: "someone-else",
};

Deno.test("a missing credential is refused before any client is built", async () => {
  const { handle, rows, counts } = world();
  const res = await handle(post(null, good));
  assertEquals(res.status, 401);
  assertEquals(counts(), { userClients: 0, adminClients: 0 });
  assertEquals(rows, []);
});

Deno.test("a rejected session writes nothing", async () => {
  const { handle, rows, counts } = world({ userId: "" });
  const res = await handle(post("not-a-session", good));
  assertEquals(res.status, 401);
  assertEquals(counts().adminClients, 0);
  assertEquals(rows, []);
});

Deno.test("a failed role lookup writes nothing", async () => {
  const { handle, rows, counts } = world({ roleLookupFails: true });
  const res = await handle(post("session", good));
  assertEquals(res.status, 503);
  assertEquals(counts().adminClients, 0);
  assertEquals(rows, []);
});

Deno.test("a bad token or the wrong bundle is refused before the service-role client exists", async () => {
  const { handle, rows, counts } = world();
  const bad = await handle(post("session", { ...good, apns_token: "nope" }));
  assertEquals(bad.status, 400);
  const mismatch = await handle(post("session", { ...good, bundle_id: "uk.co.other.app" }));
  assertEquals(mismatch.status, 422);
  assertEquals((await mismatch.json()).error, "bundle_mismatch");
  assertEquals(counts().adminClients, 0);
  assertEquals(rows, []);
});

Deno.test("write path: a customer registration stores their own row, ignoring a claimed role and user id", async () => {
  const { handle, rows } = world({ staff: false, userId: "user-a" });
  const res = await handle(post("session", good));
  assertEquals(res.status, 200);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].user_id, "user-a");
  assertEquals(rows[0].role, "customer");
  assertEquals(rows[0].apns_token, TOKEN);
  assertEquals(rows[0].environment, "sandbox");
  assertEquals(rows[0].bundle_id, BUNDLE);
  assertEquals(rows[0].notifications_enabled, true);
  assertEquals(rows[0].last_seen_at, "2026-11-22T12:00:00.000Z");
});

Deno.test("write path: registering the same token again moves it to the new account and refreshes last_seen_at", async () => {
  const first = world({ staff: false, userId: "user-a" });
  await first.handle(post("session", { ...good, notifications_enabled: false }));
  const second = world({ staff: true, userId: "user-b", now: "2026-11-23T08:00:00.000Z" });
  second.rows.push(first.rows[0]);
  const res = await second.handle(post("session", { ...good, environment: "production" }));
  assertEquals(res.status, 200);
  assertEquals(second.rows.length, 1);
  assertEquals(second.rows[0].user_id, "user-b");
  assertEquals(second.rows[0].role, "staff");
  assertEquals(second.rows[0].environment, "production");
  assertEquals(second.rows[0].notifications_enabled, true);
  assertEquals(second.rows[0].last_seen_at, "2026-11-23T08:00:00.000Z");
  assertEquals(second.rows[0].id, first.rows[0].id);
});
