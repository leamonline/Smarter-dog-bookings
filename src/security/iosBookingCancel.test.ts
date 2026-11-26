import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The iPhone app's cancel step (ios/SmarterDog/BookingCancel.swift) mirrors the website's
// (src/components/customer/BookingCard.jsx) and the database's cancel_customer_booking. The
// website is the reference for the words, and the newest migration for the rules. These tests
// fail if the two drift.

const root = join(__dirname, "..", "..");
const swift = readFileSync(join(root, "ios/SmarterDog/BookingCancel.swift"), "utf8");
const card = readFileSync(join(root, "src/components/customer/BookingCard.jsx"), "utf8");

/** The newest migration that defines the given function (later migrations replace earlier ones). */
function latestDefinition(fn: RegExp): string {
  const dir = join(root, "supabase/migrations");
  const files = readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
  const defining = files.filter((name) => fn.test(readFileSync(join(dir, name), "utf8")));
  expect(defining.length).toBeGreaterThan(0);
  return readFileSync(join(dir, defining.at(-1)!), "utf8");
}

const latestCancelImpl = () =>
  latestDefinition(/create or replace function smarter_dog_private\.cancel_booking_impl\s*\(/i);

function swiftString(name: string): string | undefined {
  return swift.match(new RegExp(`static let ${name} = "([^"]*)"`))?.[1];
}

describe("iPhone cancel mirrors the website and the database", () => {
  it("offers the website's reasons, in the same order", () => {
    const start = card.indexOf('aria-label="Reason for cancelling"');
    const select = card.slice(start, card.indexOf("</Select>", start));
    const website = [...select.matchAll(/<option value="([^"]+)">/g)].map((match) => match[1]);
    const line = swift.match(/static let choices = \[(.*)\]/)?.[1] ?? "";
    const phone = [...line.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    // The Swift list names "Other" through its constant.
    expect(line.endsWith("other")).toBe(true);
    expect([...phone, "Other"]).toEqual(website);
  });

  it("uses the website's words for each refusal", () => {
    const fn = card.slice(card.indexOf("function friendlyCancellationError"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    const lines = [...body.matchAll(/return "([^"]+)";/g)].map((match) => match[1]);
    expect(lines).toHaveLength(3);
    expect(body).toContain('error?.code === "SDC01"');
    expect(body).toContain('error?.code === "SDC02"');
    expect(swiftString("switchedOff")).toBe(lines[0]);
    expect(swiftString("tooClose")).toBe(lines[1]);
    expect(swiftString("generic")).toBe(lines[2]);
  });

  it("caps the reason at the length the database accepts", () => {
    const sql = latestCancelImpl();
    expect(sql).toContain("char_length(v_reason) > 500");
    expect(swift).toContain("static let maxLength = 500");
  });

  it("offers Cancel only for the status the database will cancel", () => {
    const sql = latestCancelImpl();
    // The server refuses unless every booking in the visit is exactly 'Booked'.
    expect(sql).toContain("count(*) filter (where b.status = 'Booked')");
    expect(swift).toContain("visit.allSatisfy({ $0.status == BookingStatusName.booked })");
    // The website follows the same rule, so neither offers a button the server refuses.
    expect(card).toContain("visitRows.every((booking) => booking.status === BOOKING_STATUS.BOOKED)");
  });

  it("sends the same parameters the database takes", () => {
    const signature =
      /create or replace function public\.cancel_customer_booking\(p_booking_id uuid, p_reason text\)/i;
    expect(latestDefinition(signature)).toMatch(signature);
    expect(swift).toContain("var p_booking_id: String");
    expect(swift).toContain("var p_reason: String");
  });

  it("never shows a raw database message", () => {
    expect(swift).not.toMatch(/refused\(message: (message|object|details)/);
    expect(swift).toContain("return .refused(message: CancelCopy.refusal(code: code))");
  });
});
