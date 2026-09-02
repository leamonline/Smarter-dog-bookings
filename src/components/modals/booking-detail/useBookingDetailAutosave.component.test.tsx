// useBookingDetailAutosave — the debounced write behind the booking detail
// modal's edit mode (Debt 9). The modal-level autosave test still covers the
// wiring; this pins the hook's own contract.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTOSAVE_DELAY_MS,
  useBookingDetailAutosave,
  type AutosaveBookingUpdate,
} from "./useBookingDetailAutosave";
import type { EditData } from "../../../hooks/useBookingEditState";
import type { Booking, Human } from "../../../types/index";

const human = (id: string, name: string, surname: string): Human =>
  ({ id, fullName: `${name} ${surname}`, name, surname, phone: "", sms: false }) as Human;

const humans: Record<string, Human> = {
  "Sarah Jones": human("h1", "Sarah", "Jones"),
  "Dave Smith": human("h2", "Dave", "Smith"),
};

const booking = {
  id: "b1",
  dogName: "Bella",
  size: "small",
  service: "full-groom",
  owner: "Sarah Jones",
  status: "Booked",
  slot: "09:00",
  addons: [],
  pickupBy: "Sarah Jones",
  payment: "Due at Pick-up",
  _pickupById: "h1",
} as unknown as Booking;

const baseEdit: EditData = {
  service: "full-groom",
  pickupBy: "Sarah Jones",
  payment: "Due at Pick-up",
  paymentMethod: null,
  paidAmount: null,
  depositAmount: 10,
  groomNotes: "",
  alerts: [],
  addons: [],
  date: new Date(2026, 4, 18),
  slot: "09:00",
  price: 45,
  saveAsUsual: false,
};

function renderAutosave(initial: EditData, overrides: Partial<Parameters<typeof useBookingDetailAutosave>[0]> = {}) {
  const onUpdate = vi.fn<
    (booking: AutosaveBookingUpdate, from: string, to: string) => Promise<unknown>
  >(async () => ({}));
  const setSaveError = vi.fn();
  const hook = renderHook(
    ({ editData }: { editData: EditData }) =>
      useBookingDetailAutosave({
        booking,
        editData,
        isEditing: true,
        humans,
        currentDateStr: "2026-05-18",
        subtotal: 45,
        setSaveError,
        onUpdate,
        ...overrides,
      }),
    { initialProps: { editData: initial } },
  );
  return { ...hook, onUpdate, setSaveError };
}

async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS);
    await Promise.resolve();
  });
}

describe("useBookingDetailAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes the edited fields through onUpdate after the debounce, resolving the pick-up name and id", async () => {
    const { rerender, onUpdate, result } = renderAutosave(baseEdit);
    expect(result.current.autosaveStatus).toBe("idle");

    rerender({ editData: { ...baseEdit, pickupBy: "h2", addons: ["flea-bath"], date: new Date(2026, 4, 19) } });
    expect(onUpdate).not.toHaveBeenCalled();
    await settle();

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [patch, from, to] = onUpdate.mock.calls[0] as [AutosaveBookingUpdate, string, string];
    expect(from).toBe("2026-05-18");
    expect(to).toBe("2026-05-19");
    expect(patch).toMatchObject({
      id: "b1",
      pickupBy: "Dave Smith",
      _pickupById: "h2",
      addons: ["flea-bath"],
      slot: "09:00",
      paymentMethod: null,
      paidAmount: null,
      depositAmount: null,
    });
    expect(result.current.autosaveStatus).toBe("saved");
  });

  it("carries the ledger fields only for the payment state they belong to", async () => {
    const { rerender, onUpdate } = renderAutosave(baseEdit);
    rerender({
      editData: { ...baseEdit, payment: "Paid in Full", paymentMethod: "card", paidAmount: 45 },
    });
    await settle();
    expect(onUpdate.mock.calls[0]?.[0]).toMatchObject({
      payment: "Paid in Full",
      paymentMethod: "card",
      paidAmount: 45,
      depositAmount: null,
    });

    rerender({ editData: { ...baseEdit, payment: "Deposit Paid", depositAmount: 20 } });
    await settle();
    expect(onUpdate.mock.calls[1]?.[0]).toMatchObject({
      payment: "Deposit Paid",
      paymentMethod: null,
      paidAmount: null,
      depositAmount: 20,
    });
  });

  it("refuses an invalid deposit: reports the error, writes nothing, stays unsaved", async () => {
    const { rerender, onUpdate, setSaveError, result } = renderAutosave(baseEdit);
    rerender({ editData: { ...baseEdit, payment: "Deposit Paid", depositAmount: 45 } });
    await settle();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(setSaveError).toHaveBeenCalledWith("Deposit must be less than the booking total");
    expect(result.current.autosaveStatus).toBe("idle");

    // The baseline did not advance, so undoing the edit is "no change".
    rerender({ editData: baseEdit });
    await settle();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("does nothing without a slot, and nothing at all outside edit mode", async () => {
    const noSlot = renderAutosave(baseEdit);
    noSlot.rerender({ editData: { ...baseEdit, slot: "" } });
    await settle();
    expect(noSlot.onUpdate).not.toHaveBeenCalled();

    const viewing = renderAutosave(baseEdit, { isEditing: false });
    viewing.rerender({ editData: { ...baseEdit, addons: ["flea-bath"] } });
    await settle();
    expect(viewing.onUpdate).not.toHaveBeenCalled();
  });
});
