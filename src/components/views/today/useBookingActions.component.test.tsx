// The write path's own tests.
//
// Everything on `/today` that changes a booking goes through this hook, and
// until #878 it had no tests of its own — the coverage sat a layer above, in
// `dayStack.component.test.jsx`, asserting the arguments handed *to* the hook.
// That is how a checkout that wipes a payment shipped green: the test asserted
// `{ method: null, amountTaken: 0 }` was passed in, which is exactly the input
// that produces the corrupt write.
//
// So every assertion here is about the ROW — the fully-resolved booking handed
// to `onUpdateBooking`, with `payment`, `paymentMethod`, `paidAmount` and
// `status` on it. That object is what reaches the repository and becomes the
// UPDATE. If a test in this file can pass while the row is wrong, the test is
// wrong.
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useBookingActions } from "./useBookingActions";
import { BOOKING_STATUS } from "../../../constants/index";
import { buildMiniInvoicePatch } from "../../../engine/dailyBrief";
import { buildTakingsByMethod } from "../../../engine/today";

const DATE = "2026-07-13";

/** A dog that paid £42 by card this morning and is now ready to go home. */
const PAID_IN_ADVANCE = {
  id: "paid-already",
  dogName: "Luna",
  slot: "09:00",
  status: BOOKING_STATUS.READY_FOR_COLLECTION,
  service: "full-groom",
  size: "small",
  payment: "Paid in Full",
  paymentMethod: "card",
  paidAmount: 42,
  _bookingDate: DATE,
};

/** A dog with the full £42 still to take. */
const OWES = {
  ...PAID_IN_ADVANCE,
  id: "owes",
  dogName: "Charlie",
  payment: "Due at Pick-up",
  paymentMethod: null,
  paidAmount: null,
};

const PRICING = {
  service: "full-groom",
  size: "small",
  addons: [],
  payment: "Due at Pick-up",
  configPricing: null,
};

function setup() {
  // Resolves to the row it was given, the way a successful save does.
  const onUpdateBooking = vi.fn(async (booking: never) => booking);
  const toast = { show: vi.fn() };
  const rendered = renderHook(() => useBookingActions({
    dateStr: DATE,
    toast: toast as never,
    onUpdateBooking: onUpdateBooking as never,
    onSendCollection: vi.fn(),
    onMessageOwner: vi.fn(),
    amountDueFor: () => 0,
  }));
  return { ...rendered, onUpdateBooking, toast };
}

function setupWithCollection({ failSave = false } = {}) {
  const onUpdateBooking = vi.fn(async (booking: never) => (failSave ? null : booking));
  const onSendCollection = vi.fn();
  const toast = { show: vi.fn() };
  const rendered = renderHook(() => useBookingActions({
    dateStr: DATE,
    toast: toast as never,
    onUpdateBooking: onUpdateBooking as never,
    onSendCollection,
    onMessageOwner: vi.fn(),
    amountDueFor: () => 0,
  }));
  return { ...rendered, onUpdateBooking, onSendCollection, toast };
}

/** The row that actually went to the writer on call `n`. */
function writtenRow(onUpdateBooking: ReturnType<typeof vi.fn>, n = 0) {
  return onUpdateBooking.mock.calls[n][0] as Record<string, unknown>;
}

beforeEach(() => vi.clearAllMocks());

describe("collecting a dog that has already paid", () => {
  it("does not touch the payment it already has", async () => {
    const { result, onUpdateBooking } = setup();

    // The two-step chain: no method chosen, nothing handed over, because
    // there was nothing to hand over.
    await act(async () => {
      await result.current.collectWithPayment(
        PAID_IN_ADVANCE as never,
        PRICING as never,
        null as never,
        0,
      );
    });

    const row = writtenRow(onUpdateBooking);
    expect(row.status).toBe(BOOKING_STATUS.COMPLETED);
    // The three that #878 destroyed. £42 taken by card stays £42 taken by card.
    expect(row.paidAmount).toBe(42);
    expect(row.paymentMethod).toBe("card");
    expect(row.payment).toBe("Paid in Full");
  });

  it("leaves the payment alone when Undo puts the dog back", async () => {
    const { result, onUpdateBooking, toast } = setup();

    await act(async () => {
      await result.current.collectWithPayment(
        PAID_IN_ADVANCE as never,
        PRICING as never,
        null as never,
        0,
      );
    });

    // The Undo hangs off the success toast.
    const action = toast.show.mock.calls.at(-1)?.[2] as { onClick: () => void };
    await act(async () => { action.onClick(); });
    await waitFor(() => expect(onUpdateBooking).toHaveBeenCalledTimes(2));

    const row = writtenRow(onUpdateBooking, 1);
    expect(row.status).toBe(BOOKING_STATUS.READY_FOR_COLLECTION);
    // Undoing a collection that took no money must not un-take a payment that
    // was made hours earlier through another route.
    expect(row.paidAmount).toBe(42);
    expect(row.paymentMethod).toBe("card");
    expect(row.payment).toBe("Paid in Full");
  });
});

