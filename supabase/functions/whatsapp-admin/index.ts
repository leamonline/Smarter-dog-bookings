// whatsapp-admin — management actions against Meta Cloud API (not messaging).
// Use for one-off setup and diagnostic calls: list WABA subscriptions,
// subscribe the app to webhook events, check phone number status, and manage
// message templates (submit + sync approval status).
//
// Separate from whatsapp-send (messaging) and whatsapp-register (one-shot
// number registration) because management operations are a different
// concern with different lifecycles — better to keep them decoupled.
//
// Auth: x-internal-secret (no JWT). Only for trusted admin use.
//
// Actions:
//   { "action": "list_subscriptions" }
//     GET /{waba-id}/subscribed_apps — which apps are subscribed to this WABA's webhooks
//   { "action": "subscribe_app" }
//     POST /{waba-id}/subscribed_apps — subscribe the current app (derived from token) to this WABA's webhooks
//   { "action": "phone_status" }
//     GET /{phone-number-id} — returns registration + verification state for the phone number
//   { "action": "list_templates" }
//     GET /{waba-id}/message_templates — raw Meta view of every message template (diagnostic; no DB writes)
//   { "action": "create_template", "template_name"?, "language"? }
//     POST /{waba-id}/message_templates — submit a template to Meta from its whatsapp_templates
//     row (defaults to day_closure_v1/en_GB). On success stores meta_id + status back on the row.
//   { "action": "sync_templates" }
//     GET /{waba-id}/message_templates — reconcile Meta's status/meta_id/category onto the
//     whatsapp_templates rows we track. The broadcast gate reads status='approved' from there.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualHeader } from "../_shared/webhook-auth.ts";
import { mapMetaStatus, normaliseCategory } from "./templates.ts";

const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN")!;
const META_PHONE_NUMBER_ID = Deno.env.get("META_PHONE_NUMBER_ID")!;
const META_WABA_ID = Deno.env.get("META_WABA_ID")!;
const SEND_INTERNAL_SECRET = Deno.env.get("SEND_INTERNAL_SECRET")!;
// Auto-injected by the Supabase Edge runtime — no new secrets to set.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GRAPH_API_VERSION = "v22.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const DEFAULT_TEMPLATE = { name: "day_closure_v1", language: "en_GB" };

const JSON_HEADERS = { "Content-Type": "application/json" };

