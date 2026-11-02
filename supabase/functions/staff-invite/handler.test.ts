// Runtime gate tests for staff-invite.
//
// This function mints staff accounts with the service-role key, so what must
// never happen is work before authentication. Every gate-ordering case runs
// with NO database and NO network: the method gate, the origin gate and the
// missing-credential gate all have to refuse BEFORE a Supabase client is
// constructed. If someone reorders the handler so work precedes auth, these
// start failing with connection errors instead of clean statuses.
//
// Whether a *signed-in non-owner* is refused needs a live Auth server, so that
// path is covered by the static verdict-flow guard (npm run check:edge-auth),
// which requires auth.getUser and is_staff to reach an exiting if-guard, and by
// the owner check living in the same helper. The input rules are pure and are
// tested exhaustively below.
//
// The write path (what is actually left in the auth users and in staff_profiles
// after each outcome) is tested against a recording fake that models how
// Supabase really behaves, per the repo rule that a write-path test asserts the
// row that was written, not the arguments handed to the writer. See "write path".
//
// Env is set before the dynamic import because handler.ts reads it at module
// scope. The values are test-only stand-ins and cannot reach a real project.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
Deno.env.set("STAFF_INVITE_ALLOWED_ORIGINS", "https://smarterdog.co.uk");

const { handleStaffInvite, createStaffInviteHandler, validateInviteInput } = await import("./handler.ts");

const GOOD_ORIGIN = "https://smarterdog.co.uk";
const VALID_BODY = JSON.stringify({ email: "new.person@example.com", display_name: "New Person" });

function post(headers: Record<string, string>, body = VALID_BODY): Request {
  return new Request("http://localhost/staff-invite", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

Deno.test("a non-POST method is refused first", async () => {
  const res = await handleStaffInvite(
    new Request("http://localhost/staff-invite", { method: "GET" }),
  );
  assertEquals(res.status, 405);
});

Deno.test("a CORS preflight is answered without any auth work", async () => {
  const res = await handleStaffInvite(
    new Request("http://localhost/staff-invite", {
      method: "OPTIONS",
      headers: { origin: GOOD_ORIGIN },
    }),
  );
  assertEquals(res.status, 204);
});

Deno.test("a request with no origin is refused before auth", async () => {
  const res = await handleStaffInvite(post({ authorization: "Bearer anything" }));
  assertEquals(res.status, 403);
});

Deno.test("an origin that is not on the allowlist is refused before auth", async () => {
  const res = await handleStaffInvite(
    post({ origin: "https://evil.example", authorization: "Bearer anything" }),
  );
  assertEquals(res.status, 403);
});

Deno.test("an allowed origin with no authorization header gets 401", async () => {
  const res = await handleStaffInvite(post({ origin: GOOD_ORIGIN }));
  assertEquals(res.status, 401);
});

Deno.test("a refusal never echoes an origin that is not allowed", async () => {
  const res = await handleStaffInvite(
    post({ origin: "https://evil.example", authorization: "Bearer anything" }),
  );
  assertEquals(res.headers.get("access-control-allow-origin"), null);
});

// ---- validateInviteInput ---------------------------------------------------

Deno.test("valid input is accepted and normalised", () => {
  const r = validateInviteInput({ email: "  New.Person@Example.COM ", display_name: "  New   Person " });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.value, { email: "new.person@example.com", displayName: "New Person", role: "staff" });
  }
});

Deno.test("role defaults to staff and owner is only granted when asked for", () => {
  const base = { email: "a@b.co", display_name: "A" };
  const none = validateInviteInput(base);
  const owner = validateInviteInput({ ...base, role: "owner" });
  assertEquals(none.ok && none.value.role, "staff");
  assertEquals(owner.ok && owner.value.role, "owner");
});

Deno.test("anything other than staff or owner is rejected as a role", () => {
  for (const role of ["admin", "Owner", "", "superuser", 1, true, {}]) {
    const r = validateInviteInput({ email: "a@b.co", display_name: "A", role });
    assertEquals(r.ok, false, `role ${JSON.stringify(role)} should be rejected`);
  }
});

