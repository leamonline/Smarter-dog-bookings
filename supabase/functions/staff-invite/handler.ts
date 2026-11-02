// ============================================================
// supabase/functions/staff-invite/handler.ts
//
// Owner-only: invite a new member of staff.
//
//   1. Prove the caller is a signed-in OWNER (not merely staff): their own JWT
//      through auth.getUser(), then is_staff(), then staff_profiles.role.
//   2. CREATE the login with the admin API. This is the safety step: Supabase
//      refuses to create a user for an email that already has ANY account,
//      confirmed or not. (inviteUserByEmail does NOT: for a pending, unconfirmed
//      user it just re-sends the invite and returns that existing user, which is
//      how an earlier version could delete or promote someone else's account.)
//      So from here on, the login belongs to this request and to nobody else.
//   3. Insert their staff_profiles row with the service-role key. That insert
//      is revoked for every other role on purpose (is_staff() trusts row
//      existence), so this function is the ONLY path that can mint staff.
//   4. Send the invite email last, so no email goes out for an account that
//      failed to become staff. The new person chooses their own password on
//      /reset-password; nobody here ever sees or sets one.
//
// Safety rules baked in:
//   - It never touches an account that existed before the request: a 409 is
//     returned and nothing changes. Promoting an existing account (a customer,
//     say) because someone mistyped an address would hand that person every
//     customer's data. That stays a deliberate, manual step.
//   - Rollback (delete the login, which cascades the staff row) only ever
//     targets the id returned by step 2, i.e. an account this request created.
//   - redirectTo is built only from an origin on the allowlist, never from
//     anything in the request body, so it cannot be turned into an open
//     redirect.
//   - Logs carry user ids and the role, never the email or name.
//
// Body:    { email: string, display_name: string, role?: "staff" | "owner" }
// Returns: { ok: true, role, display_name } | { ok: false, reason: string }
//
// Env: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (auto)
//      STAFF_INVITE_ALLOWED_ORIGINS (optional; defaults to the salon's origins)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAllowedOrigins, buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = buildAllowedOrigins("STAFF_INVITE_ALLOWED_ORIGINS");
const corsFor = (req: Request) => buildCorsHeaders(req, ALLOWED_ORIGINS);

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

export type StaffRole = "staff" | "owner";

export interface InviteInput {
  email: string;
  displayName: string;
  role: StaffRole;
}

// Deliberately plain: Supabase Auth does the real validation. This only
// stops obvious junk from reaching it.
const EMAIL_RE = /^[^\s@<>()"',;:\\]+@[^\s@<>()"',;:\\]+\.[^\s@<>()"',;:\\]+$/;

/** Pure input check, exported so it can be tested with no database or network. */
export function validateInviteInput(
  body: unknown,
): { ok: true; value: InviteInput } | { ok: false; reason: string } {
  if (!body || typeof body !== "object") return { ok: false, reason: "invalid body" };
  const b = body as Record<string, unknown>;

  const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return { ok: false, reason: "enter a valid email address" };
  }

  // Strip control characters, collapse whitespace, then bound the length.
  const displayName = (typeof b.display_name === "string" ? b.display_name : "")
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!displayName) return { ok: false, reason: "enter their name" };
  if (displayName.length > 60) return { ok: false, reason: "name is too long (60 characters max)" };

  const rawRole = b.role === undefined || b.role === null ? "staff" : b.role;
  if (rawRole !== "staff" && rawRole !== "owner") {
    return { ok: false, reason: "role must be staff or owner" };
  }

  return { ok: true, value: { email, displayName, role: rawRole } };
}

// ---- The slice of Supabase this function uses ------------------------------
// Declared structurally so handler.test.ts can substitute a recording fake and
// assert what was ACTUALLY written (the repo's write-path testing rule), without
// a database or network. The real clients are adapted in defaultDeps below.

interface AuthErrorLike {
  code?: string;
  message?: string;
  status?: number;
}

export interface UserClientLike {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null } | null; error: unknown }>;
  };
  rpc(fn: "is_staff"): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  from(table: "staff_profiles"): {
    select(columns: "role"): {
      eq(column: "user_id", value: string): {
        maybeSingle(): PromiseLike<{ data: { role?: string } | null; error: { message: string } | null }>;
      };
    };
  };
}

export interface AdminClientLike {
  auth: {
    admin: {
      createUser(attributes: {
        email: string;
        email_confirm: boolean;
      }): Promise<{ data: { user: { id: string } | null } | null; error: AuthErrorLike | null }>;
      inviteUserByEmail(
        email: string,
        options: { redirectTo: string },
      ): Promise<{ data?: { user: { id: string } | null } | null; error: AuthErrorLike | null }>;
      deleteUser(id: string): Promise<{ error: AuthErrorLike | null }>;
    };
  };
  from(table: "staff_profiles"): {
    insert(row: { user_id: string; role: StaffRole; display_name: string }): PromiseLike<{
      error: { message: string } | null;
    }>;
  };
}

export interface StaffInviteDeps {
  /** A client that acts as the CALLER, using their own Authorization header. */
  makeUserClient(authHeader: string): UserClientLike;
  /** The service-role client. Only built once the caller is proven an owner. */
  makeAdminClient(): AdminClientLike;
}

