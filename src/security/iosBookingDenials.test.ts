import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_REFUSAL_REASONS,
  DENIAL_REASON_LABELS,
  friendlyDenialMessage,
  mapDenialReason,
} from "../engine/denials";

// The iPhone app's refusal mapping (ios/SmarterDog/BookingModels.swift) mirrors
// src/engine/denials.ts. The website is the reference. These tests fail if the two
// drift: the reason codes, the customer copy, the account refusals, and the
// message-to-code table that the Swift tests also read.

const root = join(__dirname, "..", "..");
const swift = readFileSync(join(root, "ios/SmarterDog/BookingModels.swift"), "utf8");


describe("iPhone booking refusals mirror the website", () => {
  it("knows exactly the website's reason codes, unknown last", () => {
    const line = swift.match(/static let reasonCodes: \[String\] = \[(.*)\]/)?.[1] ?? "";
    const codes = [...line.matchAll(/"([a-z_0-9]+)"/g)].map((match) => match[1]);
    expect(codes).toEqual(Object.keys(DENIAL_REASON_LABELS));
    expect(codes.at(-1)).toBe("unknown");
  });

  it("uses the website's account refusals", () => {
    const text = swift.slice(swift.indexOf("static let accountRefusals"));
    const body = text.slice(0, text.indexOf("]") + 1);
    const codes = [...body.matchAll(/"([a-z_0-9]+)"/g)].map((match) => match[1]);
    expect(new Set(codes)).toEqual(new Set(ACCOUNT_REFUSAL_REASONS));
  });

  it("shows the website's words for every code, and the generic line for unknown", () => {
    const text = swift.slice(swift.indexOf("static let customerCopy"));
    const table = text.slice(0, text.indexOf("\n    ]") + 6);
    const copy = new Map(
      [...table.matchAll(/^\s+"([a-z_0-9]+)": "([^"]*)",$/gm)].map((match) => [match[1], match[2]]),
    );
    for (const code of Object.keys(DENIAL_REASON_LABELS).filter((name) => name !== "unknown")) {
      expect(copy.get(code), code).toBe(friendlyDenialMessage(null, code));
    }
    expect(copy.size).toBe(Object.keys(DENIAL_REASON_LABELS).length - 1);
    const generic = swift.match(/static let genericCopy = "([^"]*)"/)?.[1];
    expect(generic).toBe(friendlyDenialMessage("nothing recognisable", null));
  });

  it("maps the shared message table the same way the website does", () => {
    const cases = JSON.parse(
      readFileSync(join(root, "ios/AuthCoreTests/denial-cases.json"), "utf8"),
    ) as { message: string | null; details: string | null; reason: string }[];
    expect(cases.length).toBeGreaterThan(20);
    for (const row of cases) {
      expect(mapDenialReason(row.message, row.details), JSON.stringify(row)).toBe(row.reason);
    }
  });

  it("never shows a raw database message", () => {
    expect(swift).toContain("customerCopy[reason(message: message, details: details)] ?? genericCopy");
  });
});
