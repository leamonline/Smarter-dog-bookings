// ============================================================
// supabase/functions/slack-alerts/index.ts
//
// Operational alerts into the salon's #salon-today Slack channel: anything
// that changes today, or needs a human to act today. Nothing else.
//
// ONE FUNCTION, ONE DOOR TO SLACK. Every alert path in this file ends at
// postToSlack(). The incoming-webhook URL is read in exactly one place, so
// the kill switch, the posting window, the deduplication claim and the
// privacy rule cannot be bypassed by a future call site that forgets them.
//
// Called only by Postgres — pg_net from a booking_events trigger, and pg_cron
// for the sweeps. Never by a browser. Auth is the webhook Bearer secret.
//
// THREE MODES
//   event    a booking was created, moved or cancelled (trigger, immediate)
//   sweep    every 5 minutes: no-shows, dogs left in Ready, unanswered
//            messages — plus flushing anything queued out of hours
//   summary  08:15 London: the day ahead, and whether it is quiet or full
//
// Why that split: the trigger alerts are EVENTS — there is an exact moment
// they happen and the database already recorded it. The sweep alerts are the
// ABSENCE of events. When a dog fails to arrive, no row changes; the signal
// is that nothing happened, and only a clock can see that.
//
// DARK-LAUNCHED. The whole function is a no-op unless SLACK_ALERTS_ENABLED
// is true, and posts nothing when SLACK_ALERTS_DRY_RUN is true. Both default
// to off, so merging this before the secrets exist changes nothing.
//
// Every failure path returns 200. A non-2xx would make pg_net retry and
// pg_cron log failures; a Slack outage must stay a Slack outage, not become
// database noise.
//
// Deployed with --no-verify-jwt like every other function here, so the
// in-function auth check below IS the security boundary.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAuthorizedWebhook } from "../_shared/webhook-auth.ts";
import { buildSlotGrid, DAILY_DOG_CAP, type DogSize } from "../_shared/salonConstants.ts";
import { visitStartInstant } from "../_shared/manageBooking.ts";
import {
  MORNING_SUMMARY_HOUR_UK,
  NO_SHOW_AFTER_MINUTES,
  READY_OVERDUE_MINUTES,
  UNANSWERED_AFTER_MINUTES,
} from "../_shared/slackAlertThresholds.ts";
import {
  decidePosting,
  isQueuedAlertStale,
  isWithinPostingWindow,
  londonDatePlus,
  londonWallClock,
} from "../_shared/slackAlertWindow.ts";
import {
  type AlertInput,
  ALERT_SEVERITY,
  alertBookingDate,
  alertBookingId,
  alertConversationId,
  type BookingSubject,
  buildAlertText,
  buildDedupeKey,
} from "../_shared/slackMessage.ts";

const SLACK_ALERTS_ENABLED =
  (Deno.env.get("SLACK_ALERTS_ENABLED") ?? "false").toLowerCase() === "true";
const SLACK_ALERTS_DRY_RUN =
  (Deno.env.get("SLACK_ALERTS_DRY_RUN") ?? "false").toLowerCase() === "true";
const SLACK_SALON_TODAY_WEBHOOK = Deno.env.get("SLACK_SALON_TODAY_WEBHOOK");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

const BOOKING_STATUS_BOOKED = "Booked";
const BOOKING_STATUS_READY = "Ready for pick-up";
const BOOKING_STATUS_CANCELLED = "Cancelled";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── The one door to Slack ──────────────────────────────────────────────

export interface PostOutcome {
  alertType: string;
  decision: "post" | "queue" | "drop" | "duplicate" | "failed";
}

/**
 * Build, gate, deduplicate and send one alert.
 *
 * Order matters:
 *   1. decide post / queue / drop against the London wall clock
 *   2. CLAIM the dedupe key by INSERT — before sending, never after. If this
 *      function dies between claim and send, the alert is lost rather than
 *      posted twice; for a channel staff are meant to trust, under-posting
 *      is the right failure direction.
 *   3. send (or, in dry run, log)
 *
 * A send failure demotes the row back to 'queued' so the next sweep retries
 * it, rather than silently burning the alert on a transient Slack blip.
 */
