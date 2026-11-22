// ============================================================
// supabase/functions/apns-send/handler.ts
//
// Service-to-service APNs send. Reminders call it with x-internal-secret.
// There is no browser path.
//
// IOS_PUSH_ENABLED defaults off: a call is refused before Apple is contacted
// and the caller is told to fall back. A token Apple says is dead is deleted
// here, so a later reminder does not keep trying it. An auth failure or a
// 5xx does not delete the token.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualHeader } from "../_shared/webhook-auth.ts";
import { iosPushEnabled } from "../_shared/apnsChannel.ts";
import {
  ApnsNotContactedError,
  normaliseApnsEnvironment,
  normaliseApnsToken,
  normaliseBundleId,
  normalisePem,
  sendApnsAlert,
  type ApnsEnvironment,
} from "../_shared/apns.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Apple was not contacted. The reminder may use WhatsApp, then SMS, then email. */
function notSent(error: string): Response {
  return json({
    ok: false,
    sent: 0,
    invalid: 0,
    failed: 0,
    all_invalid: false,
    outcome_unknown: false,
    fallback: true,
    apns_id: null,
    error,
  });
}

interface TokenInput {
  id: string;
  apnsToken: string;
  environment: ApnsEnvironment;
  bundleId: string;
}

export function parseApnsSendBody(body: unknown): { ok: true; tokens: TokenInput[]; title: string; alertBody: string; collapseId: string | null } | { ok: false; reason: string } {
  if (!body || typeof body !== "object") return { ok: false, reason: "invalid_body" };
  const record = body as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const alertBody = typeof record.body === "string" ? record.body.trim() : "";
  if (!title || !alertBody) return { ok: false, reason: "invalid_body" };
  if (!Array.isArray(record.tokens) || record.tokens.length === 0 || record.tokens.length > 20) {
    return { ok: false, reason: "invalid_tokens" };
  }
  const tokens: TokenInput[] = [];
  for (const item of record.tokens) {
    if (!item || typeof item !== "object") return { ok: false, reason: "invalid_tokens" };
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const apnsToken = normaliseApnsToken(row.apns_token);
    const environment = normaliseApnsEnvironment(row.environment);
    const bundleId = normaliseBundleId(row.bundle_id);
    if (!id || !apnsToken || !environment || !bundleId) return { ok: false, reason: "invalid_tokens" };
    tokens.push({ id, apnsToken, environment, bundleId });
  }
  const collapseId = typeof record.collapse_id === "string" && record.collapse_id.trim()
    ? record.collapse_id.trim().slice(0, 64)
    : null;
  return { ok: true, tokens, title: title.slice(0, 120), alertBody: alertBody.slice(0, 2000), collapseId };
}

export interface ApnsAdmin {
  from(table: "device_tokens"): {
    delete(): {
      in(column: "id", values: string[]): Promise<{ error: { message: string } | null }>;
    };
  };
}

export interface ApnsSendDeps {
  fetch: typeof fetch;
  makeAdminClient(): ApnsAdmin;
  pushEnabled(): boolean;
  expectedBundleId(): string | null;
  secrets(): { keyId: string; teamId: string; privateKeyPem: string } | null;
  internalSecret(): string | null;
}

const defaultDeps: ApnsSendDeps = {
  fetch,
  makeAdminClient: () =>
    createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    }) as unknown as ApnsAdmin,
  pushEnabled: () => iosPushEnabled(Deno.env.get("IOS_PUSH_ENABLED")),
  expectedBundleId: () => Deno.env.get("APNS_BUNDLE_ID")?.trim() || null,
  secrets: () => {
    const keyId = Deno.env.get("APNS_KEY_ID")?.trim() ?? "";
    const teamId = Deno.env.get("APNS_TEAM_ID")?.trim() ?? "";
    const privateKey = Deno.env.get("APNS_PRIVATE_KEY") ?? "";
    if (!keyId || !teamId || !privateKey.trim()) return null;
    return { keyId, teamId, privateKeyPem: normalisePem(privateKey) };
  },
  internalSecret: () => Deno.env.get("SEND_INTERNAL_SECRET") ?? null,
};

export function createApnsSendHandler(deps: ApnsSendDeps) {
  return async function handleApnsSend(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204 });
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    if (!timingSafeEqualHeader(req.headers.get("x-internal-secret"), deps.internalSecret())) {
      return json({ error: "unauthorized" }, 401);
    }
    if (!deps.pushEnabled()) {
      return json({ ok: false, sent: 0, invalid: 0, failed: 0, all_invalid: false, outcome_unknown: false, fallback: true, apns_id: null, error: "ios_push_disabled" });
    }

    let parsedBody: unknown;
    try {
      parsedBody = await req.json();
    } catch {
      // Nothing was sent to Apple, so the reminder may use WhatsApp.
      return notSent("invalid_body");
    }
    const input = parseApnsSendBody(parsedBody);
    if (!input.ok) return notSent(input.reason);

    const bundleId = deps.expectedBundleId();
    const secrets = deps.secrets();
    if (!bundleId || !secrets) {
      return json({ ok: false, sent: 0, invalid: 0, failed: 0, all_invalid: false, outcome_unknown: false, fallback: true, apns_id: null, error: "apns_not_configured" });
    }

    let sent = 0;
    let apnsId: string | null = null;
    let inconclusive = false;
    const invalidIds: string[] = [];
    for (const token of input.tokens) {
      if (token.bundleId !== bundleId) continue;
      let result;
      try {
        result = await sendApnsAlert(
          {
            deviceToken: token.apnsToken,
            environment: token.environment,
            bundleId,
            title: input.title,
            body: input.alertBody,
            collapseId: input.collapseId ?? undefined,
            data: { kind: "booking_reminder" },
          },
          secrets,
          deps.fetch,
        );
      } catch (err) {
        if (err instanceof ApnsNotContactedError) {
          // Signing failed before the request. WhatsApp is still safe.
          console.error("apns send failed before Apple:", err.message);
          continue;
        }
        // Anything else may be after Apple accepted the push.
        console.error("apns send outcome unknown:", err instanceof Error ? err.message : String(err));
        inconclusive = true;
        continue;
      }
      if (result.kind === "sent") {
        sent += 1;
        apnsId = apnsId ?? result.apnsId;
      } else if (result.kind === "invalid_token") {
        invalidIds.push(token.id);
      } else if (result.kind === "unavailable") {
        // 429, 5xx, or the connection dropped. The push might have arrived.
        inconclusive = true;
      }
      // "rejected" (403 InvalidProviderToken, 400 BadTopic, …) is a definite
      // no. The device token stays. fallback stays true when nothing was sent
      // and nothing was inconclusive.
    }

    if (invalidIds.length > 0) {
      const admin = deps.makeAdminClient();
      const { error } = await admin.from("device_tokens").delete().in("id", invalidIds);
      if (error) console.error("device token delete failed:", error.message);
    }

    const outcomeUnknown = sent === 0 && inconclusive;
    return json({
      ok: sent > 0,
      sent,
      invalid: invalidIds.length,
      failed: inconclusive ? 1 : 0,
      all_invalid: sent === 0 && invalidIds.length > 0 && !inconclusive,
      outcome_unknown: outcomeUnknown,
      fallback: sent === 0 && !outcomeUnknown,
      apns_id: apnsId,
    });
  };
}

export const handleApnsSend = createApnsSendHandler(defaultDeps);
