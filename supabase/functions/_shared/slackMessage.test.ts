// ============================================================
// Unit tests for the #salon-today message builder and dedupe keys.
//
// Runs under `deno test` — see the agent-tests job in .github/workflows/ci.yml.
//
// Run locally:
//   deno test --node-modules-dir=none supabase/functions/_shared/slackMessage.test.ts
//
// The privacy suite at the bottom is the point of this file. The salon's hard
// rule is that no customer name, phone number, address or note reaches Slack;
// these tests make that a build failure rather than a code-review hope.
// ============================================================
import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  type AlertInput,
  ALERT_SEVERITY,
  type BookingSubject,
  buildAlertText,
  buildDedupeKey,
  describeDog,
  summaryShape,
} from "./slackMessage.ts";

const alfie: BookingSubject = {
  id: "b-1",
  slot: "10:00",
  dogName: "Alfie",
  size: "small",
  breed: "Yorkshire Terrier",
};

// ── Message shapes ─────────────────────────────────────────────────────

Deno.test("cancellation names the freed slot and nothing about the dog", () => {
  const text = buildAlertText({
    type: "cancellation",
    booking: { ...alfie, slot: "09:30" },
    bookingDate: "2026-06-15",
  });
  assertEquals(
    text,
    "\u{1F534} Cancellation — 09:30 slot now free · " +
      "<https://smarterdog.co.uk/staff/today?booking=b-1|Open booking>",
  );
  // A cancellation is about a freed slot; naming the dog adds nothing
  // operationally and makes the one alert allowed to post overnight the
  // most identifying one in the channel.
  assert(!text.includes("Alfie"));
});

Deno.test("moved off today reports the slot it left, not where it went", () => {
  const text = buildAlertText({
    type: "moved_off",
    booking: { ...alfie, slot: "14:00" },
    previousDate: "2026-06-15",
    previousSlot: "09:30",
  });
  assertStringIncludes(text, "Moved off today — was 09:30, slot now free");
  assert(!text.includes("14:00"));
});

Deno.test("a new booking carries time, dog, size and breed", () => {
  assertEquals(
    buildAlertText({ type: "new_booking", booking: alfie, bookingDate: "2026-06-15" }),
    "\u{1F7E1} New booking — 10:00 · Alfie (small, Yorkshire Terrier) · " +
      "<https://smarterdog.co.uk/staff/today?booking=b-1|Open booking>",
  );
});

Deno.test("a booking moved in from another day says so", () => {
  assertStringIncludes(
    buildAlertText({
      type: "moved_in",
      booking: alfie,
      bookingDate: "2026-06-15",
      sameDayMove: false,
    }),
    "Moved into today — 10:00",
  );
});

Deno.test("a same-day time change says 'Time changed', not 'Moved into today'", () => {
  // The booking was already on today; only its slot moved. Saying it moved
  // INTO today would simply be untrue.
  const text = buildAlertText({
    type: "moved_in",
    booking: alfie,
    bookingDate: "2026-06-15",
    sameDayMove: true,
  });
  assertStringIncludes(text, "Time changed — now 10:00");
  assert(!text.includes("Moved into today"));
});

Deno.test("no-show quotes the slot that was missed", () => {
  assertEquals(
    buildAlertText({
      type: "no_show",
      booking: { ...alfie, slot: "09:00" },
      bookingDate: "2026-06-15",
    }),
    "\u{1F534} No-show? — 09:00 booking not checked in · " +
      "<https://smarterdog.co.uk/staff/today?booking=b-1|Open booking>",
  );
});

Deno.test("ready-too-long names the dog and the real waiting time", () => {
  assertStringIncludes(
    buildAlertText({
      type: "ready_overdue",
      booking: alfie,
      bookingDate: "2026-06-15",
      minutesWaiting: 52,
    }),
    "Dog in Ready for 52 min — Alfie",
  );
});

Deno.test("an unanswered message links the conversation and names nobody", () => {
  const text = buildAlertText({
    type: "unanswered",
    conversationId: "c-9",
    minutesWaiting: 34,
    lastInboundAt: "2026-06-15T09:00:00Z",
  });
  assertEquals(
    text,
    "\u{1F7E1} Unanswered message — 34 min · " +
      "<https://smarterdog.co.uk/staff/inbox?conversation=c-9|Open conversation>",
  );
});

// ── Morning summary ────────────────────────────────────────────────────

const summary = (over: Partial<Extract<AlertInput, { type: "summary" }>> = {}) =>
  buildAlertText({
    type: "summary",
    date: "2026-06-15",
    isOpen: true,
    bookings: 9,
    cap: 14,
    firstSlot: "08:30",
    lastSlot: "13:00",
    ...over,
  } as AlertInput);

Deno.test("a normal day reports count, first, last and dogs free", () => {
  assertEquals(
    summary(),
    "\u{1F7E2} Today: 9 bookings · first 08:30 · last 13:00 · 5 dogs free",
  );
});

