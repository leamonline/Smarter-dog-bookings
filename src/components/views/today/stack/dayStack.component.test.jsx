// The day stack's rendering contract.
//
// Ordering and timing are unit-tested in src/engine/dayStack.test.ts, and the
// wallet geometry in stackLayout.test.ts. This file is about what a member of
// staff can actually see and reach: what the 72px strip says, that colour is
// never carrying a meaning on its own, that the safety note is readable without
// a tap, and that lifting a card out and putting it back behaves — focus,
// scroll, Escape, the pile and the browser's Back button included.
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { DayStack } from "./DayStack.jsx";
import { buildDayStack } from "../../../../engine/dayStack";
import { buildDailyBriefBoard } from "../../../../engine/dailyBrief";
import { BOARD_ZONES, buildBoardTokens } from "../../../../engine/salonBoard";
import { BOOKING_STATUS, NO_SHOW_REASON } from "../../../../constants/index";

const NOW = new Date("2026-07-02T09:15:00Z"); // 10:15 London, BST
const TODAY = "2026-07-02";

function agoIso(minutes) {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

const BOOKINGS = [
  {
    id: "arriving",
    dogName: "Hugo",
    slot: "11:00",
    status: BOOKING_STATUS.BOOKED,
    service: "full-groom",
    payment: "Due at Pick-up",
    _dogId: "d1",
    _ownerId: "h1",
    _bookingDate: TODAY,
  },
  {
    id: "bathing",
    dogName: "Nell",
    slot: "09:30",
    status: BOOKING_STATUS.ARRIVED,
    service: "full-groom",
    payment: "Due at Pick-up",
    checkedInAt: agoIso(95),
    notes: "Check ears, she was sore last time.",
    _dogId: "d2",
    _bookingDate: TODAY,
  },
  {
    id: "waiting",
    dogName: "Bramble",
    slot: "08:30",
    status: BOOKING_STATUS.READY_FOR_COLLECTION,
    service: "full-groom",
    size: "small",
    payment: "Due at Pick-up",
    readyAt: agoIso(70),
    _dogId: "d3",
    _bookingDate: TODAY,
  },
  {
    id: "absent",
    dogName: "Otto",
    slot: "10:00",
    status: BOOKING_STATUS.NO_SHOW,
    cancelReason: NO_SHOW_REASON,
    service: "full-groom",
    _dogId: "d4",
    _bookingDate: TODAY,
  },
];

const WELFARE = {
  d2: { alerts: ["Bites / Nips"], pregnant: false, notes: "", groomNotes: "Teddy bear cut, short on ears." },
};

/** The same token map TodayView builds, so actions come from the real engine. */
function tokenMap(bookings = BOOKINGS) {
  const board = buildDailyBriefBoard(bookings, TODAY, NOW);
  const tokens = buildBoardTokens({ board, now: NOW, isToday: true });
  const map = new Map();
  for (const zone of BOARD_ZONES) {
    for (const token of tokens[zone] || []) map.set(String(token.booking.id), token);
  }
  for (const row of buildDayStack({ bookings, dateStr: TODAY, now: NOW })) {
    if (row.entry.stage === "noShow" && !map.has(row.id)) {
      map.set(row.id, { booking: row.booking, entry: row.entry, zone: null });
    }
  }
  return map;
}

function renderStack(props = {}) {
  const rows = buildDayStack({
    bookings: BOOKINGS,
    dateStr: TODAY,
    now: NOW,
    breedById: { bathing: "Cocker spaniel", waiting: "Cockapoo" },
  });
  return render(
    <DayStack
      rows={rows}
      resolve={(b) => ({
        dogName: b.dogName,
        breed: "",
        owner: "Priya Raman",
        ownerPhone: "07700 900377",
        dogMissing: false,
        ownerMissing: false,
      })}
      getWelfare={(b) => WELFARE[b._dogId] || { alerts: [], pregnant: false, notes: "" }}
      paymentOf={(b) => (b.id === "waiting"
        ? { kind: "due", amountDue: 42, subtotal: 42 }
        : { kind: "due", amountDue: 42, subtotal: 42 })}
      lastVisitFor={() => "2026-06-12"}
      {...props}
    />,
  );
}

const card = (id) => document.querySelector(`[data-booking-id="${id}"]`);
const head = (id) => card(id).querySelector("[data-stack-head]");
const pile = () => document.querySelector("[data-stack-pile]");

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the dog's photo", () => {
  it("sits in the lifted view, never the strip, and only for a dog that has one", () => {
    renderStack({ photoPathFor: (b) => (b._dogId === "d2" ? "d2/photo.jpg" : null) });
    // The strip is the 72px every card shows; the photo must not crowd it.
    expect(head("bathing").querySelector("[data-staff-dog-photo]")).toBeNull();
    fireEvent.click(head("bathing"));
    expect(card("bathing").querySelector("[data-staff-dog-photo]")?.textContent).toBe("N");
    fireEvent.click(head("bathing"));
    fireEvent.click(head("arriving"));
    expect(card("arriving").querySelector("[data-staff-dog-photo]")).toBeNull();
  });
});

