import { describe, it, expect } from "vitest";
import {
  parseMessageContent,
  presentTemplate,
  previewMessageText,
} from "./messageContent";

describe("parseMessageContent", () => {
  it("parses a WhatsApp template send into id + ordered values", () => {
    expect(
      parseMessageContent("[template:ready_for_collection_v1] Cooper · 10"),
    ).toEqual({
      kind: "template",
      templateId: "ready_for_collection_v1",
      values: ["Cooper", "10"],
      rawArgs: "Cooper · 10",
    });
  });

  it("parses an SMS template send (already-rendered text, no separator)", () => {
    const sms = "[template:booking_confirmed_v1] Hi Cooper, your Full Groom is confirmed.";
    expect(parseMessageContent(sms)).toEqual({
      kind: "template",
      templateId: "booking_confirmed_v1",
      values: ["Hi Cooper, your Full Groom is confirmed."],
      rawArgs: "Hi Cooper, your Full Groom is confirmed.",
    });
  });

  it("treats the reaction placeholder as a reaction with no emoji", () => {
    expect(parseMessageContent("[reaction message — no text content]")).toEqual({
      kind: "reaction",
      emoji: null,
    });
  });

  it("surfaces an emoji from a reaction body when one is present", () => {
    expect(parseMessageContent("[reaction 👍]")).toEqual({
      kind: "reaction",
      emoji: "👍",
    });
  });

  it("leaves a plain text message untouched", () => {
    expect(parseMessageContent("Hi, can I move Cooper to Tuesday?")).toEqual({
      kind: "text",
      text: "Hi, can I move Cooper to Tuesday?",
    });
  });

  it("does not mistake unrelated bracketed text for a template or reaction", () => {
    expect(parseMessageContent("[not a template] hello")).toEqual({
      kind: "text",
      text: "[not a template] hello",
    });
  });

  it("handles null / empty content as empty text", () => {
    expect(parseMessageContent(null)).toEqual({ kind: "text", text: "" });
    expect(parseMessageContent(undefined)).toEqual({ kind: "text", text: "" });
    expect(parseMessageContent("")).toEqual({ kind: "text", text: "" });
  });

  it("classifies a media placeholder into a labelled media kind", () => {
    expect(parseMessageContent("[image message — no text content]")).toEqual({
      kind: "media",
      mediaType: "image",
      icon: "📷",
      label: "Photo",
    });
    expect(parseMessageContent("[audio message — no text content]")).toMatchObject({
      kind: "media",
      mediaType: "audio",
      label: "Voice message",
    });
  });

  it("falls back to a generic attachment for unknown media types", () => {
    expect(parseMessageContent("[contacts message — no text content]")).toMatchObject({
      kind: "media",
      label: "Contact card",
    });
    expect(parseMessageContent("[widget message — no text content]")).toMatchObject({
      kind: "media",
      mediaType: "widget",
      label: "Attachment",
    });
  });

  it("still treats reactions as reactions, not media", () => {
    expect(parseMessageContent("[reaction message — no text content]").kind).toBe("reaction");
  });
});

describe("previewMessageText", () => {
  it("turns a media placeholder into an icon + label preview", () => {
    expect(previewMessageText("[image message — no text content]")).toBe("📷 Photo");
  });

  it("leaves plain text and friendly reactions untouched", () => {
    expect(previewMessageText("Can I move Cooper to Tuesday?")).toBe(
      "Can I move Cooper to Tuesday?",
    );
    expect(previewMessageText("Reacted 👍")).toBe("Reacted 👍");
  });

  it("returns an empty string for null / empty content", () => {
    expect(previewMessageText(null)).toBe("");
    expect(previewMessageText("")).toBe("");
  });
});

describe("presentTemplate", () => {
  it("renders a known template as the exact customer-facing message", () => {
    const { label, body, known } = presentTemplate(
      "ready_for_collection_v1",
      ["Cooper", "10"],
      "Cooper · 10",
    );
    expect(known).toBe(true);
    expect(label).toBe("Ready for Collection");
    expect(body).toContain("Cooper");
    expect(body).toContain("10 mins");
    expect(body).not.toContain("[template:");
  });

  it("falls back to a tidy label + args for an unknown template id", () => {
    expect(presentTemplate("mystery_v9", ["A", "B"], "A · B")).toEqual({
      label: "Template message",
      body: "A · B",
      known: false,
    });
  });

  it("shows args as-is when the arg count doesn't match the template (e.g. SMS)", () => {
    const text = "Hi Cooper, your Full Groom is confirmed.";
    const { label, body, known } = presentTemplate(
      "booking_confirmed_v1",
      [text],
      text,
    );
    expect(known).toBe(true);
    expect(label).toBe("Booking Confirmation");
    expect(body).toBe(text);
  });

  it("never leaks the raw placeholder syntax", () => {
    expect(presentTemplate("unknown", [], "").body).not.toContain("[template:");
  });
});
