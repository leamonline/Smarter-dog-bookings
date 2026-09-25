import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listForHuman: vi.fn(),
  listCustomerBookings: vi.fn(),
  listOlderCustomerBookings: vi.fn(),
  hasCustomerBookingsBefore: vi.fn(),
  listCustomerTrustedHumans: vi.fn(),
  updateCustomerContactDetails: vi.fn(),
}));

vi.mock("../customerClient", () => ({
  customerSupabase: { rpc: vi.fn() },
}));

vi.mock("../repositories/dogsRepo", () => ({
  listForHuman: mocks.listForHuman,
}));

vi.mock("../repositories/bookingsRepo", () => ({
  listCustomerBookings: mocks.listCustomerBookings,
  listOlderCustomerBookings: mocks.listOlderCustomerBookings,
  hasCustomerBookingsBefore: mocks.hasCustomerBookingsBefore,
}));

vi.mock("../rpc", () => ({
  listCustomerTrustedHumans: mocks.listCustomerTrustedHumans,
  updateCustomerContactDetails: mocks.updateCustomerContactDetails,
}));

import { useCustomerDashboardData } from "./useCustomerDashboardData";

const HUMAN = { id: "41000000-0000-4000-8000-000000000001" };
const DOG = {
  id: "42000000-0000-4000-8000-000000000001",
  name: "Alfie",
  breed: "Boston Terrier",
  size: "small",
  reportedSize: null,
  isPregnant: false,
  dob: "2022-05",
};
const BOOKING = {
  id: "40000000-0000-4000-8000-000000000001",
  bookingDate: "2099-06-15",
  slot: "09:00",
  size: "small",
  service: "full-groom",
  status: "Booked",
  payment: "Due at Pick-up",
  dogId: DOG.id,
  visitId: null,
  groupId: null,
  staffCapacityOverride: false,
  depositRequired: false,
  depositReceivedAt: null,
  depositAmount: null,
  depositReference: null,
  depositDueBy: null,
  dog: { name: "Alfie", breed: "Boston Terrier", size: "small" },
};