// ---- The strip ----------------------------------------------------------------
//
// Line 1: time · dog name ··· status pill. Line 2: breed · service · owner
// surname, truncating with an ellipsis. Everything essential lives here.

describe("the 72px strip", () => {
  it("says time, dog name and status on the first line", () => {
    renderStack();
    const line1 = head("bathing").querySelector(".wallet-line-1");
    expect(line1.querySelector(".wallet-time").textContent).toBe("09:30");
    expect(line1.querySelector(".wallet-name").textContent).toBe("Nell");
    const pill = line1.querySelector("[data-status-variant='pill']");
    expect(pill.textContent).toBe("Arrived");
  });

  it("says breed, service and the owner's surname on the second, truncating rather than wrapping", () => {
    renderStack();
    const subtitle = head("bathing").querySelector("[data-stack-subtitle]");
    expect(subtitle.textContent).toBe("Cocker spaniel · Full Groom · Raman");
    expect(head("bathing").querySelector("[data-stack-meta]").className).toContain("truncate");
  });

  it("is the card's only tap target: one button, with aria-expanded", () => {
    renderStack();
    const target = card("bathing");
    const outsideTheFullView = [...target.querySelectorAll("button, a, [tabindex]")]
      .filter((el) => !el.closest("[data-stack-details]"));
    expect(outsideTheFullView).toEqual([head("bathing")]);
    expect(head("bathing").tagName).toBe("BUTTON");
    expect(head("bathing").getAttribute("aria-expanded")).toBe("false");
  });

  it("gives two dogs in the same slot a card each, each with its time", () => {
    const pair = [
      { ...BOOKINGS[0], id: "first", dogName: "Pip" },
      { ...BOOKINGS[0], id: "second", dogName: "Squeak" },
    ];
    renderStack({ rows: buildDayStack({ bookings: pair, dateStr: TODAY, now: NOW }) });
    expect(head("first").querySelector(".wallet-time").textContent).toBe("11:00");
    expect(head("second").querySelector(".wallet-time").textContent).toBe("11:00");
  });

  it("shows the face of the last card, read-only and out of the accessibility tree", () => {
    renderStack();
    const face = card("bathing").querySelector("[data-stack-face]");
    expect(face.textContent).toBe("Check ears, she was sore last time.");
    expect(face.getAttribute("aria-hidden")).toBe("true");
    expect(face.querySelector("button, a, input")).toBeNull();
  });
});

describe("the countdown", () => {
  it("appears on exactly one card, the next dog not yet arrived", () => {
    renderStack();
    const countdowns = document.querySelectorAll("[data-countdown='true']");
    expect(countdowns).toHaveLength(1);
    expect(countdowns[0].closest("[data-stack-card]").dataset.bookingId).toBe("arriving");
    expect(countdowns[0].textContent).toBe("in 45 min");
  });

  it("is gone from every other card, and nothing anywhere says 'away'", () => {
    renderStack();
    expect(document.body.textContent).not.toMatch(/min away/);
    expect(card("bathing").querySelector("[data-countdown]")).toBeNull();
  });

  it("refreshes with the minute and leaves a dog once it is checked in", () => {
    const { rerender } = renderStack();
    const at = (now, bookings = BOOKINGS) => buildDayStack({ bookings, dateStr: TODAY, now });
    const props = (rows) => ({
      rows,
      resolve: (b) => ({ dogName: b.dogName, owner: "Priya Raman", dogMissing: false, ownerMissing: false }),
      getWelfare: () => ({ alerts: [], pregnant: false, notes: "" }),
      paymentOf: () => ({ kind: "due", amountDue: 42, subtotal: 42 }),
      lastVisitFor: () => null,
    });
    rerender(<DayStack {...props(at(new Date(NOW.getTime() + 60_000)))} />);
    expect(card("arriving").querySelector("[data-countdown]").textContent).toBe("in 44 min");

    const checkedIn = BOOKINGS.map((b) => (b.id === "arriving"
      ? { ...b, status: BOOKING_STATUS.ARRIVED, checkedInAt: NOW.toISOString() }
      : b));
    rerender(<DayStack {...props(at(NOW, checkedIn))} />);
    expect(document.querySelectorAll("[data-countdown='true']")).toHaveLength(0);
  });
});

describe("the stack renders the day in time order", () => {
  it("lists active and recoverable bookings, earliest first, and nothing else", () => {
    renderStack();
    const ids = [...document.querySelectorAll("[data-stack-card]")]
      .map((el) => el.getAttribute("data-booking-id"));
    // "absent" is a no-show: it remains in place because staff can recover it.
    expect(ids).toEqual(["waiting", "bathing", "absent", "arriving"]);
  });

  it("shows an empty day as words, not a blank screen", () => {
    render(
      <DayStack
        rows={[]}
        resolve={() => ({})}
        getWelfare={() => ({})}
        paymentOf={() => ({})}
        lastVisitFor={() => null}
      />,
    );
    expect(screen.getByText("No bookings on this date")).toBeTruthy();
  });
});