async function postToSlack(
  supabase: SupabaseClient,
  input: AlertInput,
  now: Date,
  firstSlotOfDate: string | null = null,
): Promise<PostOutcome> {
  const severity = ALERT_SEVERITY[input.type];
  const text = buildAlertText(input);
  const alertKey = buildDedupeKey(input);
  const bookingDate = alertBookingDate(input);

  const decision = decidePosting({
    alertType: input.type,
    bookingDate,
    slot: "booking" in input ? input.booking.slot : null,
    firstSlotOfDate,
  }, now);

  if (decision === "drop") {
    // A cron-driven alert raised out of hours. It re-evaluates every five
    // minutes and will post itself at 08:00 if still true, so recording it
    // as dropped is honest and claiming the key would be wrong.
    return { alertType: input.type, decision: "drop" };
  }

  const row = {
    alert_key: alertKey,
    alert_type: input.type,
    severity,
    booking_id: alertBookingId(input),
    conversation_id: alertConversationId(input),
    booking_date: bookingDate,
    state: decision === "queue" ? "queued" : "posted",
    message: text,
    dry_run: SLACK_ALERTS_DRY_RUN,
    posted_at: decision === "queue" ? null : new Date().toISOString(),
  };

  const { data: claimed, error: claimErr } = await supabase
    .from("slack_alerts")
    .insert(row)
    .select("id")
    .single();

  if (claimErr) {
    if (claimErr.code === "23505") {
      return { alertType: input.type, decision: "duplicate" };
    }
    // Could not claim for some other reason. Posting anyway risks a repeat
    // every five minutes, which is worse than a missed alert.
    console.error(`slack-alerts: claim failed for ${alertKey}: ${claimErr.message}`);
    return { alertType: input.type, decision: "failed" };
  }

  if (decision === "queue") {
    return { alertType: input.type, decision: "queue" };
  }

  const sent = await sendToSlack(text);
  if (!sent) {
    // Demote to queued so the next sweep retries rather than losing it.
    await supabase
      .from("slack_alerts")
      .update({ state: "queued", posted_at: null })
      .eq("id", claimed?.id ?? "")
      .then(undefined, () => undefined);
    return { alertType: input.type, decision: "failed" };
  }

  return { alertType: input.type, decision: "post" };
}

/** The only fetch() to Slack in the codebase. Returns false rather than
 *  throwing: a Slack outage must never propagate into a booking transaction. */