async function metaFetch(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<{ status: number; body: string }> {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${META_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

serve(async (req) => {
  const json = (status: number, payload: unknown) =>
    new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });

  try {
    if (
      !timingSafeEqualHeader(
        req.headers.get("x-internal-secret"),
        SEND_INTERNAL_SECRET,
      )
    ) {
      return new Response("Unauthorized", { status: 401 });
    }
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const payload = await req.json().catch(() => null);
    const action = payload?.action;

    if (action === "list_subscriptions") {
      const r = await metaFetch(`/${META_WABA_ID}/subscribed_apps`, "GET");
      return new Response(r.body, { status: r.status, headers: JSON_HEADERS });
    }

    if (action === "subscribe_app") {
      const r = await metaFetch(`/${META_WABA_ID}/subscribed_apps`, "POST");
      return new Response(r.body, { status: r.status, headers: JSON_HEADERS });
    }

    if (action === "phone_status") {
      const r = await metaFetch(`/${META_PHONE_NUMBER_ID}?fields=verified_name,display_phone_number,quality_rating,code_verification_status,platform_type,throughput,status`, "GET");
      return new Response(r.body, { status: r.status, headers: JSON_HEADERS });
    }

    if (action === "list_templates") {
      // Diagnostic: raw Meta view, no DB writes.
      const r = await metaFetch(
        `/${META_WABA_ID}/message_templates?fields=name,status,category,language,id&limit=200`,
        "GET",
      );
      return new Response(r.body, { status: r.status, headers: JSON_HEADERS });
    }

    if (action === "create_template") {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const name = typeof payload?.template_name === "string" ? payload.template_name : DEFAULT_TEMPLATE.name;
      const language = typeof payload?.language === "string" ? payload.language : DEFAULT_TEMPLATE.language;

      // The DB row is the single source of truth for the submission body.
      const { data: row, error: readErr } = await supabase
        .from("whatsapp_templates")
        .select("name, language, category, components")
        .eq("name", name)
        .eq("language", language)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (readErr) return json(500, { error: "db read failed", detail: readErr.message });
      if (!row) return json(404, { error: `no whatsapp_templates row for ${name}/${language}` });

      const r = await metaFetch(`/${META_WABA_ID}/message_templates`, "POST", {
        name: row.name,
        language: row.language,
        category: row.category,
        components: row.components,
      });
      const parsed = parseJson(r.body) as { id?: string; status?: string; category?: string } | null;

      // Persist meta_id + status on a successful create so sync isn't required
      // to see we've submitted. Meta returns e.g. { id, status: "PENDING" }.
      if (r.status >= 200 && r.status < 300 && parsed?.id) {
        const update: Record<string, unknown> = {
          meta_id: parsed.id,
          status: mapMetaStatus(parsed.status),
          updated_at: new Date().toISOString(),
        };
        const cat = normaliseCategory(parsed.category);
        if (cat) update.category = cat;
        const { error: writeErr } = await supabase
          .from("whatsapp_templates")
          .update(update)
          .eq("name", row.name)
          .eq("language", row.language);
        if (writeErr) {
          return json(502, { error: "submitted to Meta but DB write failed", meta: parsed, detail: writeErr.message });
        }
      }
      return new Response(r.body, { status: r.status, headers: JSON_HEADERS });
    }

    if (action === "sync_templates") {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      // limit=200 covers the salon's handful of templates in one page.
      const r = await metaFetch(
        `/${META_WABA_ID}/message_templates?fields=name,status,category,language,id&limit=200`,
        "GET",
      );
      const parsed = parseJson(r.body) as { data?: Array<Record<string, string>> } | null;
      if (r.status < 200 || r.status >= 300 || !Array.isArray(parsed?.data)) {
        return new Response(r.body, { status: r.status, headers: JSON_HEADERS });
      }

      // Only reconcile templates we actually track in the DB.
      const { data: rows, error: rowsErr } = await supabase
        .from("whatsapp_templates")
        .select("name, language, status, meta_id, category");
      if (rowsErr) return json(500, { error: "db read failed", detail: rowsErr.message });
      const managed = new Map(
        (rows ?? []).map((row: { name: string; language: string; status: string; meta_id: string | null; category: string }) =>
          [`${row.name}::${row.language}`, row]),
      );

      const changes: Array<Record<string, unknown>> = [];
      for (const t of parsed.data) {
        const row = managed.get(`${t.name}::${t.language}`);
        if (!row) continue;
        const nextStatus = mapMetaStatus(t.status);
        const nextMetaId = t.id ?? null;
        const nextCat = normaliseCategory(t.category);

        const update: Record<string, unknown> = {};
        if (row.status !== nextStatus) update.status = nextStatus;
        if (row.meta_id !== nextMetaId) update.meta_id = nextMetaId;
        if (nextCat && row.category !== nextCat) update.category = nextCat;
        if (Object.keys(update).length === 0) continue;

        update.updated_at = new Date().toISOString();
        const { error: writeErr } = await supabase
          .from("whatsapp_templates")
          .update(update)
          .eq("name", t.name)
          .eq("language", t.language);
        changes.push({
          name: t.name,
          language: t.language,
          from: row.status,
          to: nextStatus,
          meta_status: t.status,
          meta_id: nextMetaId,
          ...(writeErr ? { error: writeErr.message } : {}),
        });
      }
      return json(200, { synced: changes.length, changes });
    }

    return json(400, {
      error: "unknown action; must be list_subscriptions | subscribe_app | phone_status | list_templates | create_template | sync_templates",
    });
  } catch (err) {
    console.error("whatsapp-admin error:", err);
    return json(500, { error: "Internal error" });
  }
});
