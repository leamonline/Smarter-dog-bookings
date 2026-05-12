// ============================================================
// supabase/functions/apply-customer-confirm/index.ts
//
// Handles a customer's [Yes] / [No, change] tap on a Meta interactive
// button sent by whatsapp-send (confirm_buttons mode).
//
// Called internally by whatsapp-agent when it detects a button_reply
// event with id matching `<booking_action_id>:yes|no`.
//
// On Yes: re-checks availability (catches races since the agent built
//         context), runs the booking action via apply_whatsapp_booking_action
//         (autonomous path uses state='confirmed' which bypasses is_staff),
//         transitions to auto_applied, fires ack message.
// On No:  transitions to rejected_by_customer, agent re-engages next turn.
//
// Idempotent: re-tapping does nothing destructive.
// TTL:       awaiting_customer_confirm older than 24h transitions to
//            rejected_by_customer with reason='expired'.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { timingSafeEqualHeader } from "../_shared/webhook-auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("APPLY_CONFIRM_INTERNAL_SECRET")!;
const SEND_INTERNAL_SECRET = Deno.env.get("SEND_INTERNAL_SECRET") ?? "";
const WHATSAPP_SEND_URL =
  Deno.env.get("WHATSAPP_SEND_URL") ?? `${SUPABASE_URL}/functions/v1/whatsapp-send`;

interface ConfirmInput {
  booking_action_id: string;
  choice: "yes" | "no";
}

async function sendAckText(conversation_id: string, text: string) {
  if (!SEND_INTERNAL_SECRET) return;
  try {
    await fetch(WHATSAPP_SEND_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": SEND_INTERNAL_SECRET,
      },
      body: JSON.stringify({ mode: "text", conversation_id, text }),
    });
  } catch (err) {
    console.warn("sendAckText failed (non-fatal):", err);
  }
}

async function fetchDogName(
  supabase: SupabaseClient,
  dogId: string | undefined,
): Promise<string | null> {
  if (!dogId) return null;
  const { data, error } = await supabase
    .from("dogs")
    .select("name")
    .eq("id", dogId)
    .maybeSingle();
  if (error) {
    console.warn(`fetchDogName(${dogId}) failed (non-fatal):`, error.message);
    return null;
  }
  return data?.name ?? null;
}

function formatBookingSummary(
  payload: Record<string, unknown>,
  dogName: string | null,
): string {
  const date = payload.booking_date as string;
  const slot = payload.slot as string;
  const service = payload.service as string;
  const serviceLabel: Record<string, string> = {
    "full-groom": "full groom",
    "bath-and-brush": "bath & brush",
    "bath-and-deshed": "bath & deshed",
    "puppy-groom": "puppy groom",
  };
  const label = serviceLabel[service] ?? service;
  const formattedDate = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
  // "Mon 18 May at 09:30 for Alfie's full groom" when we have a dog name,
  // a generic dash form otherwise.
  if (dogName) {
    return `${formattedDate} at ${slot} for ${dogName}'s ${label}`;
  }
  return `${formattedDate} at ${slot} — ${label}`;
}

// Substrings of the validate_booking_capacity trigger's exception messages
// (migration 20260331083432_capacity_trigger.sql). When the RPC fails with
// one of these, the slot has been taken since the agent built context —
// we surface the "slot just went" UX instead of the generic staff fallback.
const CAPACITY_ERROR_HINTS = [
  "Not enough capacity",
  "fills this slot",
  "share this slot",
  "back-to-back large dogs",
  "13:00 is closed",
  "must be empty",
  "must have 0-1 seats used",
];

