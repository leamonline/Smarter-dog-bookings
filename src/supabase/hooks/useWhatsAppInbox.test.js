/**
 * useWhatsAppInbox helpers — unit tests
 *
 * Run: npx vitest run src/supabase/hooks/useWhatsAppInbox.test.js
 *
 * Covers the pure-function helpers exported from the hook module.
 * The hook itself (with React state, supabase, realtime) isn't tested
 * here — that's covered by manual smoke tests against a seeded draft.
 */

import { describe, it, expect } from "vitest";
import * as inbox from "./useWhatsAppInbox.js";

const {
  filterAttachedActions,
  getSelectedConversationForSend,
  latestMessagesChronological,
  mergeFailedMessageFlags,
} = inbox;

describe("filterAttachedActions", () => {
  const draft = { id: "draft-1", proposed_text: "hello", state: "pending" };

  it("returns [] when draft is null", () => {
    expect(filterAttachedActions(null, [])).toEqual([]);
    expect(filterAttachedActions(undefined, [])).toEqual([]);
  });

  it("returns [] when bookingActions is not an array", () => {
    expect(filterAttachedActions(draft, null)).toEqual([]);
    expect(filterAttachedActions(draft, undefined)).toEqual([]);
  });

  it("returns [] when no booking_actions match the draft", () => {
    const actions = [
      { id: "a-1", draft_id: "other-draft", state: "pending" },
      { id: "a-2", draft_id: null, state: "pending" },
    ];
    expect(filterAttachedActions(draft, actions)).toEqual([]);
  });

  it("excludes actions matching the draft but already applied or rejected", () => {
    const actions = [
      { id: "a-1", draft_id: "draft-1", state: "applied" },
      { id: "a-2", draft_id: "draft-1", state: "rejected" },
    ];
    expect(filterAttachedActions(draft, actions)).toEqual([]);
  });

  it("returns matching pending actions", () => {
    const actions = [
      { id: "a-1", draft_id: "draft-1", state: "pending", payload: { dog_name: "Alfie" } },
      { id: "a-2", draft_id: "other-draft", state: "pending" },
      { id: "a-3", draft_id: "draft-1", state: "applied" },
    ];
    const result = filterAttachedActions(draft, actions);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a-1");
  });

  it("returns multiple matching pending actions in original order", () => {
    const actions = [
      { id: "a-1", draft_id: "draft-1", state: "pending" },
      { id: "a-2", draft_id: "draft-1", state: "pending" },
      { id: "a-3", draft_id: "other", state: "pending" },
    ];
    const result = filterAttachedActions(draft, actions);
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id)).toEqual(["a-1", "a-2"]);
  });
});

describe("latestMessagesChronological", () => {
  it("keeps the newest limited page but returns it oldest-to-newest for rendering", () => {
    const newestFirst = [
      { id: "m-250", sent_at: "2026-06-12T12:50:00Z" },
      { id: "m-249", sent_at: "2026-06-12T12:49:00Z" },
      { id: "m-248", sent_at: "2026-06-12T12:48:00Z" },
    ];

    expect(latestMessagesChronological(newestFirst).map((m) => m.id)).toEqual([
      "m-248",
      "m-249",
      "m-250",
    ]);
  });
});

describe("getSelectedConversationForSend", () => {
  it("throws instead of silently succeeding when the selected conversation is missing", () => {
    expect(() =>
      getSelectedConversationForSend(
        [{ id: "conv-a", phone_e164: "+447700900111" }],
        "conv-b",
      ),
    ).toThrow("Selected conversation is no longer available");
  });

  it("returns the selected conversation when present", () => {
    const conv = { id: "conv-a", phone_e164: "+447700900111" };
    expect(getSelectedConversationForSend([conv], "conv-a")).toBe(conv);
  });
});

describe("mergeFailedMessageFlags", () => {
  it("marks conversations that have failed outbound messages and keeps the latest failure", () => {
    const conversations = [
      { id: "conv-a", phone_e164: "+447700900111" },
      { id: "conv-b", phone_e164: "+447700900222" },
    ];
    const failedMessages = [
      {
        id: "msg-old",
        conversation_id: "conv-a",
        error_message: "Old failure",
        sent_at: "2026-06-12T08:00:00Z",
      },
      {
        id: "msg-new",
        conversation_id: "conv-a",
        error_message: "Latest failure",
        sent_at: "2026-06-12T09:00:00Z",
      },
    ];

    expect(mergeFailedMessageFlags(conversations, failedMessages)).toEqual([
      {
        id: "conv-a",
        phone_e164: "+447700900111",
        has_failed_message: true,
        latest_failed_message: {
          id: "msg-new",
          conversation_id: "conv-a",
          error_message: "Latest failure",
          sent_at: "2026-06-12T09:00:00Z",
        },
      },
      {
        id: "conv-b",
        phone_e164: "+447700900222",
        has_failed_message: false,
        latest_failed_message: null,
      },
    ]);
  });
});
