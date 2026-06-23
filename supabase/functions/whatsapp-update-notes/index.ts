// ============================================================
// supabase/functions/whatsapp-update-notes/index.ts
//
// Staff "Update notes" button in the inbox. Reads a WhatsApp thread,
// asks Claude to extract ONLY durable, reusable facts, and APPENDS
// them to the customer's profile notes (humans.notes) and each dog's
// grooming notes (dogs.groom_notes). Nothing is sent to the customer.
//
// Design notes:
//   - Staff-gated (Bearer JWT -> is_staff()), like whatsapp-generate-reply.
//   - Works for ALL customers, not just AI-onboarded ones — so writes
//     are APPEND-ONLY and de-duplicated, never overwriting what staff
//     have typed.
//   - The same two columns are already read back into the reply prompt
//     by whatsapp-agent/buildContext, so anything saved here feeds
//     future AI replies automatically.
//
// Body:    { conversation_id: uuid }
// Returns: { ok: true, updated: { customerNote: boolean,
//            dogs: [{ name, updated }] }, summary: string }
//          | { ok: false, reason: string }
//
// Env: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY (auto)
//      ANTHROPIC_API_KEY (shared with whatsapp-agent)
//      CLAUDE_MODEL (optional; defaults to claude-sonnet-4-6)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildAllowedOrigins, buildCorsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const CLAUDE_MODEL = Deno.env.get("CLAUDE_MODEL") ?? "claude-sonnet-4-6";

const ALLOWED_ORIGINS = buildAllowedOrigins("WHATSAPP_UPDATE_NOTES_ALLOWED_ORIGINS");
const corsFor = (req: Request) => buildCorsHeaders(req, ALLOWED_ORIGINS);

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

async function authoriseStaff(req: Request): Promise<
  | { ok: true }
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
    console.error("is_staff rpc failed:", staffErr);
    return { ok: false, reason: "staff check failed", status: 500 };
  }
  if (!staffCheck) return { ok: false, reason: "not staff", status: 403 };
  return { ok: true };
}

interface DogRow {
  id: string;
  name: string | null;
  breed: string | null;
  groom_notes: string | null;
}

interface ExtractedNotes {
  customer_note: string | null;
  dog_notes: Array<{ dog_id: string; note: string }>;
}

// Append-only, de-duplicated merge. Returns the new value and whether it
// changed. Skips when the addition is empty or already present (so a
// repeat click is a no-op and staff-typed notes are never lost).
function appendNote(existing: string | null, addition: string | null): {
  value: string;
  changed: boolean;
} {
  const add = (addition ?? "").trim();
  const base = (existing ?? "").trim();
  if (!add) return { value: base, changed: false };
  if (base && base.toLowerCase().includes(add.toLowerCase())) {
    return { value: base, changed: false };
  }
  return { value: base ? `${base}\n${add}` : add, changed: true };
}

// Parse Claude's reply into ExtractedNotes; tolerant of ```json fences.
function parseExtraction(raw: string): ExtractedNotes {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const parsed = JSON.parse(text) as Partial<ExtractedNotes>;
  const customer_note =
    typeof parsed.customer_note === "string" && parsed.customer_note.trim()
      ? parsed.customer_note.trim()
      : null;
  const dog_notes = Array.isArray(parsed.dog_notes)
    ? parsed.dog_notes
        .filter(
          (d): d is { dog_id: string; note: string } =>
            !!d && typeof d.dog_id === "string" && typeof d.note === "string" && d.note.trim() !== "",
        )
        .map((d) => ({ dog_id: d.dog_id, note: d.note.trim() }))
    : [];
  return { customer_note, dog_notes };
}