const defaultDeps: StaffInviteDeps = {
  makeUserClient: (authHeader) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    }) as unknown as UserClientLike,
  makeAdminClient: () =>
    createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    }) as unknown as AdminClientLike,
};

async function authoriseOwner(
  req: Request,
  deps: StaffInviteDeps,
): Promise<
  | { ok: true; ownerUserId: string }
  | { ok: false; reason: string; status: number }
> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return { ok: false, reason: "missing authorization", status: 401 };

  const userClient = deps.makeUserClient(authHeader);
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return { ok: false, reason: "invalid token", status: 401 };

  const { data: staffCheck, error: staffErr } = await userClient.rpc("is_staff");
  if (staffErr) {
    console.error("is_staff rpc failed:", staffErr.message);
    return { ok: false, reason: "staff check failed", status: 500 };
  }
  if (!staffCheck) return { ok: false, reason: "not staff", status: 403 };

  // Staff is not enough: only an owner may create more staff. Read under the
  // caller's own token, so RLS decides what they can see.
  const { data: profile, error: profileErr } = await userClient
    .from("staff_profiles")
    .select("role")
    .eq("user_id", userRes.user.id)
    .maybeSingle();
  if (profileErr) {
    console.error("owner check failed:", profileErr.message);
    return { ok: false, reason: "owner check failed", status: 500 };
  }
  if (profile?.role !== "owner") return { ok: false, reason: "owners only", status: 403 };

  return { ok: true, ownerUserId: userRes.user.id };
}

function isAlreadyRegistered(err: AuthErrorLike): boolean {
  if (err.code === "email_exists" || err.code === "user_already_exists") return true;
  return /already (been )?registered|already exists/i.test(err.message ?? "");
}

const ALREADY_EXISTS_REASON =
  "A login already exists for that email, so nothing has been changed. If they've been invited but haven't signed in yet, ask them to check their email (and spam). To add or re-invite them, use the Supabase dashboard.";

export function createStaffInviteHandler(deps: StaffInviteDeps) {
  return async function handleStaffInvite(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsFor(req) });
    }
    if (req.method !== "POST") {
      return json(req, { ok: false, reason: "method not allowed" }, 405);
    }

    // The invite link's destination comes only from an allowlisted origin.
    // Checked before any client is built, so a stray caller costs nothing.
    const origin = req.headers.get("origin") ?? "";
    if (!ALLOWED_ORIGINS.has(origin)) {
      return json(req, { ok: false, reason: "origin not allowed" }, 403);
    }

    const auth = await authoriseOwner(req, deps);
    if (!auth.ok) return json(req, { ok: false, reason: auth.reason }, auth.status);

    let parsedBody: unknown;
    try {
      parsedBody = await req.json();
    } catch {
      return json(req, { ok: false, reason: "invalid body" }, 400);
    }
    const input = validateInviteInput(parsedBody);
    if (!input.ok) return json(req, { ok: false, reason: input.reason }, 400);
    const { email, displayName, role } = input.value;

    const admin = deps.makeAdminClient();

    // 1. Create the login. Refused (email_exists) for ANY existing account, so
    //    a success proves the account is brand new and ours to roll back.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: false,
    });
    if (createErr || !created?.user) {
      if (createErr && isAlreadyRegistered(createErr)) {
        return json(req, { ok: false, reason: ALREADY_EXISTS_REASON }, 409);
      }
      console.error("create user failed:", createErr?.message);
      return json(req, { ok: false, reason: "couldn't create their login" }, 502);
    }
    const newUserId = created.user.id;

    // Undo, for an account THIS request created and nobody else. Deleting the
    // login cascades its staff_profiles row.
    const rollback = async (step: string) => {
      const { error: cleanupErr } = await admin.auth.admin.deleteUser(newUserId);
      if (cleanupErr) {
        console.error(
          JSON.stringify({
            event: "staff_invite_cleanup_failed",
            step,
            user_id: newUserId,
            message: cleanupErr.message,
          }),
        );
      }
    };

    // 2. Make them staff.
    const { error: insertErr } = await admin
      .from("staff_profiles")
      .insert({ user_id: newUserId, role, display_name: displayName });
    if (insertErr) {
      console.error("staff_profiles insert failed:", insertErr.message);
      await rollback("insert");
      return json(req, { ok: false, reason: "couldn't add them as staff" }, 500);
    }

    // 3. Email last, so no invite goes to an account that failed to become staff.
    //    The login now exists but is unconfirmed, so this sends the invite to it.
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/reset-password`,
    });
    if (inviteErr) {
      console.error("invite email failed:", inviteErr.message);
      await rollback("invite");
      return json(req, { ok: false, reason: "couldn't send the invite email" }, 502);
    }

    console.log(
      JSON.stringify({ event: "staff_invited", by: auth.ownerUserId, user_id: newUserId, role }),
    );
    return json(req, { ok: true, role, display_name: displayName });
  };
}

export const handleStaffInvite = createStaffInviteHandler(defaultDeps);
