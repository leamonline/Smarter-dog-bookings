// ============================================================
// supabase/functions/_shared/confirmButtons.ts
//
// Orchestration for the whatsapp-send "confirm_buttons" mode,
// extracted from whatsapp-send/index.ts so it can be tested
// in isolation under vitest (mirroring the agentRisk pattern).
//
// The booking-action state machine is the truth surface here:
// the helper is responsible for moving the row from 'pending'
// to 'awaiting_customer_confirm' atomically, sending the
// interactive buttons via Meta, and surfacing race conditions
// to the caller as warnings.
//
// Imported by:
//   - supabase/functions/whatsapp-send/index.ts  (Deno runtime)
//   - src/lib/ai/confirmButtons.test.ts          (Vitest / Node)
//
// Constraints (same as agentRisk):
//   - Pure TypeScript, no runtime imports — works in both Deno
//     and Node.
//   - All side effects come through injected dependencies
//     (supabase, callMeta, recordOutbound, now).
// ============================================================

// ── Public types ───────────────────────────────────────────────

export interface ConfirmButtonsBody {
  conversation_id: string;
  booking_action_id: string;
  summary_text: string;
  action_kind: "book" | "reschedule" | "cancel";
}

export interface ConfirmButtonsMetaResult {
  messages?: Array<{ id?: string }>;
}

export interface ConfirmButtonsDeps {
  supabase: SupabaseLike;
  callMeta: (body: unknown) => Promise<ConfirmButtonsMetaResult>;
  recordOutbound: (
    conversationId: string,
    metaMessageId: string | null,
    content: string,
    raw: unknown,
  ) => Promise<void>;
  now: () => Date;
}

export type ConfirmButtonsResult =
  | {
      ok: true;
      status: 200;
      meta_message_id: string | null;
      warning?: "state_update_failed" | "state_transition_skipped";
    }
  | {
      ok: false;
      status: number;
      reason: string;
    };

// ── Minimal structural type for the supabase methods we use ───
// The real @supabase/supabase-js client satisfies this structurally;
// tests can supply a thin fake without pulling in the full SDK.

export interface SupabaseLike {
  from(table: string): SupabaseTable;
}

export interface SupabaseTable {
  select(cols?: string): SupabaseSelectQuery;
  update(values: Record<string, unknown>): SupabaseUpdateQuery;
}

export interface SupabaseSelectQuery {
  eq(col: string, val: unknown): SupabaseSelectQuery;
  single(): Promise<{ data: Record<string, unknown> | null; error: SupabaseError | null }>;
}

export interface SupabaseUpdateQuery {
  eq(col: string, val: unknown): SupabaseUpdateQuery;
  select(cols?: string): Promise<{ data: Array<Record<string, unknown>> | null; error: SupabaseError | null }>;
}

export interface SupabaseError {
  message?: string;
}

// ── Constants ──────────────────────────────────────────────────

export const CONFIRM_BUTTON_TTL_MS = 24 * 60 * 60 * 1000;
export const META_BODY_TEXT_MAX = 1024;
export const META_BUTTON_TITLE_MAX = 20;

// ── Pure helpers ───────────────────────────────────────────────

export function yesLabelFor(actionKind: ConfirmButtonsBody["action_kind"]): string {
  if (actionKind === "book") return "Yes, book it";
  if (actionKind === "reschedule") return "Yes, move it";
  return "Yes, cancel";
}

export function toMetaTo(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function buildConfirmButtonsMetaBody(args: {
  toDigits: string;
  summaryText: string;
  bookingActionId: string;
  actionKind: ConfirmButtonsBody["action_kind"];
}): unknown {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: args.toDigits,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: args.summaryText.slice(0, META_BODY_TEXT_MAX) },
      action: {
        buttons: [
          {
            type: "reply",
            reply: {
              id: `${args.bookingActionId}:yes`,
              title: yesLabelFor(args.actionKind).slice(0, META_BUTTON_TITLE_MAX),
            },
          },
          {
            type: "reply",
            reply: {
              id: `${args.bookingActionId}:no`,
              title: "No, change".slice(0, META_BUTTON_TITLE_MAX),
            },
          },
        ],
      },
    },
  };
}

export function validateConfirmButtonsBody(
  body: ConfirmButtonsBody,
): { ok: true } | { ok: false; status: 400; reason: string } {
  if (!body.conversation_id) {
    return { ok: false, status: 400, reason: "conversation_id is required" };
  }
  if (!body.booking_action_id) {
    return { ok: false, status: 400, reason: "booking_action_id is required" };
  }
  if (!body.summary_text) {
    return { ok: false, status: 400, reason: "summary_text is required" };
  }
  if (!body.action_kind || !["book", "reschedule", "cancel"].includes(body.action_kind)) {
    return {
      ok: false,
      status: 400,
      reason: "action_kind must be 'book', 'reschedule', or 'cancel'",
    };
  }
  return { ok: true };
}