describe("useCustomerDashboardData", () => {
  beforeEach(() => {
    mocks.listForHuman.mockReset().mockResolvedValue({ dogs: [DOG], error: null });
    mocks.listCustomerBookings
      .mockReset()
      .mockResolvedValue({ bookings: [BOOKING], error: null });
    mocks.listOlderCustomerBookings
      .mockReset()
      .mockResolvedValue({ bookings: [], error: null });
    mocks.hasCustomerBookingsBefore.mockReset().mockResolvedValue(true);
    mocks.listCustomerTrustedHumans
      .mockReset()
      .mockResolvedValue({ data: [{ id: "th-1" }], error: null });
    mocks.updateCustomerContactDetails
      .mockReset()
      .mockResolvedValue({ error: null });
  });

  it("loads dogs, the recent booking window, the has-more flag and trusted contacts", async () => {
    const { result } = renderHook(() => useCustomerDashboardData(HUMAN));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.dogs).toEqual([DOG]);
    expect(result.current.bookings).toEqual([BOOKING]);
    expect(result.current.trustedHumans).toEqual([{ id: "th-1" }]);
    expect(result.current.hasMorePast).toBe(true);
    expect(result.current.loadError).toBeNull();
    expect(mocks.listCustomerBookings).toHaveBeenCalledWith(expect.anything(), {
      dogIds: [DOG.id],
      sinceDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });
  });

  it("skips the booking queries entirely for a customer with no dogs", async () => {
    mocks.listForHuman.mockResolvedValue({ dogs: [], error: null });
    const { result } = renderHook(() => useCustomerDashboardData(HUMAN));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.bookings).toEqual([]);
    expect(mocks.listCustomerBookings).not.toHaveBeenCalled();
    expect(mocks.hasCustomerBookingsBefore).not.toHaveBeenCalled();
  });

  it("reports a load failure without leaving loading stuck on", async () => {
    mocks.listForHuman.mockResolvedValue({
      dogs: [],
      error: new Error("permission denied"),
    });
    const { result } = renderHook(() => useCustomerDashboardData(HUMAN));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.loadError).toBeInstanceOf(Error);
    expect(result.current.dogs).toEqual([]);
  });

  describe("per-resource load flags", () => {
    // The fetches run as one sequential chain sharing a single `loadError`,
    // so a late failure leaves earlier results perfectly valid. Consumers ask
    // these flags, not the error, or an unrelated outage suppresses an empty
    // state that was honestly empty.
    it("marks every resource loaded on a clean fetch", async () => {
      const { result } = renderHook(() => useCustomerDashboardData(HUMAN));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.loaded).toEqual({
        dogs: true,
        bookings: true,
        trustedHumans: true,
      });
    });

    it("keeps dogs and bookings loaded when only trusted humans fails", async () => {
      mocks.listCustomerTrustedHumans.mockResolvedValue({
        data: null,
        error: new Error("permission denied"),
      });
      const { result } = renderHook(() => useCustomerDashboardData(HUMAN));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.loadError).toBeInstanceOf(Error);
      // The point of the change: the booking card must not be silenced by a
      // failure in a request that has nothing to do with bookings.
      expect(result.current.loaded.dogs).toBe(true);
      expect(result.current.loaded.bookings).toBe(true);
      expect(result.current.loaded.trustedHumans).toBe(false);
    });

    it("leaves bookings unloaded when the booking query itself fails", async () => {
      mocks.listCustomerBookings.mockResolvedValue({
        bookings: [],
        error: new Error("permission denied"),
      });
      const { result } = renderHook(() => useCustomerDashboardData(HUMAN));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.loaded.dogs).toBe(true);
      expect(result.current.loaded.bookings).toBe(false);
    });

    it("leaves everything unloaded when the first query fails", async () => {
      mocks.listForHuman.mockResolvedValue({
        dogs: [],
        error: new Error("permission denied"),
      });
      const { result } = renderHook(() => useCustomerDashboardData(HUMAN));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.loaded).toEqual({
        dogs: false,
        bookings: false,
        trustedHumans: false,
      });
    });

    it("counts bookings as loaded for a customer with no dogs", async () => {
      // Nothing to attach a booking to, so the empty diary is known, not
      // unknown, and the empty state is honest.
      mocks.listForHuman.mockResolvedValue({ dogs: [], error: null });
      const { result } = renderHook(() => useCustomerDashboardData(HUMAN));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(mocks.listCustomerBookings).not.toHaveBeenCalled();
      expect(result.current.loaded.dogs).toBe(true);
      expect(result.current.loaded.bookings).toBe(true);
    });
  });

  it("pages older bookings from the oldest loaded date and stops when a short page returns", async () => {
    const older = { ...BOOKING, id: "40000000-0000-4000-8000-000000000002", bookingDate: "2098-01-05" };
    mocks.listOlderCustomerBookings.mockResolvedValue({ bookings: [older], error: null });
    const { result } = renderHook(() => useCustomerDashboardData(HUMAN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(mocks.listOlderCustomerBookings).toHaveBeenCalledWith(expect.anything(), {
      dogIds: [DOG.id],
      beforeDate: BOOKING.bookingDate,
      limit: 20,
    });
    expect(result.current.olderBookings).toEqual([older]);
    expect(result.current.hasMorePast).toBe(false);
  });

  it("refreshBookings replaces the window and rethrows a fetch failure", async () => {
    const { result } = renderHook(() => useCustomerDashboardData(HUMAN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const fresh = { ...BOOKING, id: "40000000-0000-4000-8000-000000000003" };
    mocks.listCustomerBookings.mockResolvedValue({ bookings: [fresh], error: null });
    await act(async () => {
      await result.current.refreshBookings();
    });
    expect(result.current.bookings).toEqual([fresh]);

    mocks.listCustomerBookings.mockResolvedValue({
      bookings: [],
      error: new Error("offline"),
    });
    await expect(result.current.refreshBookings()).rejects.toThrow("offline");
  });

  it("saves contact details through the RPC wrapper and reports success", async () => {
    const { result } = renderHook(() => useCustomerDashboardData(HUMAN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.saveContactDetails({
        name: "Jo",
        surname: "Bloggs",
        address: "1 Bark Lane",
      });
    });

    expect(outcome).toEqual({ error: null, saved: true });
    expect(mocks.updateCustomerContactDetails).toHaveBeenCalledWith(
      expect.anything(),
      { name: "Jo", surname: "Bloggs", address: "1 Bark Lane" },
    );
  });

  it("merges a dog edit by id and ignores a duplicate add", async () => {
    const { result } = renderHook(() => useCustomerDashboardData(HUMAN));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.updateDog({ id: DOG.id, name: "Alfred" });
      result.current.addDog(DOG);
    });

    expect(result.current.dogs).toHaveLength(1);
    expect(result.current.dogs[0].name).toBe("Alfred");
  });
});
