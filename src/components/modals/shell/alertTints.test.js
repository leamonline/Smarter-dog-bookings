import { describe, expect, it } from "vitest";
import { ALERT_OPTIONS } from "../../../constants/index";
import { ALERT_TINTS, alertTint } from "./alertTints.js";

describe("alert tint semantics", () => {
  it.each([
    ["Bites / Nips", "behaviour"],
    ["Reactive to dogs", "behaviour"],
    ["Kennel aggressive", "behaviour"],
    ["Nervous / Anxious", "caution"],
    ["Fear of dryer", "caution"],
    ["Sensitive paws", "caution"],
    ["Senior (Needs breaks)", "information"],
  ])("%s uses %s instead of matching a colour string", (label, tone) => {
    const option = ALERT_OPTIONS.find((item) => item.label === label);
    expect(option?.tone).toBe(tone);
    expect(alertTint(label)).toBe(ALERT_TINTS[tone]);
  });

  it("unknown alert names fail to the visible behavioural warning style", () => {
    expect(alertTint("Unexpected alert")).toBe(ALERT_TINTS.behaviour);
  });
});
