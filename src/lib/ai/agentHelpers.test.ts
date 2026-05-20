import { describe, it, expect } from "vitest";
import { isPositiveConfirm } from "../../../supabase/functions/_shared/agentHelpers";

describe("isPositiveConfirm", () => {
  describe("matches the canonical UK confirmations", () => {
    const canonical = [
      "yes",
      "yeah",
      "yep",
      "yup",
      "yeh",
      "that's right",
      "thats right",
      "thats it",
      "that's it",
      "correct",
      "perfect",
      "all good",
      "sounds good",
      "sounds right",
      "looks good",
      "go ahead",
      "all correct",
    ];
    it.each(canonical)("'%s' is a positive confirmation", (token) => {
      expect(isPositiveConfirm(token)).toBe(true);
    });
  });

  it("matches when the token is followed by a space and trailing text", () => {
    expect(isPositiveConfirm("yes please")).toBe(true);
    expect(isPositiveConfirm("sounds good thanks")).toBe(true);
  });

  it("matches when the token is followed by punctuation", () => {
    expect(isPositiveConfirm("yes.")).toBe(true);
    expect(isPositiveConfirm("yep,")).toBe(true);
  });

  it("is case-insensitive and tolerates leading/trailing whitespace", () => {
    expect(isPositiveConfirm("YES")).toBe(true);
    expect(isPositiveConfirm("   Yeah   ")).toBe(true);
  });

  it("rejects empty / whitespace input", () => {
    expect(isPositiveConfirm("")).toBe(false);
    expect(isPositiveConfirm("   ")).toBe(false);
  });

  it("does not match Irish/UK colloquial 'ye' (= 'you')", () => {
    // The whole point of dropping "ye" from POSITIVE_TOKENS — false
    // positives here would silently auto-book on "ye lookin to book?".
    expect(isPositiveConfirm("ye")).toBe(false);
    expect(isPositiveConfirm("ye know what i mean")).toBe(false);
  });

  it("does not match negative/unrelated phrases", () => {
    expect(isPositiveConfirm("no")).toBe(false);
    expect(isPositiveConfirm("not now")).toBe(false);
    expect(isPositiveConfirm("maybe later")).toBe(false);
    expect(isPositiveConfirm("can we change the time?")).toBe(false);
  });

  it("only matches tokens at the start of the message", () => {
    // Avoid false positives on long messages that happen to contain a
    // positive token mid-sentence.
    expect(isPositiveConfirm("I don't think yes is the right answer")).toBe(false);
    expect(isPositiveConfirm("not correct")).toBe(false);
  });

  it("requires word boundary after the token, not just prefix match", () => {
    // "yesterday" must NOT match "yes" — without the space/. /, gate
    // the heuristic would auto-book on time-words.
    expect(isPositiveConfirm("yesterday")).toBe(false);
    expect(isPositiveConfirm("yesman")).toBe(false);
  });
});