Deno.test("a quiet day appends the percentage", () => {
  // 5 of 14 is 35.7% — under the 40% line.
  assertStringIncludes(summary({ bookings: 5 }), "Quiet day — 36% of capacity");
});

Deno.test("six of fourteen is not quiet", () => {
  // 42.9% — over the line. The boundary matters at this scale.
  assert(!summary({ bookings: 6 }).includes("Quiet day"));
});

Deno.test("a full day says so instead of quoting a percentage", () => {
  const text = summary({ bookings: 14 });
  assertStringIncludes(text, "Full — no space left");
  assert(!text.includes("% of capacity"));
});

Deno.test("an over-booked day still reads as full, never negative free", () => {
  const text = summary({ bookings: 16 });
  assertStringIncludes(text, "0 dogs free");
  assertStringIncludes(text, "Full — no space left");
});

Deno.test("a closed day posts a closed notice rather than a zero summary", () => {
  assertEquals(
    summary({ isOpen: false, bookings: 0, cap: 0, firstSlot: null, lastSlot: null }),
    "\u{1F7E2} Today: salon closed · 0 bookings",
  );
});

Deno.test("an empty open day omits first and last but still counts", () => {
  assertEquals(
    summary({ bookings: 0, firstSlot: null, lastSlot: null }),
    "\u{1F7E2} Today: 0 bookings · 14 dogs free · Quiet day — 0% of capacity",
  );
});

Deno.test("singulars read correctly", () => {
  assertStringIncludes(summary({ bookings: 1 }), "Today: 1 booking ·");
  assertStringIncludes(summary({ bookings: 13 }), "1 dog free");
});

Deno.test("summaryShape draws the quiet and full lines where expected", () => {
  assertEquals(summaryShape(5, 14).tone, "quiet");
  assertEquals(summaryShape(6, 14).tone, "normal");
  assertEquals(summaryShape(14, 14).tone, "full");
  assertEquals(summaryShape(0, 0).tone, "normal"); // closed: no division by zero
  assertEquals(summaryShape(9, 14).dogsFree, 5);
});

// ── Dog descriptor ─────────────────────────────────────────────────────

Deno.test("describeDog degrades gracefully as facts go missing", () => {
  assertEquals(describeDog(alfie), "Alfie (small, Yorkshire Terrier)");
  assertEquals(describeDog({ ...alfie, breed: null }), "Alfie (small)");
  assertEquals(describeDog({ ...alfie, breed: null, size: null }), "Alfie");
  assertEquals(describeDog({ ...alfie, dogName: null }), "Dog (small, Yorkshire Terrier)");
  assertEquals(describeDog({ ...alfie, dogName: "  ", breed: "  " }), "Dog (small)");
});

// ── Dedupe keys ────────────────────────────────────────────────────────

Deno.test("a cancellation is keyed on the booking alone — it can only happen once", () => {
  assertEquals(
    buildDedupeKey({ type: "cancellation", booking: alfie, bookingDate: "2026-06-15" }),
    "cancel:b-1",
  );
});

Deno.test("the no-show key is per booking per day, so the 5-minute sweep posts once", () => {
  const key = buildDedupeKey({
    type: "no_show",
    booking: alfie,
    bookingDate: "2026-06-15",
  });
  assertEquals(key, "noshow:b-1:2026-06-15");
  // The same booking, swept again five minutes later, yields the same key.
  assertEquals(
    buildDedupeKey({ type: "no_show", booking: alfie, bookingDate: "2026-06-15" }),
    key,
  );
});

Deno.test("the ready key is per booking per day for the same reason", () => {
  assertEquals(
    buildDedupeKey({
      type: "ready_overdue",
      booking: alfie,
      bookingDate: "2026-06-15",
      minutesWaiting: 45,
    }),
    "ready:b-1:2026-06-15",
  );
  // The minute count climbs each sweep; the key must not follow it, or the
  // alert would repost every five minutes with a bigger number.
  assertEquals(
    buildDedupeKey({
      type: "ready_overdue",
      booking: alfie,
      bookingDate: "2026-06-15",
      minutesWaiting: 90,
    }),
    "ready:b-1:2026-06-15",
  );
});

Deno.test("a new booking key includes the slot, so a second time change re-alerts", () => {
  const first = buildDedupeKey({
    type: "moved_in",
    booking: { ...alfie, slot: "11:00" },
    bookingDate: "2026-06-15",
    sameDayMove: true,
  });
  const second = buildDedupeKey({
    type: "moved_in",
    booking: { ...alfie, slot: "12:00" },
    bookingDate: "2026-06-15",
    sameDayMove: true,
  });
  assert(first !== second, "a move to a different slot must be a fresh alert");
});

