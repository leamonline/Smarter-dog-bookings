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
import { filterAttachedActions } from "./useWhatsAppInbox.js";

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