Deno.test("bad emails are rejected", () => {
  for (const email of ["", "   ", "nope", "a@b", "a b@c.co", "a@b.co, c@d.co", "<x>@b.co", undefined, 5, null]) {
    const r = validateInviteInput({ email, display_name: "A" });
    assertEquals(r.ok, false, `email ${JSON.stringify(email)} should be rejected`);
  }
  const long = `${"a".repeat(250)}@b.co`;
  assertEquals(validateInviteInput({ email: long, display_name: "A" }).ok, false);
});

Deno.test("a missing, blank or over-long name is rejected", () => {
  for (const display_name of [undefined, "", "   ", "\n\t", 7]) {
    assertEquals(validateInviteInput({ email: "a@b.co", display_name }).ok, false);
  }
  assertEquals(validateInviteInput({ email: "a@b.co", display_name: "x".repeat(61) }).ok, false);
  assertEquals(validateInviteInput({ email: "a@b.co", display_name: "x".repeat(60) }).ok, true);
});

Deno.test("control characters are stripped from the name", () => {
  const r = validateInviteInput({ email: "a@b.co", display_name: "Sam\u0000\u0007\nJones" });
  assertEquals(r.ok && r.value.displayName, "Sam Jones");
});

Deno.test("a body that is not an object is rejected", () => {
  for (const body of [null, undefined, "x", 1, true]) {
    assertEquals(validateInviteInput(body).ok, false);
  }
});

// ============================================================================
// Write path, against a fake that behaves like Supabase.
//
// What the fake gets right, because the bugs we are guarding against live here:
//   - admin createUser refuses an email that ANY account holds (email_exists),
//     confirmed or not
//   - inviteUserByEmail refuses only a CONFIRMED user; for a pending (unconfirmed)
//     user it succeeds and re-sends. (This is the behaviour that made the first
//     version delete a pending invitee's account.)
//   - deleteUser removes the login AND cascades its staff_profiles row
//   - staff_profiles.user_id is unique
// ============================================================================

interface FakeUser { id: string; email: string; confirmed: boolean }
interface FakeProfile { user_id: string; role: string; display_name: string }

