// useAIModeControls — the three callbacks that flip AI-handling
// flags on a whatsapp_conversations row.
//
//   setAIMode(mode, opts)
//     Consolidated segmented-control selector. Writes:
//       'ai_auto'    → state='ai_handling',  auto_send_enabled=true,
//                      autonomous_booking_enabled=opts.allowAutonomousBooking
//       'human_only' → state='human_takeover', auto_send_enabled=false,
//                      autonomous_booking_enabled=false
//     Returns { ok: true } | { ok: false, reason }.
//
//   setAutoSendEnabled(enabled)
//     Per-conversation auto-send opt-in. The agent only auto-sends a
//     draft when ALL of:
//       1. AI_AUTO_SEND_LOW_RISK env flag on the function is 'true'
//       2. The row's auto_send_enabled is true (set here)
//       3. The draft itself is low-risk + handoff-free + in the
//          auto-send intent allowlist (computed by the agent).
//
//   setAutonomousBookingEnabled(enabled)
//     Standalone toggle for the autonomous_booking_enabled column. The
//     setAIMode path covers this when switching modes; this exists
//     for the nested toggle that appears under "AI auto".
//
// All three do optimistic local updates with rollback on failure so
// the toggle UI feels instant. Pulled out of useWhatsAppInbox so
// they can be tested against a stubbed supabase + setConversations.
import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { supabase } from "../../client";
import { logger } from "../../../lib/logger";

/** The conversation fields these toggles read and write; the list holds richer objects. */
export interface AIModeConversation {
  id: string;
  state?: string | null;
  auto_send_enabled?: boolean | null;
  autonomous_booking_enabled?: boolean | null;
}

export type AIMode = "ai_auto" | "human_only";

/** `{ ok: false }` with no reason is the "nothing selected / busy" early return. */
export type AIModeResult = { ok: true } | { ok: false; reason?: string };

export interface UseAIModeControlsArgs<T extends AIModeConversation> {
  selectedId: string | null | undefined;
  actionInFlight: boolean;
  setActionInFlight: (inFlight: boolean) => void;
  conversations: ReadonlyArray<T>;
  setConversations: Dispatch<SetStateAction<T[]>>;
}

export interface UseAIModeControlsResult {
  setAutoSendEnabled: (enabled: boolean) => Promise<AIModeResult>;
  setAutonomousBookingEnabled: (enabled: boolean) => Promise<AIModeResult>;
  setAIMode: (mode: AIMode, opts?: { allowAutonomousBooking?: boolean }) => Promise<AIModeResult>;
}

function failure(err: unknown): AIModeResult {
  return { ok: false, reason: err instanceof Error ? err.message : String(err) };
}

export function useAIModeControls<T extends AIModeConversation>({
  selectedId,
  actionInFlight,
  setActionInFlight,
  conversations,
  setConversations,
}: UseAIModeControlsArgs<T>): UseAIModeControlsResult {
  const setAutoSendEnabled = useCallback(async (enabled: boolean): Promise<AIModeResult> => {
    if (!selectedId || actionInFlight) return { ok: false };
    setActionInFlight(true);
    const next = !!enabled;
    setConversations((prev) =>
      prev.map((c) => (c.id === selectedId ? { ...c, auto_send_enabled: next } : c)),
    );
    try {
      if (!supabase) throw new Error("Not connected");
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ auto_send_enabled: next })
        .eq("id", selectedId);
      if (error) throw error;
      return { ok: true };
    } catch (err) {
      logger.error("setAutoSendEnabled failed", err, {
        tags: { hook: "useAIModeControls", op: "setAutoSendEnabled" },
      });
      // Roll back the optimistic flip.
      setConversations((prev) =>
        prev.map((c) => (c.id === selectedId ? { ...c, auto_send_enabled: !next } : c)),
      );
      return failure(err);
    } finally {
      setActionInFlight(false);
    }
  }, [selectedId, actionInFlight, setActionInFlight, setConversations]);

  const setAutonomousBookingEnabled = useCallback(async (enabled: boolean): Promise<AIModeResult> => {
    if (!selectedId || actionInFlight) return { ok: false };
    setActionInFlight(true);
    const next = !!enabled;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selectedId ? { ...c, autonomous_booking_enabled: next } : c,
      ),
    );
    try {
      if (!supabase) throw new Error("Not connected");
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({ autonomous_booking_enabled: next })
        .eq("id", selectedId);
      if (error) throw error;
      return { ok: true };
    } catch (err) {
      logger.error("setAutonomousBookingEnabled failed", err, {
        tags: { hook: "useAIModeControls", op: "setAutonomousBookingEnabled" },
      });
      setConversations((prev) =>
        prev.map((c) =>
          c.id === selectedId ? { ...c, autonomous_booking_enabled: !next } : c,
        ),
      );
      return failure(err);
    } finally {
      setActionInFlight(false);
    }
  }, [selectedId, actionInFlight, setActionInFlight, setConversations]);

  const setAIMode = useCallback(async (
    mode: AIMode,
    opts: { allowAutonomousBooking?: boolean } = {},
  ): Promise<AIModeResult> => {
    if (!selectedId || actionInFlight) return { ok: false };
    if (mode !== "ai_auto" && mode !== "human_only") {
      return { ok: false, reason: `unknown mode: ${String(mode)}` };
    }

    const next = {
      state: mode === "human_only" ? "human_takeover" : "ai_handling",
      auto_send_enabled: mode === "ai_auto",
      autonomous_booking_enabled:
        mode === "ai_auto" ? !!opts.allowAutonomousBooking : false,
    };

    const prev = conversations.find((c) => c.id === selectedId);
    const previousSnapshot = prev
      ? {
          state: prev.state,
          auto_send_enabled: prev.auto_send_enabled,
          autonomous_booking_enabled: prev.autonomous_booking_enabled,
        }
      : null;

    setActionInFlight(true);
    setConversations((list) =>
      list.map((c) => (c.id === selectedId ? { ...c, ...next } : c)),
    );

    try {
      if (!supabase) throw new Error("Not connected");
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update(next)
        .eq("id", selectedId);
      if (error) throw error;
      return { ok: true };
    } catch (err) {
      logger.error("setAIMode failed", err, {
        tags: { hook: "useAIModeControls", op: "setAIMode" },
      });
      if (previousSnapshot) {
        setConversations((list) =>
          list.map((c) => (c.id === selectedId ? { ...c, ...previousSnapshot } : c)),
        );
      }
      return failure(err);
    } finally {
      setActionInFlight(false);
    }
  }, [selectedId, actionInFlight, setActionInFlight, conversations, setConversations]);

  return { setAutoSendEnabled, setAutonomousBookingEnabled, setAIMode };
}