describe("colour is never the only signal", () => {
  it.each([
    ["waiting", "Ready"],
    ["bathing", "Arrived"],
    ["arriving", "Expected"],
  ])("%s states its status as a word", (id, word) => {
    renderStack();
    expect(within(card(id)).getByText(word)).toBeTruthy();
  });

  it("puts the status into the card's accessible name too", () => {
    renderStack();
    expect(head("waiting").getAttribute("aria-label")).toContain("Ready");
  });

  it("carries urgency as weight on the rule, not as a different hue", () => {
    renderStack();
    // Bramble has waited 70 minutes; Hugo is not due for another 45.
    const overdue = card("waiting");
    const calm = card("arriving");
    expect(parseInt(overdue.style.borderLeftWidth, 10))
      .toBeGreaterThan(parseInt(calm.style.borderLeftWidth, 10));
    // Same hue family on both — the tint is the status, not the urgency.
    expect(overdue.getAttribute("data-status-key")).toBe("ready");
    expect(overdue.style.borderLeftColor).not.toBe(calm.style.borderLeftColor);
  });

  it("adds a clock to a collection that has run long", () => {
    renderStack();
    expect(card("waiting").querySelector("svg")).toBeTruthy();
    expect(head("waiting").getAttribute("aria-label")).toContain("waiting 1 hr 10 min");
  });
});

describe("the safety note", () => {
  it("is readable in the strip before anything is opened, in words", () => {
    renderStack();
    // Not behind the lift, and not an icon with a tooltip.
    expect(head("bathing").getAttribute("aria-expanded")).toBe("false");
    expect(head("bathing").querySelector("[data-stack-safety]").textContent).toBe("Bites / Nips");
  });

  it("leads the second line, so truncation takes the surname before the warning", () => {
    renderStack();
    const meta = head("bathing").querySelector("[data-stack-meta]");
    expect(meta.firstElementChild.hasAttribute("data-stack-safety")).toBe(true);
  });

  it("is spoken as part of the card's one sentence", () => {
    renderStack();
    expect(head("bathing").getAttribute("aria-label")).toContain("Safety note: Bites / Nips");
  });
});

describe("the outstanding balance", () => {
  it("appears from Ready onward, where it blocks the handover", () => {
    renderStack();
    expect(within(card("waiting")).getByText("£42 due")).toBeTruthy();
  });

  it("stays off a dog that has not finished — nobody can act on it yet", () => {
    renderStack();
    expect(within(card("bathing")).queryByText("£42 due")).toBeNull();
    expect(within(card("arriving")).queryByText("£42 due")).toBeNull();
  });

  it("says Paid rather than nothing once there is nothing to take", () => {
    const rows = buildDayStack({ bookings: BOOKINGS, dateStr: TODAY, now: NOW });
    render(
      <DayStack
        rows={rows}
        resolve={(b) => ({ dogName: b.dogName, dogMissing: false, ownerMissing: true })}
        getWelfare={() => ({ alerts: [], pregnant: false, notes: "" })}
        paymentOf={() => ({ kind: "paid", amountDue: 0, subtotal: 42 })}
        lastVisitFor={() => null}
      />,
    );
    expect(within(card("waiting")).getByText("Paid")).toBeTruthy();
  });
});

describe("lifting a card", () => {
  it("lifts it out and reports it", () => {
    renderStack();
    fireEvent.click(head("bathing"));
    expect(head("bathing").getAttribute("aria-expanded")).toBe("true");
    expect(card("bathing").dataset.lifted).toBe("true");
  });

  it("animates the rows, not a height, so the full view fits its own content", () => {
    renderStack();
    const drawer = () => document.getElementById("stack-drawer-bathing");
    expect(drawer().style.gridTemplateRows).toBe("0fr");
    fireEvent.click(head("bathing"));
    expect(drawer().style.gridTemplateRows).toBe("1fr");
  });

  it("collapses every other card into an inert pile with one way back", () => {
    renderStack();
    fireEvent.click(head("bathing"));
    for (const id of ["waiting", "absent", "arriving"]) {
      expect(card(id).dataset.inPile).toBe("true");
      expect(card(id).hasAttribute("inert")).toBe(true);
    }
    expect(card("bathing").hasAttribute("inert")).toBe(false);
    expect(pile().getAttribute("aria-label")).toBe("Back to the day — 3 other dogs");
  });

  it("moves focus into the lifted card", () => {
    renderStack();
    fireEvent.click(head("bathing"));
    expect(document.activeElement).toBe(card("bathing").querySelector("[data-stack-details]"));
    expect(document.activeElement.getAttribute("aria-label")).toBe("Nell — details");
  });

  it("keeps the full view out of reach until the card is lifted", () => {
    renderStack();
    const inner = (id) => document.getElementById(`stack-drawer-${id}`).firstElementChild;
    expect(inner("bathing").hasAttribute("inert")).toBe(true);
    fireEvent.click(head("bathing"));
    expect(inner("bathing").hasAttribute("inert")).toBe(false);
    expect(inner("waiting").hasAttribute("inert")).toBe(true);
  });

  it("shows notes, owner contact, last visit and price", () => {
    renderStack();
    fireEvent.click(head("bathing"));
    const open = within(card("bathing").querySelector("[data-stack-details]"));
    expect(open.getByText("Check ears, she was sore last time.")).toBeTruthy();
    expect(open.getByText("Priya Raman")).toBeTruthy();
    expect(open.getByText("07700 900377")).toBeTruthy();
    expect(open.getByText("12 June")).toBeTruthy();
    expect(open.getByText("£42")).toBeTruthy();
  });

  it("shows the dog's usual groom notes beside the visit note", () => {
    renderStack();
    fireEvent.click(head("bathing"));
    const open = within(card("bathing"));
    expect(open.getByText("Usual groom:")).toBeTruthy();
    const notes = open.getByText("Teddy bear cut, short on ears.");
    expect(notes).toBeTruthy();
    // Notes come from a textarea; line breaks between instructions must survive.
    expect(notes.closest("p").className).toContain("whitespace-pre-wrap");
  });

  it("omits the usual-groom line when the dog has no standing notes", () => {
    renderStack();
    fireEvent.click(head("waiting"));
    expect(within(card("waiting")).queryByText("Usual groom:")).toBeNull();
  });

  it("links the phone number so it can be dialled one-handed", () => {
    renderStack();
    fireEvent.click(head("bathing"));
    const link = within(card("bathing").querySelector("[data-stack-details]")).getByText("07700 900377");
    expect(link.getAttribute("href")).toBe("tel:07700900377");
  });
});

