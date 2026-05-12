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

    if (action.action === "reschedule") {
      const newDate = action.payload.new_date as string | undefined;
      const newSlot = action.payload.new_slot as string | undefined;
      // Action row may carry the booking id either on target_booking_id
      // (the structured column) or on payload.old_booking_id (the
      // round-trip from Claude). Prefer the structured column.
      const oldBookingId =
        (action.target_booking_id as string | null) ??
        (action.payload.old_booking_id as string | undefined) ??
        null;

      if (!oldBookingId || !newDate || !newSlot) {
        throw new Error("reschedule payload missing booking id / new_date / new_slot");
      }

      // Re-fetch the booking — needs to still be in 'Booked' status
      // (post check-in or pick-up the customer cannot move it themselves).
      const { data: existing, error: bookErr } = await supabase
        .from("bookings")
        .select("id, status, booking_date, slot, dog_id")
        .eq("id", oldBookingId)
        .single();
      if (bookErr || !existing) {
        throw new Error(`original booking not found: ${oldBookingId}`);
      }
      if (existing.status !== "Booked") {
        const { data: rejectedRows } = await supabase
          .from("whatsapp_booking_actions")
          .update({
            state: "rejected_by_customer",
            rejection_reason: `not_movable_status_${existing.status}`,
          })
          .eq("id", action.id)
          .eq("state", "awaiting_customer_confirm")
          .select("id");
        if (rejectedRows && rejectedRows.length > 0) {
          await sendAckText(
            action.conversation_id,
            "I can't move that booking automatically — one of the team will be in touch shortly. 🎓🐶❤️ X",
          );
        }
        return new Response("not_movable", { status: 200 });
      }

      // Apply-time recency check: even though the AI's propose-time gate
      // requires the ORIGINAL booking to be ≥24h away, the customer can
      // sit on the confirm message for up to 24h before tapping. By then
      // the new slot may be hours away — too tight for staff prep. Block
      // any reschedule whose NEW slot is less than 4 hours from now and
      // hand off to staff instead.
      //
      // Times are stored as local UK clock time (date + "HH:MM"). We
      // interpret them as Europe/London by hardcoding +01:00 (BST). In
      // winter (GMT, +00:00) this treats bookings as 1h earlier than
      // real, which is the conservative direction — we'll reject a few
      // minutes more eagerly, never accept a sub-4h slot incorrectly.
      const APPLY_TIME_MIN_HOURS = 4;
      const newBookingMs = Date.parse(`${newDate}T${newSlot}:00+01:00`);
      const earliestAllowedMs = Date.now() + APPLY_TIME_MIN_HOURS * 60 * 60 * 1000;
      if (Number.isFinite(newBookingMs) && newBookingMs < earliestAllowedMs) {
        const { data: rejectedRows } = await supabase
          .from("whatsapp_booking_actions")
          .update({
            state: "rejected_by_customer",
            rejection_reason: `too_close_at_apply_time_${APPLY_TIME_MIN_HOURS}h`,
          })
          .eq("id", action.id)
          .eq("state", "awaiting_customer_confirm")
          .select("id");
        if (rejectedRows && rejectedRows.length > 0) {
          await sendAckText(
            action.conversation_id,
            "That's getting close to the appointment — one of the team will sort the move shortly. 🎓🐶❤️ X",
          );
        }
        return new Response("too_close", { status: 200 });
      }

      // Optimistic-lock the action transition. From here on, only this
      // caller owns the row.
      const { data: confirmedRows } = await supabase
        .from("whatsapp_booking_actions")
        .update({ state: "confirmed", decided_at: new Date().toISOString() })
        .eq("id", action.id)
        .eq("state", "awaiting_customer_confirm")
        .select("id");
      if (!confirmedRows || confirmedRows.length === 0) {
        console.warn(`apply-customer-confirm: action ${action.id} reschedule confirm transition skipped (raced)`);
        return new Response("already_processed", { status: 200 });
      }

      // Apply the move. The validate_booking_capacity trigger runs on
      // UPDATE and will raise on slot conflicts / capacity rules.
      const { data: updatedRows, error: updateErr } = await supabase
        .from("bookings")
        .update({ booking_date: newDate, slot: newSlot })
        .eq("id", oldBookingId)
        .eq("status", "Booked")
        .select("id");
      if (updateErr) {
        const msg = updateErr.message;
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
            "Ah, that new slot just went — let me check what else is open. 🎓🐶❤️ X",
          );
          return new Response("slot_gone", { status: 200 });
        }
        throw new Error(msg);
      }
      // Status changed between the fetch and the UPDATE (e.g. groomer
      // checked the dog in on the salon tablet at the same moment the
      // customer tapped Yes). The status='Booked' filter matched zero
      // rows — UPDATE returns no error but didn't apply. Hand off to
      // staff so they can sort it out face-to-face.
      if (!updatedRows || updatedRows.length === 0) {
        await supabase
          .from("whatsapp_booking_actions")
          .update({
            state: "rejected_by_customer",
            rejection_reason: "not_movable_at_apply_time",
          })
          .eq("id", action.id)
          .eq("state", "confirmed");
        await sendAckText(
          action.conversation_id,
          "I can't move that booking automatically — one of the team will be in touch shortly. 🎓🐶❤️ X",
        );
        return new Response("not_movable_at_apply", { status: 200 });
      }

      // Transition the action row to auto_applied. applied_booking_id
      // points at the same booking we moved (no new bookings.id).
      await supabase
        .from("whatsapp_booking_actions")
        .update({
          state: "auto_applied",
          applied_booking_id: oldBookingId,
          applied_at: new Date().toISOString(),
        })
        .eq("id", action.id)
        .eq("state", "confirmed");

      const dogName = await fetchDogName(supabase, existing.dog_id as string | undefined);
      const summary = formatBookingSummary(
        { booking_date: newDate, slot: newSlot, service: "" },
        dogName,
      );
      // formatBookingSummary uses service for the trailing label; when
      // service is empty we strip the dash form and just keep the name.
      // For reschedule we don't change the service — the ack focuses on
      // the new date/slot.
      const cleanedSummary = summary.replace(/ — $/, "").replace(/ for (.+)'s $/, " for $1");
      await sendAckText(
        action.conversation_id,
        `All moved ✓ ${cleanedSummary} (same service as before). 🎓🐶❤️ X`,
      );
      return new Response("rescheduled", { status: 200 });
    }

    if (action.action === "cancel") {
      const oldBookingId =
        (action.target_booking_id as string | null) ??
        (action.payload.old_booking_id as string | undefined) ??
        null;
      const reason =
        (action.payload.reason as string | undefined)?.trim() ||
        "customer requested via WhatsApp";

      if (!oldBookingId) {
        throw new Error("cancel payload missing booking id");
      }

      // Re-fetch the booking. Only 'Booked' status is cancellable
      // autonomously — Checked-in / Ready-for-pick-up bookings are
      // mid-service and need staff to handle (refunds, partial work,
      // etc.).
      const { data: existing, error: bookErr } = await supabase
        .from("bookings")
        .select("id, status, booking_date, slot, dog_id")
        .eq("id", oldBookingId)
        .single();
      if (bookErr || !existing) {
        throw new Error(`original booking not found: ${oldBookingId}`);
      }
      if (existing.status !== "Booked") {
        const { data: rejectedRows } = await supabase
          .from("whatsapp_booking_actions")
          .update({
            state: "rejected_by_customer",
            rejection_reason: `not_cancellable_status_${existing.status}`,
          })
          .eq("id", action.id)
          .eq("state", "awaiting_customer_confirm")
          .select("id");
        if (rejectedRows && rejectedRows.length > 0) {
          await sendAckText(
            action.conversation_id,
            "I can't cancel that one automatically — one of the team will be in touch. 🎓🐶❤️ X",
          );
        }
        return new Response("not_cancellable", { status: 200 });
      }

      // Optimistic-lock the action.
      const { data: confirmedRows } = await supabase
        .from("whatsapp_booking_actions")
        .update({ state: "confirmed", decided_at: new Date().toISOString() })
        .eq("id", action.id)
        .eq("state", "awaiting_customer_confirm")
        .select("id");
      if (!confirmedRows || confirmedRows.length === 0) {
        console.warn(`apply-customer-confirm: action ${action.id} cancel confirm transition skipped (raced)`);
        return new Response("already_processed", { status: 200 });
      }

      // Apply the cancellation. UPDATE-to-cancel fires the existing
      // notify-booking-cancelled trigger (migration history). Filter on
      // status='Booked' to catch the check-in race window.
      const { data: updatedRows, error: updateErr } = await supabase
        .from("bookings")
        .update({
          status: "Cancelled",
          cancel_reason: reason.slice(0, 500),
        })
        .eq("id", oldBookingId)
        .eq("status", "Booked")
        .select("id");
      if (updateErr) {
        // Capacity isn't relevant to cancellation — any error here is
        // a real failure. Fall through to staff queue via outer catch.
        throw new Error(updateErr.message);
      }
      if (!updatedRows || updatedRows.length === 0) {
        // Status changed between fetch and UPDATE (e.g. groomer just
        // checked the dog in). Hand off to staff.
        await supabase
          .from("whatsapp_booking_actions")
          .update({
            state: "rejected_by_customer",
            rejection_reason: "not_cancellable_at_apply_time",
          })
          .eq("id", action.id)
          .eq("state", "confirmed");
        await sendAckText(
          action.conversation_id,
          "I can't cancel that one automatically — one of the team will be in touch. 🎓🐶❤️ X",
        );
        return new Response("not_cancellable_at_apply", { status: 200 });
      }

      // Auto-applied transition.
      await supabase
        .from("whatsapp_booking_actions")
        .update({
          state: "auto_applied",
          applied_booking_id: oldBookingId,
          applied_at: new Date().toISOString(),
        })
        .eq("id", action.id)
        .eq("state", "confirmed");

      await sendAckText(
        action.conversation_id,
        "All cancelled ✓ Hope to see you another time. 🎓🐶❤️ X",
      );
      return new Response("cancelled", { status: 200 });
    }

    // Defensive: unknown action kind from a future schema bump
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