function makeWorld(opts: { insertFails?: boolean; inviteFails?: boolean } = {}) {
  let counter = 0;
  const w = {
    users: [] as FakeUser[],
    profiles: [] as FakeProfile[],
    invites: [] as Array<{ email: string; redirectTo: string }>,
    deleted: [] as string[],
    adminClientsBuilt: 0,
    insertFails: opts.insertFails ?? false,
    inviteFails: opts.inviteFails ?? false,
    // Who the bearer tokens belong to.
    callers: {
      "owner-token": { id: "caller-owner", isStaff: true },
      "staff-token": { id: "caller-staff", isStaff: true },
      "customer-token": { id: "caller-customer", isStaff: false },
    } as Record<string, { id: string; isStaff: boolean }>,
    addUser(email: string, confirmed: boolean, profile?: { role: string; display_name: string }) {
      const id = `existing-${++counter}`;
      w.users.push({ id, email, confirmed });
      if (profile) w.profiles.push({ user_id: id, ...profile });
      return id;
    },
  };
  w.profiles.push({ user_id: "caller-owner", role: "owner", display_name: "Leam" });
  w.profiles.push({ user_id: "caller-staff", role: "staff", display_name: "Sam" });

  const deps = {
    makeUserClient(authHeader: string) {
      const caller = w.callers[authHeader.replace(/^Bearer /, "")];
      return {
        auth: {
          getUser: () =>
            Promise.resolve(caller
              ? { data: { user: { id: caller.id } }, error: null }
              : { data: null, error: { message: "bad token" } }),
        },
        rpc: () => Promise.resolve({ data: caller?.isStaff ?? false, error: null }),
        from: () => ({
          select: () => ({
            eq: (_col: "user_id", value: string) => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: w.profiles.find((p) => p.user_id === value) ?? null,
                  error: null,
                }),
            }),
          }),
        }),
      };
    },
    makeAdminClient() {
      w.adminClientsBuilt++;
      return {
        auth: {
          admin: {
            createUser: ({ email }: { email: string; email_confirm: boolean }) => {
              if (w.users.some((u) => u.email === email)) {
                return Promise.resolve({
                  data: null,
                  error: { code: "email_exists", message: "A user with this email address has already been registered", status: 422 },
                });
              }
              const id = `new-${++counter}`;
              w.users.push({ id, email, confirmed: false });
              return Promise.resolve({ data: { user: { id } }, error: null });
            },
            inviteUserByEmail: (email: string, o: { redirectTo: string }) => {
              if (w.inviteFails) {
                return Promise.resolve({ error: { message: "Error sending invite email" } });
              }
              const existing = w.users.find((u) => u.email === email);
              if (existing?.confirmed) {
                return Promise.resolve({ error: { code: "email_exists", message: "already registered" } });
              }
              const user = existing ?? { id: `invited-${++counter}`, email, confirmed: false };
              if (!existing) w.users.push(user);
              w.invites.push({ email, redirectTo: o.redirectTo });
              return Promise.resolve({ data: { user: { id: user.id } }, error: null });
            },
            deleteUser: (id: string) => {
              w.deleted.push(id);
              w.users = w.users.filter((u) => u.id !== id);
              w.profiles = w.profiles.filter((p) => p.user_id !== id); // ON DELETE CASCADE
              return Promise.resolve({ error: null });
            },
          },
        },
        from: () => ({
          insert: (row: FakeProfile) => {
            if (w.insertFails) return Promise.resolve({ error: { message: "insert failed" } });
            if (w.profiles.some((p) => p.user_id === row.user_id)) {
              return Promise.resolve({ error: { message: "duplicate key value violates unique constraint" } });
            }
            w.profiles.push({ user_id: row.user_id, role: row.role, display_name: row.display_name });
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  };
  return { w, handle: createStaffInviteHandler(deps) };
}

function invite(token: string | null, body: Record<string, unknown> = { email: "new.person@example.com", display_name: "New Person" }) {
  return new Request("http://localhost/staff-invite", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: GOOD_ORIGIN,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

Deno.test("write path: an owner invites a new person, and exactly the right rows exist afterwards", async () => {
  const { w, handle } = makeWorld();
  const profilesBefore = w.profiles.length;

  const res = await handle(invite("owner-token", { email: "New.Person@Example.com", display_name: "  New  Person ", role: "staff" }));

  assertEquals(res.status, 200);
  assertEquals((await res.json()).ok, true);
  // A login now exists, unconfirmed, for the normalised email.
  const created = w.users.filter((u) => u.email === "new.person@example.com");
  assertEquals(created.length, 1);
  assertEquals(created[0].confirmed, false);
  // Exactly ONE new staff row, pointing at THAT login, with the right role and name.
  assertEquals(w.profiles.length, profilesBefore + 1);
  assertEquals(w.profiles.find((p) => p.user_id === created[0].id), {
    user_id: created[0].id,
    role: "staff",
    display_name: "New Person",
  });
  // One invite email, to them, landing on this app's own reset-password page.
  assertEquals(w.invites, [{ email: "new.person@example.com", redirectTo: `${GOOD_ORIGIN}/reset-password` }]);
  // Nothing was rolled back.
  assertEquals(w.deleted, []);
});

Deno.test("write path: an owner can create another owner, and only when asked", async () => {
  const { w, handle } = makeWorld();
  await handle(invite("owner-token", { email: "a@example.com", display_name: "A", role: "owner" }));
  await handle(invite("owner-token", { email: "b@example.com", display_name: "B" }));
  const roleOf = (email: string) => {
    const id = w.users.find((u) => u.email === email)!.id;
    return w.profiles.find((p) => p.user_id === id)!.role;
  };
  assertEquals(roleOf("a@example.com"), "owner");
  assertEquals(roleOf("b@example.com"), "staff");
});

Deno.test("write path: a signed-in non-owner is refused and nothing is written or even built", async () => {
  for (const token of ["staff-token", "customer-token"]) {
    const { w, handle } = makeWorld();
    const before = JSON.stringify({ u: w.users, p: w.profiles });
    const res = await handle(invite(token));
    assertEquals(res.status, 403, `${token} should be refused`);
    assertEquals(w.adminClientsBuilt, 0, `${token}: the service-role client must not be built`);
    assertEquals(JSON.stringify({ u: w.users, p: w.profiles }), before);
    assertEquals(w.invites, []);
  }
});

Deno.test("write path: a bad token is refused with 401 and nothing is built", async () => {
  const { w, handle } = makeWorld();
  const res = await handle(invite("not-a-real-token"));
  assertEquals(res.status, 401);
  assertEquals(w.adminClientsBuilt, 0);
  assertEquals(w.users, []);
});

Deno.test("write path: an email that already has a CONFIRMED account is refused and left untouched", async () => {
  const { w, handle } = makeWorld();
  const customer = w.addUser("new.person@example.com", true);
  const before = JSON.stringify({ u: w.users, p: w.profiles });

  const res = await handle(invite("owner-token"));

  assertEquals(res.status, 409);
  assertEquals(JSON.stringify({ u: w.users, p: w.profiles }), before);
  assertEquals(w.profiles.some((p) => p.user_id === customer), false, "must not be promoted to staff");
  assertEquals(w.deleted, []);
  assertEquals(w.invites, []);
});

Deno.test("write path: re-inviting someone who is PENDING must not delete their login or staff row", async () => {
  // The regression: invite re-sends for an unconfirmed user, so the old order
  // reached the insert, hit the unique key, and "rolled back" by deleting the
  // pending invitee's real account (cascading their staff row).
  const { w, handle } = makeWorld();
  const pending = w.addUser("new.person@example.com", false, { role: "staff", display_name: "New Person" });

  const res = await handle(invite("owner-token"));

  assertEquals(res.status, 409);
  assertEquals(w.deleted, [], "nothing may be deleted");
  assertEquals(w.users.some((u) => u.id === pending), true, "their login must still exist");
  assertEquals(
    w.profiles.find((p) => p.user_id === pending),
    { user_id: pending, role: "staff", display_name: "New Person" },
    "their staff row must be unchanged",
  );
  assertEquals(w.invites, []);
});

Deno.test("write path: an unconfirmed account that is NOT staff is not silently promoted", async () => {
  const { w, handle } = makeWorld();
  const stranger = w.addUser("new.person@example.com", false); // e.g. a customer who never confirmed

  const res = await handle(invite("owner-token"));

  assertEquals(res.status, 409);
  assertEquals(w.profiles.some((p) => p.user_id === stranger), false, "must not be given a staff row");
  assertEquals(w.invites, [], "and must not be sent a staff invite");
  assertEquals(w.deleted, []);
});

Deno.test("write path: if the staff row cannot be written, the new login is removed and no email is sent", async () => {
  const { w, handle } = makeWorld({ insertFails: true });
  const usersBefore = w.users.length;
  const profilesBefore = JSON.stringify(w.profiles);

  const res = await handle(invite("owner-token"));

  assertEquals(res.status, 500);
  assertEquals(w.users.length, usersBefore, "no half-made login may be left behind");
  assertEquals(JSON.stringify(w.profiles), profilesBefore);
  assertEquals(w.invites, [], "no invite may go to an account that failed to become staff");
  assertEquals(w.deleted.length, 1);
});

Deno.test("write path: if the invite email fails, everything is rolled back and a retry works", async () => {
  const { w, handle } = makeWorld({ inviteFails: true });
  const usersBefore = w.users.length;
  const profilesBefore = JSON.stringify(w.profiles);

  const first = await handle(invite("owner-token"));

  assertEquals(first.status, 502);
  assertEquals(w.users.length, usersBefore, "the login created for this attempt is removed");
  assertEquals(JSON.stringify(w.profiles), profilesBefore, "and so is the staff row");
  assertEquals(w.deleted.length, 1);

  // The owner fixes the mail problem and tries again: it must not hit 409.
  w.inviteFails = false;
  const second = await handle(invite("owner-token"));
  assertEquals(second.status, 200);
  assertEquals(w.users.filter((u) => u.email === "new.person@example.com").length, 1);
  assertEquals(w.invites.length, 1);
});

Deno.test("write path: rollback deletes only the login this request created", async () => {
  const { w, handle } = makeWorld({ insertFails: true });
  const bystander = w.addUser("someone.else@example.com", true, { role: "staff", display_name: "Else" });

  await handle(invite("owner-token"));

  assertEquals(w.deleted.includes(bystander), false);
  assertEquals(w.users.some((u) => u.id === bystander), true);
  assertEquals(w.profiles.some((p) => p.user_id === bystander), true);
});