describe("collecting a dog that pays on the way out", () => {
  it("writes the amount actually handed over, and the method", async () => {
    const { result, onUpdateBooking } = setup();

    await act(async () => {
      await result.current.collectWithPayment(
        OWES as never,
        PRICING as never,
        "cash",
        42,
      );
    });

    const row = writtenRow(onUpdateBooking);
    expect(row.status).toBe(BOOKING_STATUS.COMPLETED);
    expect(row.payment).toBe("Paid in Full");
    expect(row.paymentMethod).toBe("cash");
    expect(row.paidAmount).toBe(42);
  });

  it("writes the balance on a deposit-paid visit, not the gross", async () => {
    const { result, onUpdateBooking } = setup();
    const deposited = { ...OWES, payment: "Deposit Paid", depositAmount: 10 };

    await act(async () => {
      await result.current.collectWithPayment(
        deposited as never,
        { ...PRICING, payment: "Deposit Paid", depositAmount: 10 } as never,
        "cash",
        32,
      );
    });

    // £32 crossed the counter. The appointment is worth £42. The till saw £32.
    expect(writtenRow(onUpdateBooking).paidAmount).toBe(32);
  });

  it("clears the payment when Undo puts the dog back", async () => {
    const { result, onUpdateBooking, toast } = setup();

    await act(async () => {
      await result.current.collectWithPayment(OWES as never, PRICING as never, "cash", 42);
    });
    const action = toast.show.mock.calls.at(-1)?.[2] as { onClick: () => void };
    await act(async () => { action.onClick(); });
    await waitFor(() => expect(onUpdateBooking).toHaveBeenCalledTimes(2));

    const row = writtenRow(onUpdateBooking, 1);
    expect(row.status).toBe(BOOKING_STATUS.READY_FOR_COLLECTION);
    expect(row.payment).toBe("Due at Pick-up");
    expect(row.paymentMethod).toBeNull();
    expect(row.paidAmount).toBeNull();
  });
});