function isCapacityError(message: string): boolean {
  const lower = message.toLowerCase();
  return CAPACITY_ERROR_HINTS.some((hint) => lower.includes(hint.toLowerCase()));
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  if (!timingSafeEqualHeader(req.headers.get("x-internal-secret"), INTERNAL_SECRET)) {
    return new Response("unauthorized", { status: 401 });
  }

  let input: ConfirmInput;
  try {
    input = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (!input.booking_action_id || (input.choice !== "yes" && input.choice !== "no")) {
    return new Response("missing or invalid fields", { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: action, error: actionErr } = await supabase
    .from("whatsapp_booking_actions")
    .select("id, conversation_id, action, payload, state, customer_confirm_expires_at, target_booking_id")
    .eq("id", input.booking_action_id)
    .single();

  if (actionErr || !action) {
    return new Response("action not found", { status: 404 });
  }

  // Idempotency: only act on actions still awaiting customer confirmation.
  if (action.state !== "awaiting_customer_confirm") {
    return new Response(`already ${action.state}`, { status: 200 });
  }

  // TTL: expire stale awaiting_customer_confirm rows.
  if (action.customer_confirm_expires_at && new Date(action.customer_confirm_expires_at) < new Date()) {
    const { data: expiredRows } = await supabase
      .from("whatsapp_booking_actions")
      .update({ state: "rejected_by_customer", rejection_reason: "expired" })
      .eq("id", action.id)
      .eq("state", "awaiting_customer_confirm")
      .select("id");
    if (!expiredRows || expiredRows.length === 0) {
      // Lost the race: someone else transitioned the row first. Don't
      // double-fire the ack — the winning caller's response covers it.
      console.warn(`apply-customer-confirm: action ${action.id} TTL transition skipped (raced)`);
      return new Response("already_processed", { status: 200 });
    }
    await sendAckText(action.conversation_id, "Sorry, that confirmation expired — want me to find a slot again? 🎓🐶❤️ X");
    return new Response("expired", { status: 200 });
  }

  if (input.choice === "no") {
    const { data: rejectedRows } = await supabase
      .from("whatsapp_booking_actions")
      .update({ state: "rejected_by_customer", rejection_reason: "customer_no" })
      .eq("id", action.id)
      .eq("state", "awaiting_customer_confirm")
      .select("id");
    if (!rejectedRows || rejectedRows.length === 0) {
      console.warn(`apply-customer-confirm: action ${action.id} No transition skipped (raced)`);
      return new Response("already_processed", { status: 200 });
    }
    // No ack here — the agent will re-engage on the next inbound turn.
    return new Response("rejected by customer", { status: 200 });
  }

  // choice === 'yes' — run the action
  try {
    if (action.action === "create") {
      // Capacity is enforced by validate_booking_capacity (BEFORE INSERT on
      // bookings — migration 20260331083432). We don't pre-check here:
      //   - The trigger is the canonical gate (multi-seat slots via
      //     get_max_seats_for_slot, large-dog rules, back-to-back rules).
      //   - Any pre-check has a TOCTOU race against the actual INSERT.
      // We catch the trigger's exception below and surface a "slot just
      // went" ack on capacity-style failures.
      //
      // Optimistic-lock transition to 'confirmed' so
      // apply_whatsapp_booking_action treats this as the autonomous path
      // (no is_staff() check, bookings.source = 'whatsapp_ai_auto').
      const { data: confirmedRows } = await supabase
        .from("whatsapp_booking_actions")
        .update({ state: "confirmed", decided_at: new Date().toISOString() })
        .eq("id", action.id)
        .eq("state", "awaiting_customer_confirm")
        .select("id");
      if (!confirmedRows || confirmedRows.length === 0) {
        // Lost the race: another caller already moved this past
        // awaiting_customer_confirm. No-op (idempotent).
        console.warn(`apply-customer-confirm: action ${action.id} confirm transition skipped (raced)`);
        return new Response("already_processed", { status: 200 });
      }

      const { error: applyErr } = await supabase.rpc(
        "apply_whatsapp_booking_action",
        { p_action_id: action.id },
      );
      if (applyErr) {
        const msg = applyErr.message;
        // Concurrent-retry case: another caller already applied. The
        // apply_whatsapp_booking_action function raises this when state
        // is no longer pending or confirmed. Idempotent no-op, clean log.
        if (msg.includes("not pending or confirmed")) {
          console.warn(`apply-customer-confirm: action ${action.id} already applied (retry)`);
          return new Response("already_applied", { status: 200 });
        }
        // Capacity gone: slot filled between context-build and apply. Send
        // a "slot just went" ack so the customer gets a coherent UX, not
        // silent staff-queue handoff.
        if (isCapacityError(msg)) {
          await supabase
            .from("whatsapp_booking_actions")
            .update({
              state: "rejected_by_customer",
              rejection_reason: `capacity_gone: ${msg}`.slice(0, 500),
            })
            .eq("id", action.id)
            .eq("state", "confirmed");
          await sendAckText(
            action.conversation_id,
            "Ah, that slot just went — let me check what else is open. 🎓🐶❤️ X",
          );
          return new Response("slot_gone", { status: 200 });
        }
        // Anything else: real failure — fall through to the catch's
        // staff-queue fallback so the lead isn't lost.
        throw new Error(msg);
      }

      const dogName = await fetchDogName(supabase, action.payload?.dog_id as string | undefined);
      const summary = formatBookingSummary(action.payload, dogName);
      await sendAckText(
        action.conversation_id,
        `You're booked in ✓ ${summary}. See you then! 🎓🐶❤️ X`,
      );
      return new Response("auto_applied", { status: 200 });
    }

    // reschedule and cancel branches land in Tasks 10–11
    return new Response(`unsupported action kind: ${action.action}`, { status: 501 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Auto-apply failed — fall back to staff queue so the lead isn't
    // lost. Only fall back if we're the caller that owns the row
    // (state='confirmed' from our transition above).
    await supabase
      .from("whatsapp_booking_actions")
      .update({ state: "pending", error_message: `auto_apply_failed: ${message}` })
      .eq("id", action.id)
      .eq("state", "confirmed");
    console.error("apply-customer-confirm failed:", message);
    return new Response("fell back to pending", { status: 200 });
  }
});