Deno.test("the unanswered key follows the inbound message, not the conversation", () => {
  const base = {
    type: "unanswered" as const,
    conversationId: "c-9",
    minutesWaiting: 34,
  };
  const first = buildDedupeKey({ ...base, lastInboundAt: "2026-06-15T09:00:00Z" });
  // Same unanswered message, swept again — must stay quiet.
  assertEquals(
    buildDedupeKey({ ...base, minutesWaiting: 39, lastInboundAt: "2026-06-15T09:00:00Z" }),
    first,
  );
  // A NEW message from the customer must break through, even though staff
  // replied to the previous one in between.
  assert(
    buildDedupeKey({ ...base, lastInboundAt: "2026-06-15T11:00:00Z" }) !== first,
  );
});

Deno.test("the morning summary is keyed once per day", () => {
  assertEquals(
    buildDedupeKey({
      type: "summary",
      date: "2026-06-15",
      isOpen: true,
      bookings: 9,
      cap: 14,
      firstSlot: "08:30",
      lastSlot: "13:00",
    }),
    "summary:2026-06-15",
  );
});

// ── Severity ───────────────────────────────────────────────────────────

Deno.test("severity emoji match the brief's event table", () => {
  const red = "\u{1F534}";
  const amber = "\u{1F7E1}";
  const green = "\u{1F7E2}";
  assertEquals(ALERT_SEVERITY.cancellation, "act");
  assertEquals(ALERT_SEVERITY.no_show, "act");
  assertEquals(ALERT_SEVERITY.new_booking, "notice");
  assertEquals(ALERT_SEVERITY.ready_overdue, "notice");
  assertEquals(ALERT_SEVERITY.summary, "good");
  assert(
    buildAlertText({ type: "cancellation", booking: alfie, bookingDate: "2026-06-15" })
      .startsWith(red),
  );
  assert(
    buildAlertText({ type: "new_booking", booking: alfie, bookingDate: "2026-06-15" })
      .startsWith(amber),
  );
  assert(
    buildAlertText({
      type: "summary",
      date: "2026-06-15",
      isOpen: true,
      bookings: 9,
      cap: 14,
      firstSlot: "08:30",
      lastSlot: "13:00",
    }).startsWith(green),
  );
});

// ── Privacy: the hard rule ─────────────────────────────────────────────

/**
 * Every alert type, built with a subject whose dog fields are stuffed with
 * the kind of data that must never escape. If a builder ever starts echoing
 * a field it should not, or a future call site widens BookingSubject, these
 * assertions fail.
 */
const everyAlert = (booking: BookingSubject): AlertInput[] => [
  { type: "cancellation", booking, bookingDate: "2026-06-15" },
  { type: "moved_off", booking, previousDate: "2026-06-15", previousSlot: "09:30" },
  { type: "new_booking", booking, bookingDate: "2026-06-15" },
  { type: "moved_in", booking, bookingDate: "2026-06-15", sameDayMove: false },
  { type: "no_show", booking, bookingDate: "2026-06-15" },
  { type: "ready_overdue", booking, bookingDate: "2026-06-15", minutesWaiting: 45 },
  {
    type: "unanswered",
    conversationId: "c-9",
    minutesWaiting: 34,
    lastInboundAt: "2026-06-15T09:00:00Z",
  },
  {
    type: "summary",
    date: "2026-06-15",
    isOpen: true,
    bookings: 9,
    cap: 14,
    firstSlot: "08:30",
    lastSlot: "13:00",
  },
];

Deno.test("no alert can contain an owner name, phone, address or note", () => {
  // These strings exist on the bookings/humans rows the sweep reads. None of
  // them is reachable from BookingSubject, and none may appear in output.
  const forbidden = [
    "Catherine",
    "Green",
    "07700900123",
    "+447700900123",
    "12 Example Street",
    "owes for last visit",
  ];
  for (const input of everyAlert(alfie)) {
    const text = buildAlertText(input);
    for (const secret of forbidden) {
      assert(
        !text.includes(secret),
        `${input.type} leaked "${secret}": ${text}`,
      );
    }
  }
});

Deno.test("no alert contains anything that looks like a UK phone number", () => {
  const phoneish = /(\+?44\d{9,10}|\b07\d{9}\b)/;
  for (const input of everyAlert(alfie)) {
    const text = buildAlertText(input);
    assert(!phoneish.test(text), `${input.type} looks like it leaked a phone: ${text}`);
  }
});

Deno.test("no alert contains an email address", () => {
  for (const input of everyAlert(alfie)) {
    assert(!/[^\s]+@[^\s]+\.[a-z]{2,}/i.test(buildAlertText(input)));
  }
});

Deno.test("alerts carry only the booking id in their link, never a dog or owner id", () => {
  const text = buildAlertText({
    type: "new_booking",
    booking: alfie,
    bookingDate: "2026-06-15",
  });
  assertStringIncludes(text, "?booking=b-1");
  assert(!text.includes("dog_id"));
  assert(!text.includes("human"));
});