// ---- Putting it back ----------------------------------------------------------
//
// Four ways back, one close: the Close button (or the strip again), the pile,
// Escape and the browser's Back. Each restores the scroll position the page had
// and returns focus to the strip that opened the card.

function renderInScrollport(props = {}) {
  const rows = buildDayStack({ bookings: BOOKINGS, dateStr: TODAY, now: NOW, breedById: {} });
  const utils = render(
    <main>
      <DayStack
        rows={rows}
        resolve={(b) => ({ dogName: b.dogName, owner: "Priya Raman", ownerPhone: "07700 900377", dogMissing: false, ownerMissing: false })}
        getWelfare={() => ({ alerts: [], pregnant: false, notes: "" })}
        paymentOf={() => ({ kind: "due", amountDue: 42, subtotal: 42 })}
        lastVisitFor={() => null}
        {...props}
      />
    </main>,
  );
  return { ...utils, main: document.querySelector("main") };
}

function liftFrom(main, id, scrollTop = 300) {
  main.scrollTop = scrollTop;
  head(id).focus();
  fireEvent.click(head(id));
  // Scrolling the open card is allowed; it must not survive the close.
  main.scrollTop = 40;
}

function expectPutBack(main, id, scrollTop = 300) {
  expect(head(id).getAttribute("aria-expanded")).toBe("false");
  expect(document.querySelectorAll("[data-in-pile='true']")).toHaveLength(0);
  expect(pile()).toBeNull();
  expect(main.scrollTop).toBe(scrollTop);
  expect(document.activeElement).toBe(head(id));
}

describe("putting a lifted card back", () => {
  it("closes from its Close button", () => {
    const { main } = renderInScrollport();
    liftFrom(main, "bathing");
    fireEvent.click(within(card("bathing")).getByRole("button", { name: "Close Nell" }));
    expectPutBack(main, "bathing");
  });

  it("closes from its strip, pressed again", () => {
    const { main } = renderInScrollport();
    liftFrom(main, "bathing");
    fireEvent.click(head("bathing"));
    expectPutBack(main, "bathing");
  });

  it("closes from a tap on the pile", () => {
    const { main } = renderInScrollport();
    liftFrom(main, "bathing");
    fireEvent.click(pile());
    expectPutBack(main, "bathing");
  });

  it("closes on Escape", () => {
    const { main } = renderInScrollport();
    liftFrom(main, "bathing");
    fireEvent.keyDown(document.activeElement, { key: "Escape" });
    expectPutBack(main, "bathing");
  });

  it("leaves Escape to a dialog opened from the card", () => {
    const { main } = renderInScrollport();
    liftFrom(main, "bathing");
    const dialog = document.createElement("div");
    dialog.setAttribute("aria-modal", "true");
    document.body.appendChild(dialog);
    try {
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(head("bathing").getAttribute("aria-expanded")).toBe("true");
    } finally {
      dialog.remove();
    }
  });

  it("closes on the browser's Back button, without stepping back a second time", () => {
    const pushState = vi.spyOn(window.history, "pushState");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { main } = renderInScrollport();
    liftFrom(main, "bathing");
    expect(pushState).toHaveBeenCalledTimes(1);
    expect(pushState.mock.calls[0][0]).toMatchObject({ dayStackLifted: true });
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expectPutBack(main, "bathing");
    // Back already removed the entry the lift pushed.
    expect(back).not.toHaveBeenCalled();
  });

  it("steps back over its own history entry when closed any other way", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { main } = renderInScrollport();
    liftFrom(main, "bathing");
    fireEvent.click(pile());
    expect(back).toHaveBeenCalledTimes(1);
    // The pop that follows is the one we asked for: it must not reopen or
    // close anything else.
    fireEvent.click(head("waiting"));
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    expect(head("waiting").getAttribute("aria-expanded")).toBe("true");
  });

  it("puts the day back if the lifted dog leaves the stack", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { main, rerender } = renderInScrollport();
    liftFrom(main, "bathing");
    const rows = buildDayStack({ bookings: BOOKINGS.filter((b) => b.id !== "bathing"), dateStr: TODAY, now: NOW });
    rerender(
      <main>
        <DayStack
          rows={rows}
          resolve={(b) => ({ dogName: b.dogName, owner: "", dogMissing: false, ownerMissing: true })}
          getWelfare={() => ({ alerts: [], pregnant: false, notes: "" })}
          paymentOf={() => ({ kind: "due", amountDue: 42, subtotal: 42 })}
          lastVisitFor={() => null}
        />
      </main>,
    );
    expect(document.querySelectorAll("[data-in-pile='true']")).toHaveLength(0);
    expect(pile()).toBeNull();
    expect(back).toHaveBeenCalledTimes(1);
  });
});

