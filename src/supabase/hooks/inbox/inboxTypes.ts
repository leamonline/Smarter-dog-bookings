/**
 * inboxTypes — the row and state shapes of the staff WhatsApp inbox
 * (Debt 6; split out of useWhatsAppInbox.ts, which re-exports the public
 * ones so importers are unchanged).
 *
 * The list query embeds three relations behind a template-string select
 * that the typed client cannot parse, so the row shape is declared here
 * and the query result is narrowed to it once, at the fetch boundary.
 */
import type { Database, Json } from "../../database.types";

export type ConversationRow = Database["public"]["Tables"]["whatsapp_conversations"]["Row"];
export type MessageRow = Database["public"]["Tables"]["whatsapp_messages"]["Row"];
export type DraftRow = Database["public"]["Tables"]["whatsapp_drafts"]["Row"];
export type BookingActionRow = Database["public"]["Tables"]["whatsapp_booking_actions"]["Row"];

/** A pending draft as the list embeds it (the workspace variant adds intent + created_at). */
export type InboxDraftSummary = Pick<DraftRow, "id" | "state" | "risk_level" | "handoff_required"> &
  Partial<Pick<DraftRow, "intent" | "created_at">>;

/** A booking action as the list embeds it (the workspace variant adds action, payload, created_at). */
export type InboxBookingActionSummary = Pick<BookingActionRow, "id" | "state"> &
  Partial<Pick<BookingActionRow, "action" | "payload" | "created_at">>;

export interface InboxHumanDog {
  id: string;
  name: string;
  breed: string | null;
  size: string | null;
}

/** The joined humans projection; `dogs` only arrives with includeBookingWorkspaceData. */
export interface InboxHuman {
  name: string | null;
  surname: string | null;
  dogs?: InboxHumanDog[];
}

/** One row of the conversations list as selected from whatsapp_conversations. */
export type ConversationListRow = Pick<
  ConversationRow,
  | "id"
  | "phone_e164"
  | "channel"
  | "state"
  | "human_id"
  | "last_inbound_at"
  | "last_outbound_at"
  | "last_customer_text"
  | "last_message_text"
  | "last_message_direction"
  | "last_message_at"
  | "unread_count"
  | "auto_send_enabled"
  | "autonomous_booking_enabled"
  | "lead_status"
  | "lead_payload"
  | "closed_at"
  | "closed_by"
  | "closure_reason"
  | "closure_suggested_at"
  | "closure_suggested_reason"
  | "notes"
> & {
  agent_state?: Json;
  humans: InboxHuman | null;
  whatsapp_drafts: InboxDraftSummary[] | null;
  whatsapp_booking_actions: InboxBookingActionSummary[] | null;
};

/** A failed outbound message, as the list's badge lookup selects it. */
export type FailedMessage = Pick<MessageRow, "id" | "conversation_id" | "error_message" | "sent_at">;

/** The derived flags the list folds onto each row. */
export interface ConversationDerivedFlags {
  has_pending_draft: boolean;
  pending_draft: InboxDraftSummary | null;
  has_pending_booking_action: boolean;
  pending_booking_action: InboxBookingActionSummary | null;
  needs_human_review: boolean;
  has_failed_message: boolean;
  latest_failed_message: FailedMessage | null;
}

/** A conversation as the inbox list state holds it. */
export type InboxConversation = ConversationListRow & ConversationDerivedFlags;

/** One message of the selected thread. */
export type InboxMessage = Pick<
  MessageRow,
  | "id"
  | "direction"
  | "content"
  | "sent_at"
  | "status"
  | "error_message"
  | "meta_message_id"
  | "channel"
  | "reaction_emoji"
  | "in_reply_to_meta_id"
  | "media_path"
  | "media_mime"
>;

/** The selected thread's pending AI draft. */
export type InboxDraft = Pick<
  DraftRow,
  | "id"
  | "proposed_text"
  | "intent"
  | "confidence"
  | "state"
  | "created_at"
  | "tokens_input"
  | "tokens_output"
  | "model"
  | "risk_level"
  | "handoff_required"
  | "auto_send_eligible"
>;

/** A booking proposal on the selected thread (pending, applied or auto-applied). */
export type InboxBookingAction = Pick<
  BookingActionRow,
  | "id"
  | "draft_id"
  | "action"
  | "payload"
  | "target_booking_id"
  | "state"
  | "rejection_reason"
  | "applied_booking_id"
  | "applied_at"
  | "error_message"
  | "created_at"
>;

export interface ConversationDetail {
  messages: InboxMessage[];
  draft: InboxDraft | null;
  bookingActions: InboxBookingAction[];
}

/** whatsapp-generate-reply's JSON body. */
export interface GenerateReplyResponse {
  ok?: boolean;
  reason?: string;
  reply_text?: string;
}

/** whatsapp-update-notes's JSON body. */
export interface UpdateNotesResponse {
  ok?: boolean;
  reason?: string;
  summary?: string;
  updated?: unknown;
}

export interface SelectConversationOptions {
  /** Booking Desk passes false: a read-only preview must not clear the unread badge. */
  markRead?: boolean;
}
