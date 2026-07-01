// ============================================================
// supabase/functions/whatsapp-flow-endpoint/index.ts
//
// The WhatsApp Flows Data Endpoint. Meta POSTs an ENCRYPTED request for
// every screen transition of an endpoint-driven Flow; we decrypt it,
// run the screen state machine, and return the ENCRYPTED next screen.
//
// Pipeline per request:
//   1. (optional) verify X-Hub-Signature-256 with META_APP_SECRET
//   2. RSA-OAEP + AES-GCM decrypt (FLOW_PRIVATE_KEY / FLOW_PASSPHRASE)
//   3. route by action: ping | INIT | BACK | data_exchange
//   4. drive the Flow A (appointment booking) screens off the
//      whatsapp_flow_sessions row keyed by flow_token
//   5. AES-GCM encrypt the response (flipped IV), return text/plain 200
//
// Booking is written at the CONFIRM data_exchange (not at flow
// completion) via the bookings table; the capacity trigger is the hard
// guard and a rejection becomes a "slot taken" retry.
//
// Deploy WITHOUT JWT verification — Meta sends no JWT; the encryption +
// signature are the auth:
//   supabase functions deploy whatsapp-flow-endpoint --no-verify-jwt
//
// Env vars required:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (auto)
//   FLOW_PRIVATE_KEY   — RSA private key PEM (literal \n are normalised)
//   FLOW_PASSPHRASE    — passphrase for the private key
//   META_APP_SECRET    — for X-Hub-Signature-256 (shared with the webhook)
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  decryptFlowRequest,
  type DecryptedFlowRequest,
  type DecryptResult,
  type EncryptedFlowRequest,
  encryptFlowResponse,
  FlowDecryptError,
  verifyFlowSignature,
} from "../_shared/flowCrypto.ts";
import {
  addonOptions,
  availableGroupDateOptions,
  bookingGroupSummary,
  bookingRef,
  confirmGroupBooking,
  type FlowDb,
  formatDateLong,
  groupSlotOptions,
  listPetOptions,
  serviceName,
  serviceOptions,
} from "../_shared/flowBooking.ts";
import { type DogSize, slotLabel } from "../_shared/salonConstants.ts";
import { isInsideManageCutoff, visitStartInstant } from "../_shared/manageBooking.ts";
import {
  cancelOldBookingForReschedule,
  completeSession,
  createServiceClient,
  failSession,
  type FlowDogMeta,
  type FlowSessionRow,
  type FlowState,
  getActiveOwnedBookings,
  loadSession,
  makeFlowDb,
  saveSession,
} from "./db.ts";

// Reschedule fail-safe copy (the old booking is left untouched in these cases).
const RESCHEDULE_CHANGED_MSG =
  "Looks like this booking has changed since you started — please send us a message and the team will help. 🐾";
const RESCHEDULE_CUTOFF_MSG =
  "This appointment is now within 24 hours, so I can't move it automatically here. Please message us and the team will sort it. 🐾";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const DATA_API_VERSION = "3.0";

function readPrivateKey(): string {
  const b64 = Deno.env.get("FLOW_PRIVATE_KEY_B64");
  if (b64) {
    try {
      return new TextDecoder().decode(
        Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
      );
    } catch {
      // fall through to FLOW_PRIVATE_KEY
    }
  }
  return (Deno.env.get("FLOW_PRIVATE_KEY") ?? "").replace(/\\n/g, "\n");
}

const FLOW_PRIVATE_KEY = readPrivateKey();
const FLOW_PASSPHRASE = Deno.env.get("FLOW_PASSPHRASE") ?? "";
const META_APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";

const NO_PETS_MSG =
  'We couldn\'t find a dog on your file yet. Reply "new" and we\'ll get you registered, then you can book.';
const FINE_PRINT =
  "Prices start from the amount shown and may vary by coat condition. Final price is confirmed at the salon.";

