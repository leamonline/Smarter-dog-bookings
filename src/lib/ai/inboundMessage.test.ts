import { describe, it, expect } from "vitest";
import {
  extractMessageText,
  reactionFields,
} from "../../../supabase/functions/_shared/inboundMessage";

describe("extractMessageText", () => {
  it("returns the plain text body for a normal message", () => {
    expect(extractMessageText({ type: "text", text: { body: "Hi there" } })).toBe(
      "Hi there",
    );
  });

  it("renders a reaction as a friendly 'Reacted <emoji>'", () => {
    expect(
      extractMessageText({
        type: "reaction",
        reaction: { message_id: "wamid.BBB", emoji: "👍" },
      }),
    ).toBe("Reacted 👍");
  });

  it("renders an emoji-less reaction as plain 'Reacted'", () => {
    expect(extractMessageText({ type: "reaction", reaction: {} })).toBe("Reacted");
  });

  it("still falls back to the placeholder for other non-text types", () => {
    expect(extractMessageText({ type: "image" })).toBe(
      "[image message — no text content]",
    );
  });

  it("prefers an interactive reply title when present", () => {
    expect(
      extractMessageText({
        type: "interactive",
        interactive: { button_reply: { id: "x", title: "Yes please" } },
      }),
    ).toBe("Yes please");
  });
});

describe("reactionFields", () => {
  it("extracts the emoji and reacted-to wamid for a reaction", () => {
    expect(
      reactionFields({
        type: "reaction",
        reaction: { message_id: "wamid.BBB", emoji: "❤️" },
      }),
    ).toEqual({ reaction_emoji: "❤️", in_reply_to_meta_id: "wamid.BBB" });
  });

  it("uses context.id as the parent for a quoted reply", () => {
    expect(
      reactionFields({ type: "text", text: { body: "yes" }, context: { id: "wamid.CCC" } }),
    ).toEqual({ reaction_emoji: null, in_reply_to_meta_id: "wamid.CCC" });
  });

  it("returns nulls for an ordinary message", () => {
    expect(reactionFields({ type: "text", text: { body: "hello" } })).toEqual({
      reaction_emoji: null,
      in_reply_to_meta_id: null,
    });
  });
});
