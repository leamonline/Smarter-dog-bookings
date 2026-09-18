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
