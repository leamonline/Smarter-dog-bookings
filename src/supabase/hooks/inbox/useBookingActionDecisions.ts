// useBookingActionDecisions — apply or reject the inline booking
// proposal that the AI agent attaches to a draft.
//
//   applyBookingAction(actionId, editedPayload?)
//     If staff tweaked the proposal (date, slot, service), persist the
//     edited payload first, then call apply_whatsapp_booking_action.
//     The RPC reads the row's payload to drive the create / reschedule
//     / cancel. On success, remove the action from the local list and
//     flip the conversation's has_pending_booking_action flag if the
//     list is now empty.
//
//   rejectBookingAction(actionId, reason?)
//     Marks the action row state='rejected' with an optional reason
//     (capped at 500 chars). Same list/conversation cleanup as apply.
//
// Pulled out of useWhatsAppInbox so both can be tested in isolation
// and the monolith shrinks. Takes setBookingActions /
// setConversations as setters — same plumbing pattern as
// useAIModeControls.
import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { supabase } from "../../client";
import { logger } from "../../../lib/logger";
import { applyWhatsappBookingAction } from "../../rpc";
import type { Json } from "../../database.types";

/** The action fields this hook reads; the thread holds the full whatsapp_booking_actions row. */
export interface PendingBookingAction {
  id: string;
}

/** The conversation fields this hook writes; the list holds richer objects. */
export interface BookingActionConversation {
  id: string;
  has_pending_booking_action?: boolean | null;
}

export type BookingActionResult =
  | { ok: true; bookingId?: unknown }
  | { ok: false; reason: string };

export interface UseBookingActionDecisionsArgs<
  A extends PendingBookingAction,
  C extends BookingActionConversation,
> {
  actionInFlight: boolean;
  setActionInFlight: (inFlight: boolean) => void;
  setBookingActions: Dispatch<SetStateAction<A[]>>;
  setConversations: Dispatch<SetStateAction<C[]>>;
  selectedIdRef: MutableRefObject<string | null | undefined>;
}

export interface UseBookingActionDecisionsResult {
  applyBookingAction: (actionId: string, editedPayload?: Json | null) => Promise<BookingActionResult>;
  rejectBookingAction: (actionId: string, reason?: string | null) => Promise<BookingActionResult>;
}

function failure(err: unknown): BookingActionResult {
  return { ok: false, reason: err instanceof Error ? err.message : String(err) };
}

export function useBookingActionDecisions<
  A extends PendingBookingAction,
  C extends BookingActionConversation,
>({
  actionInFlight,
  setActionInFlight,
  setBookingActions,
  setConversations,
  selectedIdRef,
}: UseBookingActionDecisionsArgs<A, C>): UseBookingActionDecisionsResult {
  const applyBookingAction = useCallback(
    async (actionId: string, editedPayload: Json | null = null): Promise<BookingActionResult> => {
      if (!actionId || actionInFlight) {
        return { ok: false, reason: "no action or action in flight" };
      }
      setActionInFlight(true);
      try {
        if (!supabase) throw new Error("Not connected");
        // If the staff member edited the proposal (e.g. moved the date,
        // changed the slot, or fixed the service), persist the new
        // payload onto the action row before running the RPC. The RPC
        // reads payload from the row, so this is the contract.
        if (editedPayload) {
          const { error: upErr } = await supabase
            .from("whatsapp_booking_actions")
            .update({ payload: editedPayload })
            .eq("id", actionId)
            .eq("state", "pending");
          if (upErr) throw upErr;
        }
        const { data, error } = await applyWhatsappBookingAction(supabase, {
          actionId,
        });
        if (error) throw error;
        setBookingActions((prev) => {
          const next = prev.filter((action) => action.id !== actionId);
          setConversations((conversationsPrev) =>
            conversationsPrev.map((c) =>
              c.id === selectedIdRef.current
                ? { ...c, has_pending_booking_action: next.length > 0 }
                : c,
            ),
          );
          return next;
        });
        return { ok: true, bookingId: data };
      } catch (err) {
        logger.error("applyBookingAction failed", err, {
          tags: { hook: "useBookingActionDecisions", op: "applyBookingAction" },
        });
        return failure(err);
      } finally {
        setActionInFlight(false);
      }
    },
    [actionInFlight, setActionInFlight, setBookingActions, setConversations, selectedIdRef],
  );

  const rejectBookingAction = useCallback(
    async (actionId: string, reason: string | null = ""): Promise<BookingActionResult> => {
      if (!actionId || actionInFlight) {
        return { ok: false, reason: "no action or action in flight" };
      }
      setActionInFlight(true);
      try {
        if (!supabase) throw new Error("Not connected");
        const { error } = await supabase
          .from("whatsapp_booking_actions")
          .update({
            state: "rejected",
            rejection_reason:
              typeof reason === "string" && reason.trim()
                ? reason.trim().slice(0, 500)
                : null,
            decided_at: new Date().toISOString(),
          })
          .eq("id", actionId)
          .eq("state", "pending");
        if (error) throw error;
        setBookingActions((prev) => {
          const next = prev.filter((action) => action.id !== actionId);
          setConversations((conversationsPrev) =>
            conversationsPrev.map((c) =>
              c.id === selectedIdRef.current
                ? { ...c, has_pending_booking_action: next.length > 0 }
                : c,
            ),
          );
          return next;
        });
        return { ok: true };
      } catch (err) {
        logger.error("rejectBookingAction failed", err, {
          tags: { hook: "useBookingActionDecisions", op: "rejectBookingAction" },
        });
        return failure(err);
      } finally {
        setActionInFlight(false);
      }
    },
    [actionInFlight, setActionInFlight, setBookingActions, setConversations, selectedIdRef],
  );

  return { applyBookingAction, rejectBookingAction };
}