async function extractNotes(
  transcript: string,
  existingNotes: string,
  dogs: DogRow[],
): Promise<ExtractedNotes> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set on whatsapp-update-notes function");
  }

  const system =
    "You maintain CRM records for a UK dog grooming salon. Read the WhatsApp conversation and extract ONLY durable, reusable facts worth keeping on file.\n" +
    "- customer_note: a short note about the CUSTOMER (preferences, household, access/parking, communication needs, recurring context). Return null unless there is durable info NOT already in their existing notes.\n" +
    "- dog_notes: per-dog GROOMING-specific requests or needs the owner stated (style, coat, length, behaviour/handling, sensitivities, e.g. 'nervous of the dryer', 'keep the beard long'). Only include a dog when the owner said something grooming-relevant that is NOT already in that dog's notes.\n" +
    "Rules: be concise and factual, UK English, no greetings or emoji. Do NOT restate one-off scheduling chatter, prices, or anything already recorded. If nothing is worth saving, return null and an empty array. Each note <= 200 characters.\n" +
    'Return STRICT JSON only, no prose: { "customer_note": string|null, "dog_notes": [ { "dog_id": string, "note": string } ] }';

  const dogLines = dogs.length
    ? dogs
        .map(
          (d) =>
            `- ${d.name ?? "Unnamed"} [dog_id: ${d.id}] (${d.breed ?? "breed unknown"}) — existing grooming notes: ${
              d.groom_notes?.trim() || "(none)"
            }`,
        )
        .join("\n")
    : "(no dogs on file)";

  const userPrompt =
    `EXISTING CUSTOMER NOTES:\n${existingNotes.trim() || "(none)"}\n\n` +
    `DOGS ON FILE:\n${dogLines}\n\n` +
    `CONVERSATION (oldest first):\n${transcript}\n\n` +
    "Return the JSON only.";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      system,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 300)}`);
  }
  const body = await res.json();
  const textBlock = body.content?.find((c: { type: string }) => c.type === "text");
  if (!textBlock?.text) throw new Error("Claude returned no text");
  return parseExtraction(textBlock.text);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsFor(req) });
  }
  if (req.method !== "POST") {
    return json(req, { ok: false, reason: "method not allowed" }, 405);
  }

  const auth = await authoriseStaff(req);
  if (!auth.ok) return json(req, { ok: false, reason: auth.reason }, auth.status);

  let reqBody: { conversation_id?: string };
  try {
    reqBody = await req.json();
  } catch {
    return json(req, { ok: false, reason: "bad json" }, 400);
  }
  if (!reqBody?.conversation_id) {
    return json(req, { ok: false, reason: "conversation_id is required" }, 400);
  }
  if (!ANTHROPIC_API_KEY) {
    return json(req, { ok: false, reason: "AI is not configured on this function." }, 500);
  }

  const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { data: conv, error: convErr } = await supabase
      .from("whatsapp_conversations")
      .select("id, human_id")
      .eq("id", reqBody.conversation_id)
      .maybeSingle();
    if (convErr || !conv) return json(req, { ok: false, reason: "conversation not found" }, 404);
    if (!conv.human_id) {
      return json(req, {
        ok: false,
        reason: "This chat isn't linked to a customer yet, so there's nowhere to save notes.",
      });
    }

    const [{ data: human }, { data: dogs }, { data: messages }] = await Promise.all([
      supabase.from("humans").select("id, notes").eq("id", conv.human_id).maybeSingle(),
      supabase
        .from("dogs")
        .select("id, name, breed, groom_notes")
        .eq("human_id", conv.human_id)
        .order("name"),
      supabase
        .from("whatsapp_messages")
        .select("direction, content, sent_at")
        .eq("conversation_id", conv.id)
        .order("sent_at", { ascending: false })
        .limit(25),
    ]);

    if (!human) return json(req, { ok: false, reason: "customer record not found" }, 404);

    const dogRows: DogRow[] = (dogs ?? []) as DogRow[];
    const dogById = new Map(dogRows.map((d) => [d.id, d]));

    const transcript = (messages ?? [])
      .slice()
      .reverse()
      .map((m: { direction: string | null; content: string | null }) => {
        const who = m.direction === "inbound" ? "Customer" : "Us";
        const text = (m.content ?? "(non-text message)").replace(/\s+/g, " ").trim();
        return `${who}: ${text}`;
      })
      .filter((line) => line.length > 0)
      .join("\n");

    if (!transcript) {
      return json(req, {
        ok: true,
        updated: { customerNote: false, dogs: [] },
        summary: "No messages to read yet.",
      });
    }

    const extracted = await extractNotes(transcript, human.notes ?? "", dogRows);

    // ── Append-merge the customer note ──
    let customerNoteUpdated = false;
    const customerMerge = appendNote(human.notes ?? "", extracted.customer_note);
    if (customerMerge.changed) {
      const { error } = await supabase
        .from("humans")
        .update({ notes: customerMerge.value })
        .eq("id", conv.human_id);
      if (error) throw new Error(`humans.notes update failed: ${error.message}`);
      customerNoteUpdated = true;
    }

    // ── Append-merge each dog's grooming notes (validated to this owner) ──
    const dogResults: Array<{ name: string; updated: boolean }> = [];
    for (const entry of extracted.dog_notes) {
      const dog = dogById.get(entry.dog_id);
      if (!dog) continue; // ignore ids that aren't this customer's dogs
      const merge = appendNote(dog.groom_notes ?? "", entry.note);
      if (!merge.changed) continue;
      const { error } = await supabase
        .from("dogs")
        .update({ groom_notes: merge.value })
        .eq("id", dog.id)
        .eq("human_id", conv.human_id);
      if (error) throw new Error(`dogs.groom_notes update failed: ${error.message}`);
      dogResults.push({ name: dog.name ?? "dog", updated: true });
    }

    const changedDogs = dogResults.map((d) => d.name);
    let summary: string;
    if (customerNoteUpdated && changedDogs.length) {
      summary = `Saved a customer note and grooming notes for ${changedDogs.join(", ")}.`;
    } else if (customerNoteUpdated) {
      summary = "Saved a new customer note.";
    } else if (changedDogs.length) {
      summary = `Saved grooming notes for ${changedDogs.join(", ")}.`;
    } else {
      summary = "Nothing new to add — notes are already up to date.";
    }

    return json(req, {
      ok: true,
      updated: { customerNote: customerNoteUpdated, dogs: dogResults },
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("whatsapp-update-notes error:", message);
    return json(req, { ok: false, reason: "Could not update notes right now. Please try again." }, 500);
  }
});