async function sendToSlack(text: string): Promise<boolean> {
  if (SLACK_ALERTS_DRY_RUN) {
    console.log(`slack-alerts [DRY RUN] would post: ${text}`);
    return true;
  }
  if (!SLACK_SALON_TODAY_WEBHOOK) {
    console.error("slack-alerts: SLACK_SALON_TODAY_WEBHOOK is not set");
    return false;
  }
  try {
    const res = await fetch(SLACK_SALON_TODAY_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.error(`slack-alerts: Slack returned ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`slack-alerts: post failed: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

// ── Data helpers ───────────────────────────────────────────────────────

interface DogFacts {
  name: string | null;
  breed: string | null;
}

interface BookingRow {
  id: string;
  slot: string;
  size: DogSize | null;
  status: string;
  booking_date: string;
  ready_at: string | null;
  dog_name_snapshot: string | null;
  breed_snapshot: string | null;
  // PostgREST returns an embedded many-to-one as an object, but the generated
  // client types it as an array. Accept either rather than force-casting, so a
  // client upgrade that changes the shape cannot silently blank the dog name.
  dogs: DogFacts | DogFacts[] | null;
}

const BOOKING_SELECT =
  "id, slot, size, status, booking_date, ready_at, dog_name_snapshot, breed_snapshot, dogs(name, breed)";

function dogFacts(dogs: BookingRow["dogs"]): DogFacts | null {
  if (!dogs) return null;
  return Array.isArray(dogs) ? dogs[0] ?? null : dogs;
}

/** Narrow a booking row to the five fields a Slack message may carry.
 *  This is the privacy boundary: nothing else from the row travels on. */
function toSubject(row: BookingRow): BookingSubject {
  const dog = dogFacts(row.dogs);
  return {
    id: row.id,
    slot: row.slot,
    dogName: row.dog_name_snapshot ?? dog?.name ?? null,
    size: row.size ?? null,
    breed: row.breed_snapshot ?? dog?.breed ?? null,
  };
}

/**
 * The first bookable slot on a date: the canonical grid plus any extra slots
 * staff opened that day, sorted. Built from the TS mirror of active_slots_for()
 * rather than assuming "08:30", so an early staff-added slot is correctly
 * treated as the opening appointment.
 */
async function firstSlotOfDate(
  supabase: SupabaseClient,
  dateStr: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("day_settings")
    .select("extra_slots")
    .eq("setting_date", dateStr)
    .maybeSingle();
  const extras = (data?.extra_slots ?? []) as string[];
  return buildSlotGrid(extras)[0] ?? null;
}

/** Is the salon open on this date? day_settings wins; otherwise Mon-Wed.
 *  Mirrors coalesce(is_open, isodow in (1,2,3)) in validate_booking_calendar. */
async function isSalonOpen(
  supabase: SupabaseClient,
  dateStr: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("day_settings")
    .select("is_open")
    .eq("setting_date", dateStr)
    .maybeSingle();
  if (data && typeof data.is_open === "boolean") return data.is_open;
  const isoDay = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return isoDay >= 1 && isoDay <= 3;
}

// ── Mode: event (booking created / moved / cancelled) ───────────────────

interface EventPayload {
  event_type?: string;
  booking_id?: string | null;
  booking_date?: string | null;
  slot?: string | null;
  previous_booking_date?: string | null;
  previous_slot?: string | null;
  dog_name?: string | null;
  dog_breed?: string | null;
}

async function handleEvent(
  supabase: SupabaseClient,
  payload: EventPayload,
  now: Date,
): Promise<PostOutcome[]> {
  const today = londonWallClock(now).dateStr;
  const tomorrow = londonDatePlus(now, 1);
  const outcomes: PostOutcome[] = [];

  const bookingId = payload.booking_id ?? null;
  if (!bookingId) return outcomes;

  // Size lives on bookings, not on the event row, and the message wants it.
  let row: BookingRow | null = null;
  const { data } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("id", bookingId)
    .maybeSingle();
  row = (data as unknown as BookingRow | null) ?? null;

  const subject: BookingSubject = row ? toSubject(row) : {
    id: bookingId,
    slot: payload.slot ?? "",
    dogName: payload.dog_name ?? null,
    size: null,
    breed: payload.dog_breed ?? null,
  };

  const newDate = payload.booking_date ?? null;
  const prevDate = payload.previous_booking_date ?? null;
  const prevSlot = payload.previous_slot ?? null;

  // A date is alertable when it is today, or when it is tomorrow's opening
  // appointment. The latter is the one case the salon wants to hear about
  // out of hours — see the first-slot exception in slackAlertWindow.ts.
  const firstTomorrow = await firstSlotOfDate(supabase, tomorrow);
  const isOpeningTomorrow = (date: string | null, slot: string | null) =>
    date === tomorrow && !!slot && slot === firstTomorrow;

  if (payload.event_type === "cancelled") {
    if (newDate === today || isOpeningTomorrow(newDate, subject.slot)) {
      outcomes.push(
        await postToSlack(
          supabase,
          { type: "cancellation", booking: subject, bookingDate: newDate! },
          now,
          firstTomorrow,
        ),
      );
    }
    return outcomes;
  }

  if (payload.event_type === "created") {
    if (newDate === today) {
      outcomes.push(
        await postToSlack(
          supabase,
          { type: "new_booking", booking: subject, bookingDate: newDate },
          now,
          firstTomorrow,
        ),
      );
    }
    return outcomes;
  }

  if (payload.event_type === "rescheduled") {
    // Moved OFF a day that mattered. Only a genuine DATE change counts — a
    // same-day time change has not left today, and reporting it as "moved
    // off today" would be untrue.
    const leftSomewhereThatMatters = prevDate !== newDate &&
      (prevDate === today || isOpeningTomorrow(prevDate, prevSlot));
    if (leftSomewhereThatMatters && prevDate && prevSlot) {
      outcomes.push(
        await postToSlack(
          supabase,
          {
            type: "moved_off",
            booking: subject,
            previousDate: prevDate,
            previousSlot: prevSlot,
          },
          now,
          firstTomorrow,
        ),
      );
    }

    // Moved ONTO today — which includes a same-day time change, since the new
    // date is still today. The message wording distinguishes the two.
    if (newDate === today) {
      outcomes.push(
        await postToSlack(
          supabase,
          {
            type: "moved_in",
            booking: subject,
            bookingDate: newDate,
            sameDayMove: prevDate === today,
          },
          now,
          firstTomorrow,
        ),
      );
    }
  }

  return outcomes;
}

// ── Mode: sweep (the things that happen by NOT happening) ───────────────

async function flushQueue(
  supabase: SupabaseClient,
  now: Date,
): Promise<{ flushed: number; dropped: number }> {
  const { data } = await supabase
    .from("slack_alerts")
    .select("id, message, booking_date")
    .eq("state", "queued")
    .order("created_at", { ascending: true })
    .limit(50);

  let flushed = 0;
  let dropped = 0;
  for (const queued of (data ?? []) as
    { id: string; message: string | null; booking_date: string | null }[]) {
    // An alert about a date that has already passed is history, not
    // "something that changes today". Flushing it would post yesterday.
    if (isQueuedAlertStale(queued.booking_date, now)) {
      await supabase.from("slack_alerts").update({ state: "dropped" }).eq("id", queued.id);
      dropped++;
      continue;
    }
    if (!queued.message) continue;
    if (await sendToSlack(queued.message)) {
      await supabase
        .from("slack_alerts")
        .update({ state: "posted", posted_at: new Date().toISOString() })
        .eq("id", queued.id);
      flushed++;
    }
  }
  return { flushed, dropped };
}

async function handleSweep(
  supabase: SupabaseClient,
  now: Date,
): Promise<Record<string, unknown>> {
  // The cron deliberately over-covers its hours so one schedule works in both
  // BST and GMT; this is where the precise London judgement happens.
  if (!isWithinPostingWindow(now)) {
    return { skipped: true, reason: "outside the posting window" };
  }

  const today = londonWallClock(now).dateStr;
  const queue = await flushQueue(supabase, now);
  const outcomes: PostOutcome[] = [];

  // 1. No-show: still "Booked" more than 15 minutes after the slot started.
  //    The slot is a London wall-clock string, so the comparison has to go
  //    through visitStartInstant rather than naive date arithmetic.
  const { data: booked } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("booking_date", today)
    .eq("status", BOOKING_STATUS_BOOKED);

  for (const row of (booked ?? []) as unknown as BookingRow[]) {
    const startedMs = visitStartInstant(today, row.slot).getTime();
    const lateByMin = (now.getTime() - startedMs) / 60000;
    if (lateByMin >= NO_SHOW_AFTER_MINUTES) {
      outcomes.push(
        await postToSlack(
          supabase,
          { type: "no_show", booking: toSubject(row), bookingDate: today },
          now,
        ),
      );
    }
  }

  // 2. Ready for too long. ready_at is stamped by a DB trigger on the
  //    transition into Ready (migration 20260702180000), so this needs no
  //    extra instrumentation.
  const readyCutoff = new Date(now.getTime() - READY_OVERDUE_MINUTES * 60000);
  const { data: waiting } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .eq("booking_date", today)
    .eq("status", BOOKING_STATUS_READY)
    .lt("ready_at", readyCutoff.toISOString());

  for (const row of (waiting ?? []) as unknown as BookingRow[]) {
    const minutesWaiting = row.ready_at
      ? Math.floor((now.getTime() - Date.parse(row.ready_at)) / 60000)
      : READY_OVERDUE_MINUTES;
    outcomes.push(
      await postToSlack(
        supabase,
        {
          type: "ready_overdue",
          booking: toSubject(row),
          bookingDate: today,
          minutesWaiting,
        },
        now,
      ),
    );
  }

  // 3. Inbound customer message nobody has answered.
  //
  //    An AI auto-reply DOES count as answered. That sounds wrong until you
  //    look at the gating: booking-touching intents never auto-send (see
  //    docs/whatsapp-agent.md), so anything the AI actually replied to was a
  //    low-risk question the customer has an answer to. When the AI holds a
  //    draft instead, last_outbound_at never advances and this fires
  //    correctly. The existing risk gate does the hard part.
  const unansweredCutoff = new Date(now.getTime() - UNANSWERED_AFTER_MINUTES * 60000);
  const { data: convos } = await supabase
    .from("whatsapp_conversations")
    .select("id, last_inbound_at, last_outbound_at, state, snoozed_until, closed_at")
    .lt("last_inbound_at", unansweredCutoff.toISOString())
    .is("closed_at", null);

  for (const c of (convos ?? []) as {
    id: string;
    last_inbound_at: string | null;
    last_outbound_at: string | null;
    state: string | null;
    snoozed_until: string | null;
  }[]) {
    if (!c.last_inbound_at) continue;
    // Staff deliberately parked these. Nagging about them teaches people to
    // ignore the channel.
    if (c.state === "snoozed" || c.state === "closed") continue;
    if (c.snoozed_until && Date.parse(c.snoozed_until) > now.getTime()) continue;
    // PostgREST cannot compare two columns, so the "has anyone replied since"
    // test happens here.
    const inbound = Date.parse(c.last_inbound_at);
    const outbound = c.last_outbound_at ? Date.parse(c.last_outbound_at) : 0;
    if (outbound >= inbound) continue;

    outcomes.push(
      await postToSlack(
        supabase,
        {
          type: "unanswered",
          conversationId: c.id,
          minutesWaiting: Math.floor((now.getTime() - inbound) / 60000),
          lastInboundAt: c.last_inbound_at,
        },
        now,
      ),
    );
  }

  return { queue, alerts: outcomes };
}

// ── Mode: summary (08:15 London) ───────────────────────────────────────

async function handleSummary(
  supabase: SupabaseClient,
  atHourUk: number | null,
  now: Date,
): Promise<Record<string, unknown>> {
  const wall = londonWallClock(now);
  // Two UTC cron jobs an hour apart both fire this; whichever one lands on
  // 08:xx London does the work and the other no-ops. That is how the salon's
  // existing reminder jobs handle BST/GMT, and it beats DST arithmetic.
  const wanted = atHourUk ?? MORNING_SUMMARY_HOUR_UK;
  if (wall.hour !== wanted) {
    return { skipped: true, reason: `London hour is ${wall.hour}, not ${wanted}` };
  }

  const today = wall.dateStr;
  const open = await isSalonOpen(supabase, today);

  const { data } = await supabase
    .from("bookings")
    .select("slot, status")
    .eq("booking_date", today)
    .neq("status", BOOKING_STATUS_CANCELLED);

  const slots = ((data ?? []) as { slot: string }[])
    .map((b) => b.slot)
    .sort();

  const outcome = await postToSlack(
    supabase,
    {
      type: "summary",
      date: today,
      isOpen: open,
      bookings: slots.length,
      cap: open ? DAILY_DOG_CAP : 0,
      firstSlot: slots[0] ?? null,
      lastSlot: slots.length ? slots[slots.length - 1] : null,
    },
    now,
  );

  return { summary: outcome };
}

// ── Entry point ────────────────────────────────────────────────────────

serve(async (req) => {
  try {
    // 0. Kill switch. One env var turns the whole feature off, with no
    //    deploy, no migration and no revert — the triggers and crons keep
    //    firing into a function that does nothing, which is what makes
    //    turning it back on equally cheap.
    if (!SLACK_ALERTS_ENABLED) {
      return json({ skipped: true, reason: "SLACK_ALERTS_ENABLED is off" }, 200);
    }

    // 1. Auth. Callers are pg_net triggers and pg_cron, both sending the
    //    webhook Bearer secret. Nothing here is reachable from a browser.
    if (
      !WEBHOOK_SECRET ||
      !isAuthorizedWebhook(req.headers.get("Authorization"), WEBHOOK_SECRET)
    ) {
      return json({ error: "unauthorized" }, 401);
    }

    const payload = (await req.json().catch(() => null)) ?? {};
    const mode = typeof payload.mode === "string" ? payload.mode : null;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const now = new Date();

    switch (mode) {
      case "event":
        return json({ ok: true, alerts: await handleEvent(supabase, payload, now) });
      case "sweep":
        return json({ ok: true, ...(await handleSweep(supabase, now)) });
      case "summary":
        return json({
          ok: true,
          ...(await handleSummary(
            supabase,
            typeof payload.at_hour_uk === "number" ? payload.at_hour_uk : null,
            now,
          )),
        });
      default:
        return json({ error: "unknown mode", mode }, 400);
    }
  } catch (e) {
    // Never surface a failure to pg_net or pg_cron: a non-2xx would trigger
    // retries and log noise for something Slack-shaped.
    console.error(`slack-alerts: ${e instanceof Error ? e.message : e}`);
    return json({ ok: false, error: "internal error" }, 200);
  }
});