function screenResponse(screen: string, data: Record<string, unknown>): unknown {
  return { version: DATA_API_VERSION, screen, data };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

function dogsFromState(state: FlowState): Array<{ id: string; size: DogSize }> {
  const meta = state.dog_meta ?? {};
  return (state.dog_ids ?? [])
    .filter((id) => meta[id])
    .map((id) => ({ id, size: meta[id].size }));
}

function successResponse(
  bookingIds: string[],
  state: FlowState,
  opts: { rescheduled?: boolean } = {},
): unknown {
  const ref = bookingIds.length ? bookingRef(bookingIds[0]) : "SD-PENDING";
  const meta = state.dog_meta ?? {};
  const services = state.services ?? {};
  const lines: string[] = [];
  if (state.date) {
    const when = `${formatDateLong(state.date)}${state.drop_off ? ` at ${slotLabel(state.drop_off)}` : ""}`;
    lines.push(opts.rescheduled ? `Moved to ${when}` : when);
  }
  for (const id of state.dog_ids ?? []) {
    lines.push(`${meta[id]?.name ?? "Your dog"} — ${serviceName(services[id] ?? "")}`);
  }
  // ref_line is a whole-value binding (embedded ${data.booking_ref} won't
  // resolve); booking_ref is still passed for the completion-action payload.
  return screenResponse("SUCCESS", {
    booking_ref: ref,
    ref_line: `Your reference: ${ref}`,
    summary: lines.join("\n"),
  });
}

async function renderWelcome(session: FlowSessionRow, supabase: SupabaseClient): Promise<unknown> {
  let name = "";
  if (session.human_id) {
    const { data } = await supabase.from("humans").select("name").eq("id", session.human_id).maybeSingle();
    name = (data as { name?: string } | null)?.name ?? "";
  }
  return screenResponse("WELCOME", {
    greeting: name ? `Hi ${name}! 🐾` : "Hi there! 🐾",
    intro: "Let's get your pup booked in for a fresh new groom.",
  });
}

/** Build any screen's data purely from session state (used by INIT/BACK and after each advance). */
async function buildScreen(
  target: string,
  session: FlowSessionRow,
  db: FlowDb,
  supabase: SupabaseClient,
): Promise<unknown> {
  const state = session.state;

  // Per-dog screens DOG_A..DOG_D: service + add-ons for the dog at that
  // position. Forward-only routing (Meta rejects loop-back edges), and screen
  // ids must be letters/underscores only (no digits) — so the position is the
  // letter A..D. Derived from the screen id, so it's correct on INIT/BACK too.
  if (target.startsWith("DOG_")) {
    const idx = target.charCodeAt(4) - 65; // 'A' -> 0
    const dogId = (state.dog_ids ?? [])[idx];
    const meta = dogId ? state.dog_meta?.[dogId] : undefined;
    if (!meta) return screenResponse("BOOKING_FAILED", { message: "Please start again." });
    const pricing = await db.getPricing();
    // Whole-value heading (Meta doesn't resolve embedded ${data.x} inside a
    // longer string — only a full-value binding).
    return screenResponse(target, {
      heading: `What's ${meta.name} in for? 🐾`,
      services: serviceOptions(meta.size, pricing),
      addons: addonOptions(),
    });
  }

  switch (target) {
    case "WELCOME":
      return renderWelcome(session, supabase);

    case "SELECT_PET": {
      const pets = session.human_id ? await listPetOptions(db, session.human_id) : [];
      if (!pets.length) return screenResponse("NO_PETS", { message: NO_PETS_MSG });
      return screenResponse("SELECT_PET", { pets });
    }

    case "SELECT_DATE": {
      const dates = await availableGroupDateOptions(db, dogsFromState(state), new Date());
      if (!dates.length) {
        return screenResponse("BOOKING_FAILED", {
          message: "We've no availability in the next 60 days. Please message us and we'll help.",
        });
      }
      return screenResponse("SELECT_DATE", { dates });
    }

    case "SELECT_TIME": {
      const slots = await groupSlotOptions(db, dogsFromState(state), state.date ?? "");
      if (!slots.length) {
        return screenResponse("BOOKING_FAILED", {
          message: 'That day just filled up. Reply "book" to choose another day.',
        });
      }
      return screenResponse("SELECT_TIME", {
        date_label: state.date ? formatDateLong(state.date) : "",
        time_heading: state.date ? `Lovely — what time works on ${formatDateLong(state.date)}? 🐾` : "Pick a time",
        time_slots: slots,
        show_error: false,
        error_message: "",
      });
    }

    case "SELECT_TIME_RETRY": {
      const slots = await groupSlotOptions(db, dogsFromState(state), state.date ?? "");
      if (!slots.length) {
        return screenResponse("BOOKING_FAILED", {
          message: 'That day just filled up. Reply "book" to choose another day.',
        });
      }
      return screenResponse("SELECT_TIME_RETRY", {
        date_label: state.date ? formatDateLong(state.date) : "",
        time_heading: state.date ? `No worries — pick another time on ${formatDateLong(state.date)}` : "Pick another time",
        time_slots: slots,
        error_message: "That slot just got taken — please pick another.",
      });
    }

    case "CONFIRM": {
      const pricing = await db.getPricing();
      const meta = state.dog_meta ?? {};
      const services = state.services ?? {};
      const addons = state.addons ?? {};
      const dogs = (state.dog_ids ?? [])
        .filter((id) => meta[id])
        .map((id) => ({
          dogName: meta[id].name,
          serviceId: services[id] ?? "",
          size: meta[id].size,
          addons: addons[id] ?? [],
        }));
      return screenResponse("CONFIRM", {
        summary: bookingGroupSummary({ dogs, pricing, dateStr: state.date ?? "", dropOff: state.drop_off ?? "" }),
        fine_print: FINE_PRINT,
      });
    }

    case "NO_PETS":
      return screenResponse("NO_PETS", { message: NO_PETS_MSG });

    default:
      return screenResponse("BOOKING_FAILED", { message: "Please start again." });
  }
}

/**
 * Re-validate a reschedule's OLD visit at CONFIRM, against the frozen
 * snapshot. Returns ok, or a customer-safe fail-safe message. Runs BEFORE the
 * new booking is created so a changed/late old visit never spawns a new one.
 */
async function validateRescheduleOld(
  supabase: SupabaseClient,
  humanId: string,
  state: FlowState,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const sel = state.reschedule_group_id
    ? { groupId: state.reschedule_group_id }
    : { bookingId: state.reschedule_booking_id };
  const oldRows = await getActiveOwnedBookings(supabase, humanId, sel);
  if (!oldRows.length) return { ok: false, message: RESCHEDULE_CHANGED_MSG };

  // Same dogs as the snapshot?
  const dogSet = [...new Set(oldRows.map((r) => r.dog_id))].sort();
  const snapDogs = [...(state.dog_snapshot ?? [])].sort();
  if (dogSet.length !== snapDogs.length || dogSet.some((d, i) => d !== snapDogs[i])) {
    return { ok: false, message: RESCHEDULE_CHANGED_MSG };
  }
  // Same service per dog as the snapshot (the live OLD booking)?
  const svcSnap = state.service_snapshot ?? {};
  for (const r of oldRows) {
    if ((svcSnap[r.dog_id] ?? null) !== (r.service ?? null)) {
      return { ok: false, message: RESCHEDULE_CHANGED_MSG };
    }
  }
  // Defence-in-depth: the NEW booking's services (carried in the flow state)
  // must still equal the snapshot — a reschedule never changes the service.
  const curSvc = state.services ?? {};
  for (const k of new Set([...Object.keys(svcSnap), ...Object.keys(curSvc)])) {
    if (svcSnap[k] !== curSvc[k]) return { ok: false, message: RESCHEDULE_CHANGED_MSG };
  }
  // Did staff MOVE the old visit (date/slot) while the customer was choosing?
  // The frozen snapshot must still match the live earliest drop-off.
  if (state.old_date && state.old_slot) {
    const liveEarliest = oldRows.map((r) => `${r.booking_date}T${r.slot}`).sort()[0];
    if (liveEarliest !== `${state.old_date}T${state.old_slot}`) {
      return { ok: false, message: RESCHEDULE_CHANGED_MSG };
    }
  }
  // Still outside the 24h cut-off (use the earliest old slot, salon-local)?
  const earliest = oldRows
    .map((r) => visitStartInstant(r.booking_date, r.slot))
    .sort((a, b) => a.getTime() - b.getTime())[0];
  if (isInsideManageCutoff(earliest, new Date())) {
    return { ok: false, message: RESCHEDULE_CUTOFF_MSG };
  }
  return { ok: true };
}

async function handleConfirm(
  session: FlowSessionRow,
  state: FlowState,
  db: FlowDb,
  supabase: SupabaseClient,
  opts: { allowRetry?: boolean } = {},
): Promise<unknown> {
  const allowRetry = opts.allowRetry ?? true;
  const isReschedule = state.flow_mode === "reschedule";

  // Idempotency: a duplicate confirm returns the existing booking group.
  if (session.booking_id) return successResponse([session.booking_id], state, { rescheduled: isReschedule });

  const dogIds = state.dog_ids ?? [];
  const services = state.services ?? {};
  const addons = state.addons ?? {};
  if (
    !session.human_id || !dogIds.length || dogIds.length > 4 ||
    !state.date || !state.drop_off || !dogIds.every((id) => services[id])
  ) {
    return screenResponse("BOOKING_FAILED", { message: "Some details were missing. Please start again." });
  }

  // Reschedule: re-validate the OLD visit BEFORE creating the new one, so a
  // stale/changed/late old visit never produces a new booking.
  if (isReschedule) {
    // Guard: a reschedule session must carry its old-visit snapshot. If the
    // pre-seed was incomplete, fail safe rather than booking a duplicate.
    if (
      !(state.dog_snapshot?.length) ||
      !(state.reschedule_group_id || state.reschedule_booking_id) ||
      !state.service_snapshot
    ) {
      await failSession(supabase, session.flow_token);
      return screenResponse("BOOKING_FAILED", { message: RESCHEDULE_CHANGED_MSG });
    }
    const v = await validateRescheduleOld(supabase, session.human_id, state);
    if (!v.ok) {
      await failSession(supabase, session.flow_token);
      return screenResponse("BOOKING_FAILED", { message: v.message });
    }
  }

  const res = await confirmGroupBooking(db, {
    humanId: session.human_id,
    dateStr: state.date,
    dropOff: state.drop_off,
    dogs: dogIds.map((id) => ({ dogId: id, serviceId: services[id], addons: addons[id] ?? [] })),
  });

  if (res.ok) {
    // Reschedule: new booking created — NOW cancel the old visit (new-first,
    // cancel-old-second so a failure never loses the original). A partial
    // cancel leaves a duplicate, logged loudly for staff (visible in the
    // calendar); the customer still sees their confirmed new booking.
    if (isReschedule) {
      const sel = state.reschedule_group_id
        ? { groupId: state.reschedule_group_id }
        : { bookingId: state.reschedule_booking_id };
      const cancelled = await cancelOldBookingForReschedule(supabase, session.human_id, sel);
      const expected = (state.old_booking_ids ?? []).length || 1;
      if (cancelled.cancelledCount < expected) {
        console.error(
          `[reschedule] DUPLICATE-RISK: new booking ${res.bookingIds.join(",")} created but only ` +
            `${cancelled.cancelledCount}/${expected} old rows cancelled ` +
            `(group=${state.reschedule_group_id ?? "-"} booking=${state.reschedule_booking_id ?? "-"} ` +
            `human=${session.human_id}). Staff must remove the old booking.`,
        );
      }
    }
    // Store the first booking id as the idempotency marker for re-confirms.
    await completeSession(supabase, session.flow_token, res.bookingIds[0]);
    return successResponse(res.bookingIds, state, { rescheduled: isReschedule });
  }

  if (res.kind === "slot_taken" && allowRetry) {
    const slots = await groupSlotOptions(db, dogsFromState(state), state.date);
    await saveSession(supabase, session.flow_token, { screen: "SELECT_TIME_RETRY", state });
    return screenResponse("SELECT_TIME_RETRY", {
      date_label: formatDateLong(state.date),
      time_heading: `No worries — pick another time on ${formatDateLong(state.date)}`,
      time_slots: slots.length ? slots : [{ id: state.drop_off, title: slotLabel(state.drop_off) }],
      error_message: res.message,
    });
  }

  await failSession(supabase, session.flow_token);
  return screenResponse("BOOKING_FAILED", { message: res.message });
}

async function handleDataExchange(
  req: DecryptedFlowRequest,
  session: FlowSessionRow,
  db: FlowDb,
  supabase: SupabaseClient,
): Promise<unknown> {
  const token = session.flow_token;
  const state: FlowState = { ...session.state };
  const data = req.data ?? {};
  const current = req.screen ?? session.screen ?? "WELCOME";

  if (current === "CONFIRM") {
    return handleConfirm(session, state, db, supabase);
  }

  if (current === "SELECT_TIME_RETRY") {
    state.drop_off = str(data.slot);
    await saveSession(supabase, token, { screen: "SELECT_TIME_RETRY", state });
    return handleConfirm({ ...session, state }, state, db, supabase, { allowRetry: false });
  }

  // Per-dog screen submit: store this dog's service + add-ons, then advance to
  // the next selected dog (DOG_A→DOG_B…) or on to SELECT_DATE.
  if (current.startsWith("DOG_")) {
    const idx = current.charCodeAt(4) - 65; // 'A' -> 0
    const dogId = (state.dog_ids ?? [])[idx];
    if (dogId) {
      state.services = { ...(state.services ?? {}), [dogId]: str(data.service) };
      state.addons = { ...(state.addons ?? {}), [dogId]: strArr(data.addons) };
    }
    const next = idx + 1;
    const nextScreen = next < (state.dog_ids ?? []).length
      ? `DOG_${String.fromCharCode(65 + next)}`
      : "SELECT_DATE";
    await saveSession(supabase, token, { screen: nextScreen, state });
    return buildScreen(nextScreen, { ...session, state }, db, supabase);
  }

  let target: string;
  switch (current) {
    case "WELCOME": {
      // Reschedule: dogs + services are pre-seeded — skip pet + per-dog
      // screens and go straight to picking a new day/time.
      if (state.flow_mode === "reschedule" && (state.dog_ids?.length ?? 0) > 0) {
        target = "SELECT_DATE";
        break;
      }
      const pets = session.human_id ? await listPetOptions(db, session.human_id) : [];
      target = pets.length ? "SELECT_PET" : "NO_PETS";
      break;
    }
    case "SELECT_PET": {
      // Multi-select: validate ownership + pin name/size for each chosen dog.
      const ids = strArr(data.dog_ids);
      const meta: Record<string, FlowDogMeta> = {};
      const ordered: string[] = [];
      for (const id of ids) {
        const dog = await db.getDogById(id);
        if (dog && dog.human_id === session.human_id) {
          meta[id] = { name: dog.name, size: dog.size };
          ordered.push(id);
        }
      }
      if (!ordered.length || ordered.length > 4) {
        // Re-ask rather than trust a stray/empty/oversized selection.
        await saveSession(supabase, token, { screen: "SELECT_PET", state });
        return buildScreen("SELECT_PET", { ...session, state }, db, supabase);
      }
      state.dog_ids = ordered;
      state.dog_meta = meta;
      state.services = {};
      state.addons = {};
      target = "DOG_A";
      break;
    }
    case "SELECT_DATE":
      state.date = str(data.date);
      target = "SELECT_TIME";
      break;
    case "SELECT_TIME":
      state.drop_off = str(data.slot);
      target = "CONFIRM";
      break;
    default:
      target = "WELCOME";
  }

  await saveSession(supabase, token, { screen: target, state });
  return buildScreen(target, { ...session, state }, db, supabase);
}

async function handleFlow(req: DecryptedFlowRequest): Promise<unknown> {
  // Health check — Meta pings the endpoint periodically.
  if (req.action === "ping") {
    return { version: DATA_API_VERSION, data: { status: "active" } };
  }

  // Client-reported error notification — acknowledge per Meta's spec.
  if (req.data && typeof (req.data as Record<string, unknown>).error_message === "string") {
    return { version: DATA_API_VERSION, data: { acknowledged: true } };
  }

  const token = req.flow_token;
  if (!token) {
    return screenResponse("BOOKING_FAILED", { message: "Session expired. Please start again." });
  }

  const supabase = createServiceClient();
  const session = await loadSession(supabase, token);
  if (!session || session.status !== "active" || new Date(session.expires_at) < new Date()) {
    return screenResponse("BOOKING_FAILED", {
      message: 'This booking session has expired. Reply "book" to start again.',
    });
  }

  const db = makeFlowDb(supabase);

  if (req.action === "INIT") {
    // Always render WELCOME on INIT (proven booking behaviour). Reschedule
    // opens on WELCOME too and routes WELCOME→SELECT_DATE on Continue, so it
    // doesn't need INIT to land elsewhere.
    return renderWelcome(session, supabase);
  }
  if (req.action === "BACK") {
    return buildScreen(req.screen ?? session.screen ?? "WELCOME", session, db, supabase);
  }
  return handleDataExchange(req, session, db, supabase);
}

serve(async (req) => {
  if (req.method === "GET") {
    // Health check only — never expose key material or config.
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  const rawBody = new Uint8Array(await req.arrayBuffer());

  // Verify the signature (defence-in-depth on top of the encryption).
  // Meta always sends X-Hub-Signature-256, so when the app secret is
  // configured a missing header is rejected too — otherwise omitting the
  // header would skip the HMAC check entirely (AUDIT-4). Only when the
  // secret is unset do the RSA envelope + flow_token session lookup
  // remain the sole auth.
  const sigHeader = req.headers.get("x-hub-signature-256");
  if (META_APP_SECRET && !sigHeader) {
    console.warn("whatsapp-flow-endpoint: missing X-Hub-Signature-256");
    return new Response("missing signature", { status: 401 });
  }
  if (sigHeader && META_APP_SECRET && !verifyFlowSignature(rawBody, sigHeader, META_APP_SECRET)) {
    console.warn("whatsapp-flow-endpoint: invalid X-Hub-Signature-256");
    return new Response("invalid signature", { status: 401 });
  }

  let envelope: EncryptedFlowRequest;
  try {
    envelope = JSON.parse(new TextDecoder().decode(rawBody)) as EncryptedFlowRequest;
  } catch {
    return new Response("bad request", { status: 400 });
  }

  let decryptResult: DecryptResult;
  try {
    decryptResult = await decryptFlowRequest(envelope, FLOW_PRIVATE_KEY, FLOW_PASSPHRASE);
  } catch (err) {
    // 421 tells WhatsApp to refresh our public key and retry.
    const detail = err instanceof FlowDecryptError ? err.message : String(err);
    const cause = err instanceof FlowDecryptError && err.cause ? String((err.cause as Error)?.message ?? err.cause) : null;
    const sizes = {
      encrypted_aes_key_b64: envelope.encrypted_aes_key?.length ?? 0,
      encrypted_aes_key_bytes: envelope.encrypted_aes_key
        ? Math.floor((envelope.encrypted_aes_key.length * 3) / 4)
        : 0,
      initial_vector_b64: envelope.initial_vector?.length ?? 0,
      encrypted_flow_data_b64: envelope.encrypted_flow_data?.length ?? 0,
    };
    console.error("whatsapp-flow-endpoint: decryption failed", detail, cause, sizes);
    // 421 tells WhatsApp to refresh our public key and retry. Body is kept
    // generic — the full detail/cause/sizes stay in the server log above.
    return new Response("decryption failed", { status: 421 });
  }

  const { aesKey, initialVector } = decryptResult;
  try {
    const responseObj = await handleFlow(decryptResult.decrypted);
    const encrypted = encryptFlowResponse(responseObj, aesKey, initialVector);
    return new Response(encrypted, { status: 200, headers: { "Content-Type": "text/plain" } });
  } catch (err) {
    console.error("whatsapp-flow-endpoint: handler error", err);
    const fallback = screenResponse("BOOKING_FAILED", {
      message: "Sorry, something went wrong. Please message us and we'll help.",
    });
    const encrypted = encryptFlowResponse(fallback, aesKey, initialVector);
    return new Response(encrypted, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
});
