// ============================================================
// supabase/functions/register-device-token/handler.ts
//
// The iPhone app registers or refreshes its APNs token.
//
//   1. The caller's own Supabase JWT, via auth.getUser(). Customers and
//      staff both use this. There is no is_staff() gate: a customer must
//      be able to register. The role stored on the row is derived from
//      is_staff() under that same token, never from the body.
//   2. The service-role client upserts on apns_token. The same phone moving
//      from one account to another has to update a row the new user cannot
//      see under RLS, so this function is the path that moves it. Direct
//      table access still only lets someone manage their own rows.
//
// Registration works while IOS_PUSH_ENABLED is off, so a TestFlight build
// can store tokens before any reminder is allowed to use them.
//
// Body: { apns_token, environment: "sandbox"|"production", bundle_id,
//         notifications_enabled?: boolean }
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normaliseApnsEnvironment, normaliseApnsToken, normaliseBundleId } from "../_shared/apns.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export interface RegisterDeviceInput {
  apnsToken: string;
  environment: "sandbox" | "production";
  bundleId: string;
  notificationsEnabled: boolean;
}

export function parseRegisterBody(
  body: unknown,
): { ok: true; value: RegisterDeviceInput } | { ok: false; reason: string } {
  if (!body || typeof body !== "object") return { ok: false, reason: "invalid_body" };
  const record = body as Record<string, unknown>;
  const apnsToken = normaliseApnsToken(record.apns_token);
  if (!apnsToken) return { ok: false, reason: "invalid_token" };
  const environment = normaliseApnsEnvironment(record.environment);
  if (!environment) return { ok: false, reason: "invalid_environment" };
  const bundleId = normaliseBundleId(record.bundle_id);
  if (!bundleId) return { ok: false, reason: "invalid_bundle_id" };
  if (record.notifications_enabled !== undefined && typeof record.notifications_enabled !== "boolean") {
    return { ok: false, reason: "invalid_notifications_enabled" };
  }
  return {
    ok: true,
    value: {
      apnsToken,
      environment,
      bundleId,
      notificationsEnabled: record.notifications_enabled !== false,
    },
  };
}

export interface StoredDeviceToken {
  id: string;
  user_id: string;
  role: "customer" | "staff";
  apns_token: string;
  environment: "sandbox" | "production";
  bundle_id: string;
  last_seen_at: string;
  notifications_enabled: boolean;
}

export interface RegisterUserClient {
  auth: {
    getUser(): Promise<{ data: { user: { id: string } | null } | null; error: unknown }>;
  };
  rpc(fn: "is_staff"): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface RegisterAdminClient {
  from(table: "device_tokens"): {
    upsert(
      row: Omit<StoredDeviceToken, "id"> & { updated_at: string },
      options: { onConflict: "apns_token" },
    ): {
      select(columns: string): {
        single(): Promise<{ data: StoredDeviceToken | null; error: { message: string } | null }>;
      };
    };
  };
}

export interface RegisterDeps {
  makeUserClient(authHeader: string): RegisterUserClient;
  makeAdminClient(): RegisterAdminClient;
  /** When set, the body's bundle id must match. Unset allows registration before the secret exists. */
  expectedBundleId: string | null;
  now(): Date;
}

const defaultDeps: RegisterDeps = {
  makeUserClient: (authHeader) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    }) as unknown as RegisterUserClient,
  makeAdminClient: () =>
    createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    }) as unknown as RegisterAdminClient,
  expectedBundleId: Deno.env.get("APNS_BUNDLE_ID")?.trim() || null,
  now: () => new Date(),
};

async function authorise(
  req: Request,
  deps: RegisterDeps,
): Promise<
  | { ok: true; userId: string; role: "customer" | "staff" }
  | { ok: false; status: number; reason: string }
> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.trim() === "Bearer") {
    return { ok: false, status: 401, reason: "unauthorized" };
  }
  const userClient = deps.makeUserClient(authHeader);
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) return { ok: false, status: 401, reason: "unauthorized" };

  const { data: staff, error: staffErr } = await userClient.rpc("is_staff");
  if (staffErr || (staff !== true && staff !== false)) {
    return { ok: false, status: 503, reason: "role_lookup_failed" };
  }
  return { ok: true, userId: userRes.user.id, role: staff === true ? "staff" : "customer" };
}

export function createRegisterDeviceTokenHandler(deps: RegisterDeps) {
  return async function handleRegisterDeviceToken(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204 });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const auth = await authorise(req, deps);
    if (!auth.ok) return json({ error: auth.reason }, auth.status);

    let parsedBody: unknown;
    try {
      parsedBody = await req.json();
    } catch {
      return json({ error: "invalid_body" }, 400);
    }
    const input = parseRegisterBody(parsedBody);
    if (!input.ok) return json({ error: input.reason }, 400);
    if (deps.expectedBundleId && input.value.bundleId !== deps.expectedBundleId) {
      return json({ error: "bundle_mismatch" }, 422);
    }

    const seenAt = deps.now().toISOString();
    const admin = deps.makeAdminClient();
    const { data, error } = await admin
      .from("device_tokens")
      .upsert(
        {
          user_id: auth.userId,
          role: auth.role,
          apns_token: input.value.apnsToken,
          environment: input.value.environment,
          bundle_id: input.value.bundleId,
          last_seen_at: seenAt,
          notifications_enabled: input.value.notificationsEnabled,
          updated_at: seenAt,
        },
        { onConflict: "apns_token" },
      )
      .select("id, user_id, role, apns_token, environment, bundle_id, last_seen_at, notifications_enabled")
      .single();
    if (error || !data) {
      console.error("device token upsert failed:", error?.message);
      return json({ error: "save_failed" }, 500);
    }
    return json({
      ok: true,
      id: data.id,
      role: data.role,
      environment: data.environment,
      bundle_id: data.bundle_id,
      last_seen_at: data.last_seen_at,
      notifications_enabled: data.notifications_enabled,
    });
  };
}

export const handleRegisterDeviceToken = createRegisterDeviceTokenHandler(defaultDeps);
