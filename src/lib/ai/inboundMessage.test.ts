import { describe, it, expect } from "vitest";
import {
  extractInboundMedia,
  extractMessageText,
  mediaFileExtension,
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

  it("uses the caption as the text for a captioned photo", () => {
    expect(
      extractMessageText({
        type: "image",
        image: { id: "123", mime_type: "image/jpeg", caption: "Bella after her groom" },
      }),
    ).toBe("Bella after her groom");
  });

  it("keeps the placeholder for an uncaptioned photo", () => {
    expect(
      extractMessageText({ type: "image", image: { id: "123", mime_type: "image/jpeg" } }),
    ).toBe("[image message — no text content]");
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

describe("extractInboundMedia", () => {
  it("extracts the media id, mime and caption for an inbound photo", () => {
    expect(
      extractInboundMedia({
        type: "image",
        image: { id: "1956624558351489", mime_type: "image/jpeg", caption: "Bella" },
      }),
    ).toEqual({
      mediaType: "image",
      mediaId: "1956624558351489",
      mimeType: "image/jpeg",
      caption: "Bella",
    });
  });

  it("normalises a missing mime/caption to nulls", () => {
    expect(
      extractInboundMedia({ type: "image", image: { id: "42" } }),
    ).toEqual({ mediaType: "image", mediaId: "42", mimeType: null, caption: null });
  });

  it("extracts stickers (webp images in all but name)", () => {
    expect(
      extractInboundMedia({
        type: "sticker",
        sticker: { id: "77", mime_type: "image/webp" },
      }),
    ).toEqual({ mediaType: "sticker", mediaId: "77", mimeType: "image/webp", caption: null });
  });

  it("returns null for media types we don't fetch yet (video/audio/document)", () => {
    expect(extractInboundMedia({ type: "video", video: { id: "9" } })).toBeNull();
    expect(extractInboundMedia({ type: "audio", audio: { id: "9" } })).toBeNull();
    expect(extractInboundMedia({ type: "document", document: { id: "9" } })).toBeNull();
  });

  it("returns null for text messages and for an image payload missing its id", () => {
    expect(extractInboundMedia({ type: "text", text: { body: "hi" } })).toBeNull();
    expect(extractInboundMedia({ type: "image", image: {} })).toBeNull();
  });
});

describe("mediaFileExtension", () => {
  it("maps WhatsApp image mimes to their extensions", () => {
    expect(mediaFileExtension("image/jpeg")).toBe("jpg");
    expect(mediaFileExtension("image/png")).toBe("png");
    expect(mediaFileExtension("image/webp")).toBe("webp");
  });

  it("ignores mime parameters and case", () => {
    expect(mediaFileExtension("image/JPEG; charset=binary")).toBe("jpg");
  });

  it("falls back to 'bin' for unknown or missing mimes", () => {
    expect(mediaFileExtension("application/x-mystery")).toBe("bin");
    expect(mediaFileExtension(null)).toBe("bin");
  });
});