// ── Main orchestrator ──────────────────────────────────────────
//
// Claim-first ordering, mirroring handleDraftMode in
// supabase/functions/whatsapp-send/index.ts:
//
//   1. Validate body shape.
//   2. Cheap-path SELECT pre-checks (404 / 422 / 409). These fire
//      before any DB write and surface clear errors for sequential
//      retries; they do NOT prevent concurrent retries reaching
//      Meta — the claim in step 4 is what does that.
//   3. SELECT conversation by id (404 / 422 no-phone).
//   4. Atomically claim the row by transitioning state
//      'pending' → 'awaiting_customer_confirm' (with a tentative
//      expires_at and null message_id). This is the lock — a
//      concurrent caller's UPDATE will match 0 rows here and bail
//      with 409 before ever calling Meta. No two callers can ever
//      both reach step 5 for the same booking_action_id.
//   5. callMeta → on failure, roll the row back to 'pending' and
//      clear the confirm columns so a retry (or staff via the
//      inbox) can take over.
//   6. recordOutbound — observational. If it throws, surface a
//      warning but return ok:true; the customer already has the
//      message and the row is in the correct state.
//   7. Tag the row with the real meta message_id. We own the row
//      now, so no optimistic lock is needed.
//
// State the row can be in if the function dies between (4) and a
// successful (5)/(7): 'awaiting_customer_confirm' with null
// message_id and a fresh expires_at. The TTL sweeper in
// apply-customer-confirm/index.ts will eventually flip it to
// 'rejected_by_customer (expired)' — safe degrade, no customer
// ever saw a button so no double-message risk.

export async function runConfirmButtons(
  deps: ConfirmButtonsDeps,
  body: ConfirmButtonsBody,
): Promise<ConfirmButtonsResult> {
  const v = validateConfirmButtonsBody(body);
  if (!v.ok) return v;

  // (2) Fast-path pre-checks — surface 404 / 422 / 409 to sequential
  //     retries before doing any work. These do NOT defend against
  //     concurrent retries; the claim in step 4 does.
  const { data: actionRow, error: actionFetchErr } = await deps.supabase
    .from("whatsapp_booking_actions")
    .select("id, conversation_id, state")
    .eq("id", body.booking_action_id)
    .single();

  if (actionFetchErr || !actionRow) {
    return { ok: false, status: 404, reason: "booking action not found" };
  }
  if (actionRow.conversation_id !== body.conversation_id) {
    return {
      ok: false,
      status: 422,
      reason: "booking action does not belong to this conversation",
    };
  }
  if (actionRow.state !== "pending") {
    return {
      ok: false,
      status: 409,
      reason: `booking action is ${actionRow.state}, not pending`,
    };
  }

  // (3) Conversation lookup — also a fast path.
  const { data: conv, error: convErr } = await deps.supabase
    .from("whatsapp_conversations")
    .select("id, phone_e164")
    .eq("id", body.conversation_id)
    .single();

  if (convErr || !conv) {
    return { ok: false, status: 404, reason: "conversation not found" };
  }
  const phone = conv.phone_e164;
  if (typeof phone !== "string" || !phone) {
    return { ok: false, status: 422, reason: "conversation has no phone number" };
  }

  // (4) Atomic claim — the lock that prevents duplicate Meta sends
  //     under concurrent retries. Only one caller's UPDATE can
  //     match a row with state='pending'.
  const expiresAt = new Date(deps.now().getTime() + CONFIRM_BUTTON_TTL_MS).toISOString();
  const { data: claimedRows, error: claimErr } = await deps.supabase
    .from("whatsapp_booking_actions")
    .update({
      state: "awaiting_customer_confirm",
      customer_confirm_message_id: null,
      customer_confirm_expires_at: expiresAt,
    })
    .eq("id", body.booking_action_id)
    .eq("state", "pending")
    .select("id");

  if (claimErr) {
    return {
      ok: false,
      status: 500,
      reason: `claim failed: ${claimErr.message ?? "unknown"}`,
    };
  }
  if (!claimedRows || claimedRows.length === 0) {
    return {
      ok: false,
      status: 409,
      reason: "booking action already claimed by another request",
    };
  }

  // (5) Send via Meta. On failure, roll back the claim so a retry
  //     (or staff via the inbox) can take over.
  const metaBody = buildConfirmButtonsMetaBody({
    toDigits: toMetaTo(phone),
    summaryText: body.summary_text,
    bookingActionId: body.booking_action_id,
    actionKind: body.action_kind,
  });

  let metaRes: ConfirmButtonsMetaResult;
  try {
    metaRes = await deps.callMeta(metaBody);
  } catch (err) {
    await deps.supabase
      .from("whatsapp_booking_actions")
      .update({
        state: "pending",
        customer_confirm_message_id: null,
        customer_confirm_expires_at: null,
      })
      .eq("id", body.booking_action_id)
      .select("id");

    return {
      ok: false,
      status: 502,
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  const metaMessageId = metaRes.messages?.[0]?.id ?? null;

  // (6) Record the outbound message — observational.
  try {
    await deps.recordOutbound(conv.id as string, metaMessageId, body.summary_text, metaBody);
  } catch {
    // Already past the point where we can unwind. The row is
    // correctly at 'awaiting_customer_confirm' — surface a warning
    // so the caller can log and reconcile.
    return {
      ok: true,
      status: 200,
      meta_message_id: metaMessageId,
      warning: "state_update_failed",
    };
  }

  // (7) Tag the row with the real Meta message_id. The inbound
  //     webhook matches Yes/No replies by message_id, so this is
  //     load-bearing — but we own the row now, so no optimistic
  //     lock is needed.
  const { error: tagErr } = await deps.supabase
    .from("whatsapp_booking_actions")
    .update({ customer_confirm_message_id: metaMessageId })
    .eq("id", body.booking_action_id)
    .select("id");

  if (tagErr) {
    return {
      ok: true,
      status: 200,
      meta_message_id: metaMessageId,
      warning: "state_update_failed",
    };
  }

  return { ok: true, status: 200, meta_message_id: metaMessageId };
}
