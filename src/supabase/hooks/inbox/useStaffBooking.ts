// ============================================================
// src/supabase/hooks/inbox/useStaffBooking.ts
//
// Staff "Book appointment" from an inbox conversation. Thin wrapper
// around the create_staff_booking_from_conversation RPC, which stages a
// manual booking action and applies it through the same guarded path as
// an AI proposal (capacity trigger, conversation link, thread card).
//
// On success it refreshes the thread (so the inline "Booking created"
// card appears) and the list. Guarded by the shared actionInFlight flag
// so it can't race the other thread actions.
// ============================================================

import { useCallback } from "react";
import { supabase } from "../../client";
import { logger } from "../../../lib/logger";
import { createStaffBookingFromConversation } from "../../rpc";
import type { StaffBookingPayload } from "../../rpc";
import type { InboxActionResult } from "./helpers";

export interface UseStaffBookingArgs {
  selectedId: string | null | undefined;
  actionInFlight: boolean;
  setActionInFlight: (inFlight: boolean) => void;
  refreshDetail: (conversationId: string) => Promise<unknown>;
  refreshList: () => unknown;
}

export type CreateStaffBookingResult = InboxActionResult<{ bookingId: unknown }>;

export interface UseStaffBookingResult {
  createStaffBooking: (
    payload: StaffBookingPayload,
    conversationId?: string | null,
  ) => Promise<CreateStaffBookingResult>;
}

export function useStaffBooking({
  selectedId,
  actionInFlight,
  setActionInFlight,
  refreshDetail,
  refreshList,
}: UseStaffBookingArgs): UseStaffBookingResult {
  const createStaffBooking = useCallback(
    async (payload: StaffBookingPayload, conversationId?: string | null): Promise<CreateStaffBookingResult> => {
      const id = conversationId ?? selectedId;
      if (!id) return { ok: false, reason: "no conversation selected" };
      if (actionInFlight) return { ok: false, reason: "another action is in progress" };

      setActionInFlight(true);
      try {
        if (!supabase) throw new Error("Not connected");
        const { data, error } = await createStaffBookingFromConversation(supabase, {
          conversationId: id,
          payload,
        });
        if (error) throw error;
        // Thread refresh surfaces the inline "Booking created" card; list
        // refresh keeps derived flags honest. Realtime would also catch
        // these, but the explicit refresh makes the result feel instant.
        await refreshDetail(id);
        refreshList();
        return { ok: true, bookingId: data };
      } catch (err) {
        logger.error("createStaffBooking failed", err, {
          tags: { hook: "useStaffBooking", op: "createStaffBooking" },
        });
        return {
          ok: false,
          reason: err instanceof Error ? err.message : String(err),
        };
      } finally {
        setActionInFlight(false);
      }
    },
    [selectedId, actionInFlight, setActionInFlight, refreshDetail, refreshList],
  );

  return { createStaffBooking };
}
