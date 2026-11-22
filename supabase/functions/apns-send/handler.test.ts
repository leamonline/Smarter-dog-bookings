// The internal send deletes only the tokens Apple says are dead. The test
// reads the rows left behind. No real APNs call and no database.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");

const { createApnsSendHandler } = await import("./handler.ts");

const LIVE = "ab".repeat(32);
const DEAD = "cd".repeat(32);
const BUNDLE = "uk.co.smarterdog.app";

interface Row {
  id: string;
  apns_token: string;
}

async function signingPem(): Promise<string> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  let binary = "";
  for (const byte of pkcs8) binary += String.fromCharCode(byte);
  return `-----BEGIN PRIVATE KEY-----\n${btoa(binary)}\n-----END PRIVATE KEY-----`;
}

async function world(opts: {
  enabled?: boolean;
  configured?: boolean;
  secret?: string;
  badKey?: boolean;
  apple?: "mixed" | "forbidden" | "unreadable-success";
} = {}) {
  const pem = await signingPem();
  const rows: Row[] = [
    { id: "live", apns_token: LIVE },
    { id: "dead", apns_token: DEAD },
  ];
  const calls: string[] = [];
  let admins = 0;
  const handle = createApnsSendHandler({
    fetch: (input) => {
      const url = String(input);
      calls.push(url);
      if (opts.apple === "forbidden") {
        return Promise.resolve(new Response(JSON.stringify({ reason: "InvalidProviderToken" }), { status: 403 }));
      }
      if (opts.apple === "unreadable-success") {
        return Promise.resolve({
          status: 200,
          headers: { get: () => "apple-live" },
          text: () => Promise.reject(new Error("body failed")),
        } as unknown as Response);
      }
      const dead = url.endsWith(DEAD);
      const body = dead ? JSON.stringify({ reason: "Unregistered" }) : "";
      return Promise.resolve(new Response(body, {
        status: dead ? 410 : 200,
        headers: dead ? {} : { "apns-id": "apple-live" },
      }));
    },
    makeAdminClient: () => {
      admins += 1;
      return {
        from: () => ({
          delete: () => ({
            in: (_column: string, ids: string[]) => {
              for (const id of ids) {
                const index = rows.findIndex((row) => row.id === id);
                if (index >= 0) rows.splice(index, 1);
              }
              return Promise.resolve({ error: null });
            },
          }),
        }),
      };
    },
    pushEnabled: () => opts.enabled !== false,
    expectedBundleId: () => (opts.configured === false ? null : BUNDLE),
    secrets: () => {
      if (opts.configured === false) return null;
      if (opts.badKey) return { keyId: "KEYID12345", teamId: "TEAMID1234", privateKeyPem: "not-a-key" };
      return { keyId: "KEYID12345", teamId: "TEAMID1234", privateKeyPem: pem };
    },
    internalSecret: () => opts.secret ?? "internal-secret",
  });
  return { rows, calls, handle, admins: () => admins };
}

function post(secret: string | null, body: unknown) {
  return new Request("http://localhost/apns-send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-internal-secret": secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

const payload = {
  title: "Smarter Dog Grooming",
  body: "See you tomorrow",
  tokens: [
    { id: "live", apns_token: LIVE, environment: "production", bundle_id: BUNDLE },
    { id: "dead", apns_token: DEAD, environment: "sandbox", bundle_id: BUNDLE },
  ],
};

Deno.test("a missing or wrong internal secret does not call Apple or delete tokens", async () => {
  for (const secret of [null, "nope"]) {
    const { handle, rows, calls, admins } = await world();
    const res = await handle(post(secret, payload));
    assertEquals(res.status, 401);
    assertEquals(calls, []);
    assertEquals(admins(), 0);
    assertEquals(rows.map((row) => row.id), ["live", "dead"]);
  }
});

Deno.test("the flag off refuses before Apple is contacted and tells the caller to fall back", async () => {
  const { handle, rows, calls, admins } = await world({ enabled: false });
  const res = await handle(post("internal-secret", payload));
  assertEquals(res.status, 200);
  assertEquals((await res.json()).fallback, true);
  assertEquals(calls, []);
  assertEquals(admins(), 0);
  assertEquals(rows.map((row) => row.id), ["live", "dead"]);
});

Deno.test("missing Apple secrets fall back and leave every token in place", async () => {
  const { handle, rows, calls } = await world({ configured: false });
  const res = await handle(post("internal-secret", payload));
  const body = await res.json();
  assertEquals(body.fallback, true);
  assertEquals(body.error, "apns_not_configured");
  assertEquals(calls, []);
  assertEquals(rows.map((row) => row.id), ["live", "dead"]);
});

Deno.test("a definite Apple refusal keeps every token and tells the caller to fall back", async () => {
  const { handle, rows, calls, admins } = await world({ apple: "forbidden" });
  const res = await handle(post("internal-secret", payload));
  const body = await res.json();
  assertEquals(body.sent, 0);
  assertEquals(body.fallback, true);
  assertEquals(body.outcome_unknown, false);
  assertEquals(calls.length, 2);
  assertEquals(admins(), 0);
  assertEquals(rows.map((row) => row.id), ["live", "dead"]);
});

Deno.test("an accepted push whose body cannot be read is sent, not a fallback", async () => {
  const { handle, rows } = await world({ apple: "unreadable-success" });
  const res = await handle(post("internal-secret", payload));
  const body = await res.json();
  assertEquals(body.sent, 2);
  assertEquals(body.fallback, false);
  assertEquals(body.outcome_unknown, false);
  assertEquals(rows.map((row) => row.id), ["live", "dead"]);
});

Deno.test("a key that cannot sign falls back and never calls Apple", async () => {
  const { handle, rows, calls } = await world({ badKey: true });
  const res = await handle(post("internal-secret", payload));
  const body = await res.json();
  assertEquals(body.fallback, true);
  assertEquals(body.outcome_unknown, false);
  assertEquals(calls, []);
  assertEquals(rows.map((row) => row.id), ["live", "dead"]);
});

Deno.test("write path: a dead token is removed and the accepted one stays", async () => {
  const { handle, rows, calls } = await world();
  const res = await handle(post("internal-secret", payload));
  const body = await res.json();
  assertEquals(body.sent, 1);
  assertEquals(body.invalid, 1);
  assertEquals(body.apns_id, "apple-live");
  assertEquals(body.fallback, false);
  assertEquals(calls.length, 2);
  assertEquals(rows.map((row) => row.id), ["live"]);
});