describe("taking a payment through the mini invoice", () => {
  // #874: the invoice wrote the appointment's gross value to paid_amount, so on
  // a deposit-paid visit the day's takings reported £42 when the till held £32.
  // The patch is built by the real engine function and saved through the real
  // hook, and the assertions are on the row that reached the writer — and on
  // the takings figure staff read off that same row.
  it("writes the balance taken, not the gross, and the takings agree", async () => {
    const { result, onUpdateBooking } = setup();
    const deposited = { ...OWES, payment: "Deposit Paid", depositAmount: 10 };

    const invoice = buildMiniInvoicePatch({
      booking: { ...PRICING, payment: "Deposit Paid", depositAmount: 10 } as never,
      basePrice: 42,
      addons: [],
      depositAmount: 10,
      paymentReceived: 32,
      paymentMethod: "card",
    });
    if (!invoice.ok) throw new Error(invoice.error);

    await act(async () => {
      await result.current.saveInvoice(deposited as never, invoice.patch as never);
    });

    const row = writtenRow(onUpdateBooking);
    expect(row.payment).toBe("Paid in Full");
    expect(row.paymentMethod).toBe("card");
    expect(row.paidAmount).toBe(32);
    // The deposit is kept in its own column, so the appointment's full value is
    // still recoverable as depositAmount + paidAmount.
    expect(row.depositAmount).toBe(10);

    const takings = buildTakingsByMethod([row as never]);
    expect(takings.total).toBe(32);
    expect(takings.byMethod).toEqual([
      { method: "card", label: "Card", amount: 32, count: 1 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// The lifecycle transitions, asserted on the ROW each one writes.
//
// Per CONTRIBUTING.md: a test on a write path asserts the row that reached the
// writer, not the arguments handed to the hook. A status transition that looks
// right in the call and writes the wrong value is precisely the failure these
// tests exist to catch.
describe("walking a booking through its lifecycle", () => {
  const at = (status: string) => ({ ...PAID_IN_ADVANCE, status, payment: "Due at Pick-up" });

  const runAction = async (
    booking: Record<string, unknown>,
    actionId: string,
  ) => {
    const { result, onUpdateBooking, toast } = setup();
    await act(async () => {
      await result.current.runTokenAction({ booking } as never, { id: actionId } as never);
    });
    return { onUpdateBooking, toast, result };
  };

  it("Booked → Reconfirmed", async () => {
    const { onUpdateBooking } = await runAction(at(BOOKING_STATUS.BOOKED), "reconfirm");
    expect(writtenRow(onUpdateBooking).status).toBe(BOOKING_STATUS.RECONFIRMED);
  });

  it("Reconfirmed → Arrived", async () => {
    const { onUpdateBooking } = await runAction(at(BOOKING_STATUS.RECONFIRMED), "checkIn");
    expect(writtenRow(onUpdateBooking).status).toBe(BOOKING_STATUS.ARRIVED);
  });

  it("Booked → Arrived directly, with no confirmation dialog in the way", async () => {
    // Plenty of dogs simply turn up. Reconfirmed is offered, never required.
    const { onUpdateBooking } = await runAction(at(BOOKING_STATUS.BOOKED), "checkIn");
    expect(writtenRow(onUpdateBooking).status).toBe(BOOKING_STATUS.ARRIVED);
  });

  it("Arrived → Ready for collection", async () => {
    const { onUpdateBooking } = await runAction(at(BOOKING_STATUS.ARRIVED), "ready");
    expect(writtenRow(onUpdateBooking).status).toBe(BOOKING_STATUS.READY_FOR_COLLECTION);
  });

  it("Ready for collection → Completed", async () => {
    const { result, onUpdateBooking } = setup();
    await act(async () => {
      await result.current.collectWithPayment(
        { ...PAID_IN_ADVANCE, status: BOOKING_STATUS.READY_FOR_COLLECTION } as never,
        PRICING as never,
        null as never,
        0,
      );
    });
    expect(writtenRow(onUpdateBooking).status).toBe(BOOKING_STATUS.COMPLETED);
  });

  it("marks a no-show as a STATUS, not a cancellation carrying a reason", async () => {
    const { onUpdateBooking } = await runAction(at(BOOKING_STATUS.BOOKED), "didntShow");
    const row = writtenRow(onUpdateBooking);
    expect(row.status).toBe(BOOKING_STATUS.NO_SHOW);
    expect(row.status).not.toBe(BOOKING_STATUS.CANCELLED);
    // The reason text still rides along as history for the booking log.
    expect(row.cancelReason).toBe("No-show");
  });
});

describe("marking a dog ready never messages anyone by itself", () => {
  it("writes the status and hands the decision to staff", async () => {
    // The single most important safety property on this screen. Marking a dog
    // ready must write a status and open a prompt — never send. The automatic
    // database trigger that used to do this was dropped in 20260526120000 and
    // must not come back by another route.
    const { result, onUpdateBooking, onSendCollection } = setupWithCollection();

    await act(async () => {
      await result.current.runTokenAction(
        { booking: { ...PAID_IN_ADVANCE, status: BOOKING_STATUS.ARRIVED } } as never,
        { id: "ready" } as never,
      );
    });

    // The row was written...
    expect(writtenRow(onUpdateBooking).status).toBe(BOOKING_STATUS.READY_FOR_COLLECTION);
    // ...and the staff-facing prompt was offered, carrying the saved booking.
    expect(onSendCollection).toHaveBeenCalledTimes(1);
    // Nothing in this hook sends: the prompt is where a human decides.
    expect(onSendCollection.mock.calls[0][0]).toMatchObject({
      status: BOOKING_STATUS.READY_FOR_COLLECTION,
    });
  });

  it("does not open the prompt when the write fails", async () => {
    // A failed save must never open a "tell the owner it's ready" modal: an
    // owner told to come for a dog the system does not think is ready is the
    // worst outcome available here.
    const { result, onSendCollection } = setupWithCollection({ failSave: true });
    await act(async () => {
      await result.current.runTokenAction(
        { booking: { ...PAID_IN_ADVANCE, status: BOOKING_STATUS.ARRIVED } } as never,
        { id: "ready" } as never,
      );
    });
    expect(onSendCollection).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Staff "Confirm" advances the lifecycle under the same guards as the
// customer path. The guards themselves are enforced in useBookings' write
// payload; these assert the hook's own confirm action still behaves.
describe("staff confirmation", () => {
  it("stamps the confirmation pair as staff-sourced", async () => {
    const { result, onUpdateBooking } = setup();
    await act(async () => {
      await result.current.runTokenAction(
        { booking: { ...PAID_IN_ADVANCE, status: BOOKING_STATUS.BOOKED } } as never,
        { id: "confirm" } as never,
      );
    });
    const row = writtenRow(onUpdateBooking);
    expect(row._confirmArrival).toBe(true);
    expect(row.reminderConfirmedBy).toBe("staff");
    expect(row.reminderState).toBe("confirmed");
  });
});