describe("reduced motion", () => {
  const reduce = () => vi.stubGlobal("matchMedia", (query) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

  it("switches state without a lift animation", () => {
    reduce();
    renderStack();
    expect(document.querySelector("[data-day-stack]").dataset.motion).toBe("reduced");
    expect(card("bathing").style.transition).toBe("none");
    fireEvent.click(head("bathing"));
    // The state still switches: lifted, piled, focus moved.
    expect(card("bathing").dataset.lifted).toBe("true");
    expect(card("bathing").style.transition).toBe("none");
    expect(card("waiting").dataset.inPile).toBe("true");
    expect(document.activeElement).toBe(card("bathing").querySelector("[data-stack-details]"));
  });

  it("animates when motion is allowed", () => {
    renderStack();
    expect(document.querySelector("[data-day-stack]").dataset.motion).toBe("full");
    expect(card("bathing").style.transition).toBe("");
  });
});

describe("highlighting an attention reason", () => {
  it("dims the rest rather than hiding it", () => {
    renderStack({ highlightIds: new Set(["waiting"]) });
    expect(card("waiting").className).toContain("opacity-100");
    expect(card("bathing").className).toContain("opacity-50");
    // Still present: the list has to stay the day.
    expect(card("bathing")).toBeTruthy();
  });

  it("puts a lifted card back for the requested dog, without lifting that one", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { rerender } = renderStack();
    fireEvent.click(head("bathing"));
    expect(card("bathing").dataset.lifted).toBe("true");

    const rows = buildDayStack({ bookings: BOOKINGS, dateStr: TODAY, now: NOW, breedById: {} });
    const props = {
      rows,
      resolve: (b) => ({ dogName: b.dogName, breed: "", owner: "Priya Raman", ownerPhone: "", dogMissing: false, ownerMissing: false }),
      getWelfare: () => ({ alerts: [], pregnant: false, notes: "" }),
      paymentOf: () => ({ kind: "due", amountDue: 42, subtotal: 42 }),
      lastVisitFor: () => null,
    };
    rerender(<DayStack {...props} focusRequest={{ id: "arriving", key: 1 }} />);

    expect(card("bathing").dataset.lifted).toBe("false");
    expect(head("arriving").getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelectorAll("[data-in-pile='true']")).toHaveLength(0);
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("scrolls to the dog again when the same dog is requested again", () => {
    // Highlight a late dog, scroll away, press the segment off and on: the dog
    // is already in front, so no state changes, but the new request must still
    // bring it back into view. jsdom gives <main> no height, so every card
    // counts as off screen and each honoured request scrolls.
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { cb(0); return 1; });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const scrollTo = vi.fn();
    const original = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollTo;
    try {
      const rows = buildDayStack({ bookings: BOOKINGS, dateStr: TODAY, now: NOW, breedById: {} });
      const target = rows.at(-1).id;
      const props = {
        rows,
        resolve: (b) => ({ dogName: b.dogName, breed: "", owner: "", ownerPhone: "", dogMissing: false, ownerMissing: false }),
        getWelfare: () => ({ alerts: [], pregnant: false, notes: "" }),
        paymentOf: () => ({ kind: "due", amountDue: 42, subtotal: 42 }),
        lastVisitFor: () => null,
      };
      const { rerender } = render(<main><DayStack {...props} focusRequest={{ id: target, key: 1 }} /></main>);
      const afterFirst = scrollTo.mock.calls.length;
      expect(afterFirst).toBeGreaterThan(0);
      rerender(<main><DayStack {...props} focusRequest={{ id: target, key: 2 }} /></main>);
      expect(scrollTo.mock.calls.length).toBe(afterFirst + 1);
    } finally {
      HTMLElement.prototype.scrollTo = original;
      vi.restoreAllMocks();
    }
  });

  it("ignores a request for a dog that is not on the day", () => {
    renderStack();
    fireEvent.click(head("bathing"));
    const rows = buildDayStack({ bookings: BOOKINGS, dateStr: TODAY, now: NOW });
    render(
      <DayStack
        rows={rows}
        resolve={(b) => ({ dogName: b.dogName, dogMissing: false, ownerMissing: true })}
        getWelfare={() => ({ alerts: [], pregnant: false, notes: "" })}
        paymentOf={() => ({ kind: "due", amountDue: 42, subtotal: 42 })}
        lastVisitFor={() => null}
        focusRequest={{ id: "not-here", key: 1 }}
      />,
    );
    // The first stack's lifted card is untouched; nothing else changed.
    expect(card("bathing").dataset.lifted).toBe("true");
  });
});

describe("the owner-on-the-way signal", () => {
  it("survived the move off the board, and is spoken", () => {
    renderStack({ onTheWaySignals: { waiting: { onTheWay: true } } });
    expect(within(card("waiting")).getByText("On the way")).toBeTruthy();
    expect(head("waiting").getAttribute("aria-label")).toContain("On the way");
  });
});

// ---- Status transitions -------------------------------------------------------
//
// `tokenActions` is the single source of what is legal. The stack asks it and
// renders the answer; it never invents a transition and never re-orders one.
// These tests pin that relationship rather than the specific list, so a change
// made in the engine shows up here as intended rather than as a surprise.

function renderWithActions(extra = {}) {
  const onAction = vi.fn();
  const utils = renderStack({ tokensById: tokenMap(), onAction, ...extra });
  return { ...utils, onAction };
}

/** Lift a card, read its action labels in render order, and put it back. */
function actionsIn(id, group = null) {
  fireEvent.click(head(id));
  const selector = group ? `[data-stack-actions="${group}"]` : "[data-stack-actions]";
  const labels = [...card(id).querySelectorAll(selector)]
    .flatMap((list) => [...list.querySelectorAll("button, a")].map((el) => el.textContent.trim()));
  fireEvent.click(head(id));
  return labels;
}

function press(id, label) {
  if (head(id).getAttribute("aria-expanded") !== "true") fireEvent.click(head(id));
  fireEvent.click(within(card(id)).getByLabelText(`${label} — ${BOOKINGS.find((b) => b.id === id).dogName}`));
}

describe("the actions a card offers", () => {
  it("offers Call / WhatsApp, the next step and Take payment, in that order, then More", () => {
    renderWithActions();
    fireEvent.click(head("arriving"));
    const groups = [...card("arriving").querySelectorAll("[data-stack-actions]")]
      .map((el) => el.getAttribute("data-stack-actions"));
    expect(groups).toEqual(["contact", "progress", "payment", "more"]);
    fireEvent.click(head("arriving"));
    expect(actionsIn("arriving", "contact")).toEqual(["Call Priya", "WhatsApp Priya"]);
    expect(actionsIn("arriving", "progress")).toEqual(["Check in"]);
    expect(actionsIn("arriving", "payment")).toEqual(["Take £42 payment"]);
  });

  it("offers the next care step on an expected dog", () => {
    renderWithActions();
    expect(actionsIn("arriving")).toContain("Check in");
  });

  it("has no Confirm button — confirmation comes from reminder replies", () => {
    // An unconfirmed booking: the engine would offer Confirm and Reconfirmed.
    const unconfirmed = BOOKINGS.map((b) => (b.id === "arriving"
      ? { ...b, reminderState: "sent", confirmationChannel: "whatsapp" }
      : b));
    renderStack({
      rows: buildDayStack({ bookings: unconfirmed, dateStr: TODAY, now: NOW }),
      tokensById: tokenMap(unconfirmed),
      onAction: vi.fn(),
    });
    const labels = actionsIn("arriving");
    expect(labels).not.toContain("Confirm booking");
    expect(labels).not.toContain("Reconfirmed");
    expect(labels).not.toContain("Unconfirm booking");
    expect(labels).toContain("Check in");
  });

  it("opens the owner's WhatsApp thread in the app, never a wa.me link", () => {
    const { onAction } = renderWithActions();
    press("arriving", "WhatsApp Priya");
    expect(onAction.mock.calls[0][1].id).toBe("message");
    expect(document.querySelector('a[href*="wa.me"]')).toBeNull();
  });

  it("offers the next care step on a dog mid-groom", () => {
    renderWithActions();
    expect(actionsIn("bathing")).toContain("Mark ready");
  });

  it("does not claim that marking ready messages anyone", () => {
    renderWithActions();
    const labels = actionsIn("bathing");
    expect(labels).toContain("Mark ready");
    expect(labels.join(" ")).not.toMatch(/text|message the owner|notif/i);
  });

  it("hands payment and collection to the chain, not the action list", () => {
    renderWithActions();
    const labels = actionsIn("waiting");
    expect(labels).not.toContain("Take £42 payment");
    expect(labels).not.toContain("Mark collected");
    expect(card("waiting").querySelector("[data-checkout-chain]")).toBeTruthy();
  });

  it("keeps the engine's other actions underneath the chain", () => {
    renderWithActions();
    expect(actionsIn("waiting")).toContain("Booking details");
  });

  it("offers a no-show only on a dog that has not arrived", () => {
    renderWithActions();
    expect(actionsIn("arriving")).toContain("Didn't show");
    expect(actionsIn("bathing")).not.toContain("Didn't show");
    expect(actionsIn("waiting")).not.toContain("Didn't show");
  });
});

describe("pressing an action", () => {
  it.each([
    ["arriving", "Check in", "checkIn"],
    ["bathing", "Mark ready", "ready"],
    ["arriving", "Take £42 payment", "payment"],
    ["arriving", "Didn't show", "didntShow"],
  ])("%s → %s runs the %s action", (id, label, actionId) => {
    const { onAction } = renderWithActions();
    press(id, label);
    expect(onAction).toHaveBeenCalledTimes(1);
    const [token, action] = onAction.mock.calls[0];
    expect(String(token.booking.id)).toBe(id);
    expect(action.id).toBe(actionId);
  });

  it("does not put the card back underneath it", () => {
    renderWithActions();
    press("arriving", "Check in");
    expect(head("arriving").getAttribute("aria-expanded")).toBe("true");
  });

  it("is blocked while a write for that dog is in flight", () => {
    const { onAction } = renderWithActions({ busyIds: new Set(["arriving"]) });
    fireEvent.click(head("arriving"));
    const button = within(card("arriving")).getByLabelText("Check in — Hugo");
    expect(button.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(button);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("leaves a different dog's actions alone while one is busy", () => {
    renderWithActions({ busyIds: new Set(["arriving"]) });
    fireEvent.click(head("bathing"));
    expect(
      within(card("bathing")).getByLabelText("Mark ready — Nell").hasAttribute("disabled"),
    ).toBe(false);
  });
});

describe("a no-show", () => {
  it("offers one clear way back into the active day", () => {
    const { onAction } = renderWithActions();
    expect(card("absent")).toBeTruthy();
    expect(actionsIn("absent", "progress")).toEqual(["They turned up"]);

    press("absent", "They turned up");
    expect(onAction).toHaveBeenCalledTimes(1);
    const [token, action] = onAction.mock.calls[0];
    expect(token.zone).toBeNull();
    expect(action.id).toBe("undoNoShow");
  });

  it("offers no price to edit and no invoice to take money on", () => {
    renderStack({ tokensById: tokenMap(), onAction: vi.fn(), onSetPrice: vi.fn(), onOpenInvoice: vi.fn() });
    fireEvent.click(head("absent"));
    expect(within(card("absent")).queryByLabelText(/Change the price for Otto/)).toBeNull();
    expect(within(card("absent")).queryByLabelText("Open full invoice — Otto")).toBeNull();
  });
});

// ---- Check out ----------------------------------------------------------------

function chainLabels(id) {
  const chain = card(id).querySelector("[data-checkout-chain]");
  return chain ? [...chain.querySelectorAll("button")].map((b) => b.textContent.trim()) : [];
}

function pressChain(id, label) {
  fireEvent.click(
    within(card(id)).getByLabelText(`${label} — ${BOOKINGS.find((b) => b.id === id).dogName}`),
  );
}

function renderCheckout(extra = {}) {
  const onCollectWithPayment = vi.fn();
  const utils = renderStack({
    tokensById: tokenMap(),
    onAction: vi.fn(),
    onCollectWithPayment,
    ...extra,
  });
  fireEvent.click(head("waiting"));
  return { ...utils, onCollectWithPayment };
}

describe("the check-out chain", () => {
  it("starts as one button", () => {
    renderCheckout();
    expect(chainLabels("waiting")).toEqual(["Check out"]);
  });

  it("offers the balance by method once started", () => {
    renderCheckout();
    pressChain("waiting", "Check out");
    expect(chainLabels("waiting")).toEqual(["Cash £42", "Card £42", "Back"]);
  });

  it("confirms the method and the figure before writing anything", () => {
    const { onCollectWithPayment } = renderCheckout();
    pressChain("waiting", "Check out");
    pressChain("waiting", "Cash £42");
    expect(chainLabels("waiting")).toEqual(["Collected · £42 cash", "Back"]);
    expect(onCollectWithPayment).not.toHaveBeenCalled();
  });

  it("writes once, on the last press, with the method and the amount taken", () => {
    const { onCollectWithPayment } = renderCheckout();
    pressChain("waiting", "Check out");
    pressChain("waiting", "Card £42");
    pressChain("waiting", "Collected · £42 card");
    expect(onCollectWithPayment).toHaveBeenCalledTimes(1);
    const [booking, payload] = onCollectWithPayment.mock.calls[0];
    expect(booking.id).toBe("waiting");
    expect(payload).toEqual({ method: "card", amountTaken: 42 });
  });

  it("skips the payment step entirely when nothing is owed", () => {
    const { onCollectWithPayment } = renderCheckout({
      paymentOf: () => ({ kind: "paid", amountDue: 0, subtotal: 42, basePrice: 42, addonsTotal: 0 }),
    });
    expect(chainLabels("waiting")).toEqual(["Check out"]);
    pressChain("waiting", "Check out");
    expect(chainLabels("waiting")).toEqual(["Collected", "Back"]);
    pressChain("waiting", "Collected");

    // The chain reports "no method chosen, nothing handed over", which is the
    // truth about what happened at the till and is all this test claims.
    //
    // It is NOT a claim that the resulting write is correct. An earlier version
    // of this assertion was the only coverage of that path, and it passed while
    // the write destroyed the dog's existing payment (#878) — because the value
    // it asserted IS the input that caused the corruption. What gets written
    // for this input is asserted against the row itself, in
    // `useBookingActions.component.test.tsx`.
    expect(onCollectWithPayment.mock.calls[0][1]).toEqual({ method: null, amountTaken: 0 });
  });

  it("steps back to the method choice rather than abandoning the chain", () => {
    renderCheckout();
    pressChain("waiting", "Check out");
    pressChain("waiting", "Cash £42");
    pressChain("waiting", "Back");
    expect(chainLabels("waiting")).toEqual(["Cash £42", "Card £42", "Back"]);
  });

  it("backs all the way out from the method choice", () => {
    renderCheckout();
    pressChain("waiting", "Check out");
    pressChain("waiting", "Back");
    expect(chainLabels("waiting")).toEqual(["Check out"]);
  });

  it("is blocked while a write for that dog is in flight", () => {
    const { onCollectWithPayment } = renderCheckout({ busyIds: new Set(["waiting"]) });
    pressChain("waiting", "Check out");
    expect(onCollectWithPayment).not.toHaveBeenCalled();
  });

  it("does not appear on a dog that is not ready to go home", () => {
    renderStack({ tokensById: tokenMap(), onAction: vi.fn(), onCollectWithPayment: vi.fn() });
    fireEvent.click(head("bathing"));
    expect(card("bathing").querySelector("[data-checkout-chain]")).toBeNull();
  });
});

describe("the price on a card", () => {
  const withPrice = (props = {}) => {
    const onSetPrice = vi.fn();
    const utils = renderStack({
      tokensById: tokenMap(),
      onAction: vi.fn(),
      onCollectWithPayment: vi.fn(),
      onSetPrice,
      ...props,
    });
    fireEvent.click(head("waiting"));
    return { ...utils, onSetPrice };
  };

  it("writes the edited figure in pounds", () => {
    const { onSetPrice } = withPrice();
    fireEvent.click(within(card("waiting")).getByLabelText(/Change the price for Bramble/));
    const input = within(card("waiting")).getByLabelText("Price for Bramble, in pounds");
    fireEvent.change(input, { target: { value: "55" } });
    fireEvent.blur(input);
    expect(onSetPrice).toHaveBeenCalledWith(expect.objectContaining({ id: "waiting" }), 55);
  });

  it("edits the base price, not the total, so add-ons are not counted twice", () => {
    const { onSetPrice } = withPrice({
      paymentOf: () => ({ kind: "due", amountDue: 52, subtotal: 52, basePrice: 42, addonsTotal: 10 }),
    });
    fireEvent.click(within(card("waiting")).getByLabelText(/Change the price for Bramble/));
    const input = within(card("waiting")).getByLabelText("Price for Bramble, in pounds");
    // The field opens on the BASE price, not the £52 total shown on the row.
    expect(input.value).toBe("42");
    fireEvent.change(input, { target: { value: "48" } });
    fireEvent.blur(input);
    expect(onSetPrice).toHaveBeenCalledWith(expect.anything(), 48);
  });

  it("shows the arithmetic when there are add-ons", () => {
    withPrice({
      paymentOf: () => ({ kind: "due", amountDue: 52, subtotal: 52, basePrice: 42, addonsTotal: 10 }),
    });
    expect(within(card("waiting")).getByText(/\(£42 \+ £10\)/)).toBeTruthy();
  });

  it("writes nothing when the figure is unchanged", () => {
    const { onSetPrice } = withPrice();
    fireEvent.click(within(card("waiting")).getByLabelText(/Change the price for Bramble/));
    fireEvent.blur(within(card("waiting")).getByLabelText("Price for Bramble, in pounds"));
    expect(onSetPrice).not.toHaveBeenCalled();
  });

  it("stops being editable once the chain has started", () => {
    withPrice();
    expect(within(card("waiting")).queryByLabelText(/Change the price for Bramble/)).toBeTruthy();
    pressChain("waiting", "Check out");
    expect(within(card("waiting")).queryByLabelText(/Change the price for Bramble/)).toBeNull();
  });
});

describe("the route to the full invoice", () => {
  it("is offered quietly, for the add-on, split or discount the chain cannot do", () => {
    const onOpenInvoice = vi.fn();
    renderStack({ tokensById: tokenMap(), onAction: vi.fn(), onOpenInvoice });
    fireEvent.click(head("waiting"));
    fireEvent.click(within(card("waiting")).getByLabelText("Open full invoice — Bramble"));
    expect(onOpenInvoice).toHaveBeenCalledWith(expect.objectContaining({ id: "waiting" }));
  });
});

describe("several warnings", () => {
  it("names the most important in the strip, counts the rest, and lists every one in full when lifted", () => {
    const warnings = ["Nervous / Anxious", "Needs a quiet room and a slow introduction before grooming"];
    renderStack({ getWelfare: () => ({ alerts: warnings }) });
    // Most important first: a warning nobody categorised ranks above "Nervous / Anxious".
    const ordered = [warnings[1], warnings[0]];
    expect(head("bathing").querySelector("[data-stack-safety]").textContent).toBe(`${ordered[0]} +1`);
    expect(head("bathing").getAttribute("aria-label")).toContain(`Safety note: ${ordered.join(". ")}`);
    expect(head("bathing").getAttribute("aria-label")).toContain(`${ordered[0]} +1`);
    fireEvent.click(head("bathing"));
    const details = card("bathing").querySelector("[data-stack-details]");
    expect(details.textContent).toContain(ordered.join(", "));
    expect(head("bathing").contains(details)).toBe(false);
  });
});
