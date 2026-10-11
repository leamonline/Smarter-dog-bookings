// ============================================================
// supabase/functions/_shared/staffFollowUp.ts
//
// A staff to-do for every place the WhatsApp bot has to give up.
//
// Some automated paths cannot finish what the customer asked: a change inside
// the 24-hour window, a menu or confirmation that timed out, a booking that
// changed while they were in the form. Each used to end with the customer
// being told to message again, or that "the team" would help, while nothing
// on the staff side recorded it. The request then waited until someone
// happened to read the thread, and customers chased.
//
// raiseFollowUpTodo puts an ordinary to-do on the staff dashboard, linked to
// the customer, so the promise "the team will sort it" is backed by a list
// item someone can tick off.
//
//   - kind 'general': staff tick it off like any other task. The workflow
//     kinds are locked to their own completion flows, which don't exist here.
//   - One open follow-up per customer per FOLLOW_UP_DEDUPE_HOURS, so a
//     customer who taps three expired buttons gets one task, not three.
//   - Best effort: a failure is logged and swallowed. The customer's reply has
//     already been decided; a to-do write must never break the conversation.
//   - The text carries the customer's name and what happened, never the
//     content of their messages.
//   - It never claims the customer was told. Callers pass whether our reply
//     was accepted for sending; even then that is not delivery (AGENTS.md),
//     so the wording says what we did, and says plainly when it may not
//     have gone through.
// ============================================================

// Minimal structural type for the calls made here, the confirmButtons.ts
// pattern: the real supabase-js client satisfies it, Node-side tests can pass
// a thin fake, and tsc on the app side needs no Deno import. Terminal results
// are PromiseLike because the real builders are thenables, not Promises.
type QueryResult = { data: unknown; error: { message?: string } | null };

export interface FollowUpQuery extends PromiseLike<QueryResult> {
  eq(column: string, value: unknown): FollowUpQuery;
  like(column: string, pattern: string): FollowUpQuery;
  gte(column: string, value: string): FollowUpQuery;
  order(column: string, options: { ascending: boolean }): FollowUpQuery;
  limit(count: number): FollowUpQuery;
  maybeSingle(): PromiseLike<QueryResult>;
}

export interface FollowUpClient {
  from(table: string): {
    select(columns: string): FollowUpQuery;
    insert(row: Record<string, unknown>): PromiseLike<{ error: { message?: string } | null }>;
  };
}

export type FollowUpReason =
  | "manage_deadline_cancel"
  | "manage_deadline_reschedule"
  | "manage_selection_expired"
  | "manage_booking_gone"
  | "confirm_expired"
  | "flow_reschedule_cutoff"
  | "flow_booking_changed";

/** Every follow-up to-do starts with this, which is also how duplicates are found. */
export const FOLLOW_UP_TODO_PREFIX = "WhatsApp follow-up:";

/** A second dead end inside this window adds nothing the open to-do doesn't say. */
export const FOLLOW_UP_DEDUPE_HOURS = 12;

const WHAT_HAPPENED: Readonly<Record<FollowUpReason, string>> = {
  manage_deadline_cancel: "wants to cancel a groom that has already started",
  manage_deadline_reschedule: "wants to move a groom that is within 24 hours",
  manage_selection_expired: "tried to cancel or move a groom, but the menu had timed out",
  manage_booking_gone: "tried to cancel or move a groom that had already changed",
  confirm_expired: "didn't confirm a booking change in time",
  flow_reschedule_cutoff: "tried to move a groom within 24 hours in the booking form",
  flow_booking_changed: "tried to move a groom that had changed while they were in the booking form",
};

/**
 * Whether our reply to the customer went out. "sent" means the provider
 * accepted it (or the booking form displayed it), not that it was read.
 */
export type CustomerReply = "sent" | "unconfirmed";

/** The to-do line staff see. Pure, so the wording is tested directly. */
export function followUpTodoText(
  customerName: string | null | undefined,
  reason: FollowUpReason,
  reply: CustomerReply = "sent",
): string {
  const who = customerName?.trim() || "A customer";
  const next = reply === "sent"
    ? "We replied that the team will sort it — follow up in the WhatsApp inbox."
    : "Our automatic reply may not have reached them, so contact them directly.";
  return `${FOLLOW_UP_TODO_PREFIX} ${who} ${WHAT_HAPPENED[reason]}. ${next}`;
}

/** "First Last" from a humans row, or null when neither part is set. */
export function customerDisplayName(row: { name?: string | null; surname?: string | null } | null | undefined): string | null {
  const full = [row?.name?.trim(), row?.surname?.trim()].filter(Boolean).join(" ");
  return full || null;
}

export type FollowUpOutcome = "created" | "duplicate" | "skipped" | "failed";

export async function raiseFollowUpTodo(
  client: { from(table: string): unknown },
  humanId: string | null | undefined,
  reason: FollowUpReason,
  options: { reply?: CustomerReply; now?: Date } = {},
): Promise<FollowUpOutcome> {
  const now = options.now ?? new Date();
  // Without a customer there is nothing to link to and no name to show; the
  // inbox thread is still there for staff.
  if (!humanId) {
    console.warn(`raiseFollowUpTodo(${reason}): no linked customer, so no to-do was created`);
    return "skipped";
  }
  // The parameter is deliberately shallow: checking the real supabase-js
  // client against FollowUpClient in full trips Deno's "type instantiation is
  // excessively deep" (TS2589). Narrow once here instead.
  const supabase = client as FollowUpClient;
  try {
    const since = new Date(now.getTime() - FOLLOW_UP_DEDUPE_HOURS * 3600_000).toISOString();
    const { data: open, error: openErr } = await supabase
      .from("salon_todos")
      .select("id")
      .eq("human_id", humanId)
      .eq("done", false)
      .like("text", `${FOLLOW_UP_TODO_PREFIX}%`)
      .gte("created_at", since)
      .limit(1);
    if (openErr) throw openErr;
    if (Array.isArray(open) && open.length > 0) return "duplicate";

    const { data: human } = await supabase
      .from("humans")
      .select("name, surname")
      .eq("id", humanId)
      .maybeSingle();

    // New tasks go to the bottom of the list, as the dashboard's own add does.
    const { data: last } = await supabase
      .from("salon_todos")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sortOrder = ((last as { sort_order?: number } | null)?.sort_order ?? -1) + 1;

    const { error: insertErr } = await supabase.from("salon_todos").insert({
      text: followUpTodoText(
        customerDisplayName(human as { name?: string; surname?: string } | null),
        reason,
        options.reply ?? "sent",
      ),
      done: false,
      sort_order: sortOrder,
      human_id: humanId,
      kind: "general",
    });
    if (insertErr) throw insertErr;
    return "created";
  } catch (err) {
    console.error(
      `raiseFollowUpTodo(${reason}) failed (non-fatal):`,
      err instanceof Error ? err.message : JSON.stringify(err),
    );
    return "failed";
  }
}
