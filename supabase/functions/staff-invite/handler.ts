// ============================================================
// supabase/functions/staff-invite/handler.ts
//
// Owner-only: invite a new member of staff.
//
//   1. Prove the caller is a signed-in OWNER (not merely staff): their own JWT
//      through auth.getUser(), then is_staff(), then staff_profiles.role.
//   2. Ask Supabase Auth to send an invite email. The new person chooses their
//      own password on /reset-password; nobody here ever sees or sets one.
//   3. Insert their staff_profiles row with the service-role key. That insert
//      is revoked for every other role on purpose (is_staff() trusts row
//      existence), so this function is the ONLY path that can mint staff.
//
// Safety rules baked in:
//   - It refuses when a login already exists for the email. Promoting an
//     existing account (a customer, say) because someone mistyped an address
//     would hand that person every customer's data. That stays a deliberate,
//     manual step.
//   - redirectTo is built only from an origin on the allowlist, never from
//     anything in the request body, so it cannot be turned into an open
//     redirect.
//   - If the profile insert fails after the login was created, the login is
//     deleted again so no half-made account is left behind.
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

async function authoriseOwner(req: Request): Promise<
  | { ok: true; ownerUserId: string }
  | { ok: false; reason: string; status: number }
> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return { ok: false, reason: "missing authorization", status: 401 };

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
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

function isAlreadyRegistered(err: { code?: string; message?: string; status?: number }): boolean {
  if (err.code === "email_exists" || err.code === "user_already_exists") return true;
  return /already (been )?registered|already exists/i.test(err.message ?? "");
}

export async function handleStaffInvite(req: Request): Promise<Response> {
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

  const auth = await authoriseOwner(req);
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

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Invite. If a login already exists Supabase refuses, which is exactly the
  // outcome we want: we never touch an existing account.
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });
  if (inviteErr || !invited?.user) {
    if (inviteErr && isAlreadyRegistered(inviteErr)) {
      return json(
        req,
        {
          ok: false,
          reason:
            "A login already exists for that email, so it hasn't been changed. If they should be staff, add them in the Supabase dashboard instead.",
        },
        409,
      );
    }
    console.error("invite failed:", inviteErr?.message);
    return json(req, { ok: false, reason: "couldn't send the invite" }, 502);
  }

  const newUserId = invited.user.id;
  const { error: insertErr } = await admin
    .from("staff_profiles")
    .insert({ user_id: newUserId, role, display_name: displayName });
  if (insertErr) {
    console.error("staff_profiles insert failed:", insertErr.message);
    // Don't leave a login with no staff row (or a dangling invite) behind.
    const { error: cleanupErr } = await admin.auth.admin.deleteUser(newUserId);
    if (cleanupErr) {
      console.error(
        JSON.stringify({ event: "staff_invite_cleanup_failed", user_id: newUserId, message: cleanupErr.message }),
      );
    }
    return json(req, { ok: false, reason: "couldn't add them as staff" }, 500);
  }

  console.log(
    JSON.stringify({ event: "staff_invited", by: auth.ownerUserId, user_id: newUserId, role }),
  );
  return json(req, { ok: true, role, display_name: displayName });
}
