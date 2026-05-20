// ============================================================
// supabase/functions/dashboard-summary/index.ts
//
// Dashboard WhatsApp module — AI-written summary of what's waiting.
// Returns one sentence describing the awaiting customer threads,
// cached against the "newest conversation updated_at" so unchanged
// inbox state doesn't burn a Claude call on every dashboard load.
//
// Body: {} (auth via Bearer JWT; staff check)
// Returns: {
//   summary: string,
//   awaitingCount: number,
//   generatedAt: string,    // ISO timestamp
//   fromCache: boolean,
// }
//
// Env vars:
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY (auto)
//   ANTHROPIC_API_KEY  (shared with whatsapp-agent)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAllowedOrigins, buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

// Claude Haiku 4.5 — cheap + fast, well-suited to a one-sentence summary.
const CLAUDE_MODEL = "claude-haiku-4-5";
const CACHE_KEY = "whatsapp";

const ALLOWED_ORIGINS = buildAllowedOrigins("DASHBOARD_SUMMARY_ALLOWED_ORIGINS");

const corsFor = (req: Request) => buildCorsHeaders(req, ALLOWED_ORIGINS);

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

async function authoriseStaff(req: Request): Promise<
  | { ok: true; userId: string }
  | { ok: false; reason: string; status: number }
> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return { ok: false, reason: "missing authorization", status: 401 };
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes?.user) {
    return { ok: false, reason: "invalid token", status: 401 };
  }
  const { data: staffCheck, error: staffErr } = await userClient.rpc("is_staff");
  if (staffErr) {
    console.error("is_staff rpc failed:", staffErr);
    return { ok: false, reason: "staff check failed", status: 500 };
  }
  if (!staffCheck) {
    return { ok: false, reason: "not staff", status: 403 };
  }
  return { ok: true, userId: userRes.user.id };
}

interface AwaitingConversation {
  id: string;
  customer_name: string | null;
  last_text: string | null;
  last_at: string | null;
}

async function fetchAwaiting(supabase: SupabaseClient): Promise<{
  conversations: AwaitingConversation[];
  computedAgainst: string | null;
}> {
  // Limit to 25 — beyond that the summary degrades from "useful" to
  // "wall of names" and Claude tokens get expensive without value.
  const { data, error } = await supabase
    .from("whatsapp_conversations")
    .select(
      "id, last_customer_text, last_inbound_at, updated_at, humans:human_id(name, surname)",
    )
    .gt("unread_count", 0)
    .is("closed_at", null)
    .order("last_inbound_at", { ascending: false, nullsFirst: false })
    .limit(25);
  if (error) {
    console.error("fetchAwaiting error:", error);
    return { conversations: [], computedAgainst: null };
  }
  const conversations = (data ?? []).map((c: any) => {
    const human = c.humans;
    const name = [human?.name, human?.surname].filter(Boolean).join(" ").trim();
    return {
      id: c.id,
      customer_name: name || null,
      last_text: c.last_customer_text ?? null,
      last_at: c.last_inbound_at ?? null,
    };
  });
  const computedAgainst = (data ?? []).reduce<string | null>((max, c: any) => {
    const v = c.updated_at;
    if (!v) return max;
    return !max || v > max ? v : max;
  }, null);
  return { conversations, computedAgainst };
}

async function callHaiku(awaiting: AwaitingConversation[]): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set on dashboard-summary function");
  }
  if (awaiting.length === 0) return "Inbox is clear — no messages waiting.";

  const lines = awaiting.map((c) => {
    const who = c.customer_name ?? "Unknown contact";
    const text = (c.last_text ?? "(non-text message)").replace(/\s+/g, " ").slice(0, 200);
    return `- ${who}: "${text}"`;
  }).join("\n");

  const system = `You are summarising the WhatsApp inbox for a dog grooming salon's staff dashboard. Write ONE short, warm sentence describing what's waiting. Be specific (mention names + topics when clear) but don't repeat every message verbatim. No emoji. No greeting. Plain text only, under 240 characters.`;

  const userPrompt = `Here's what's waiting (${awaiting.length} conversation${awaiting.length === 1 ? "" : "s"}):\n\n${lines}\n\nReturn just the one-sentence summary, nothing else.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 200,
      system,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 300)}`);
  }
  const json: any = await res.json();
  const textBlock = json.content?.find((c: any) => c.type === "text");
  if (!textBlock?.text) throw new Error("Claude returned no text");
  return textBlock.text.trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsFor(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "method not allowed" }, 405);
  }

  const auth = await authoriseStaff(req);
  if (!auth.ok) {
    return json(req, { error: auth.reason }, auth.status);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { conversations, computedAgainst } = await fetchAwaiting(supabase);

    // Cache hit when:
    //   - We have a cached row, AND
    //   - The cached row was computed against a >= timestamp of the
    //     newest awaiting conversation right now, AND
    //   - The awaiting_count matches (catches the "0 → 1 → 0" edge
    //     where the timestamp comparison alone wouldn't flag it).
    const { data: cached } = await supabase
      .from("dashboard_summary_cache")
      .select("summary, computed_against, awaiting_count, updated_at")
      .eq("key", CACHE_KEY)
      .maybeSingle();

    const cacheStillValid =
      !!cached &&
      cached.awaiting_count === conversations.length &&
      (!computedAgainst || (cached.computed_against && cached.computed_against >= computedAgainst));

    if (cacheStillValid) {
      return json(req, {
        summary: cached.summary,
        awaitingCount: conversations.length,
        generatedAt: cached.updated_at,
        fromCache: true,
      });
    }

    const summary = await callHaiku(conversations);
    const generatedAt = new Date().toISOString();

    // Upsert into cache. computed_against uses the max we saw OR now()
    // if there were no awaiting rows (so an empty inbox caches the
    // "all clear" message until something arrives and bumps updated_at).
    await supabase
      .from("dashboard_summary_cache")
      .upsert(
        {
          key: CACHE_KEY,
          summary,
          computed_against: computedAgainst ?? generatedAt,
          awaiting_count: conversations.length,
          updated_at: generatedAt,
        },
        { onConflict: "key" },
      );

    return json(req, {
      summary,
      awaitingCount: conversations.length,
      generatedAt,
      fromCache: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("dashboard-summary error:", message);
    return json(req, { error: "internal error", detail: message }, 500);
  }
});
