import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Booking } from "../types/index";

const mocks = vi.hoisted(() => ({ single: vi.fn(), group: vi.fn() }));
vi.mock("../supabase/hooks/useHumans", () => ({ useHumans: () => ({ humans: {}, humansById: {} }) }));
vi.mock("../supabase/hooks/useDogs", () => ({ useDogs: () => ({ dogs: {}, dogsById: {} }) }));
vi.mock("../supabase/hooks/useBookings", () => ({ useBookings: () => ({ bookingsByDate: {} }) }));
vi.mock("../supabase/hooks/useSalonConfig", () => ({ useSalonConfig: () => ({ config: {} }) }));
vi.mock("../supabase/hooks/useDaySettings", () => ({ useDaySettings: () => ({ daySettings: {} }) }));
vi.mock("./useOfflineState", () => ({ useOfflineState: () => ({}) }));
vi.mock("./useBookingActions", () => ({ useBookingActions: () => ({ daySettings: {}, handleAddToDate: mocks.single, handleAddGroupToDate: mocks.group }) }));
import { useStaffAppData } from "./useStaffAppData";

describe("staff booking receipt identities", () => {
  it("returns stored identities rather than the draft IDs across single and grouped dates", async () => {
    const stored: Booking[] = [];
    mocks.single.mockImplementation(async (draft: Booking) => {
      const row = { ...draft, id: "actual-single" }; stored.push(row); return row;
    });
    mocks.group.mockImplementation(async (drafts: Booking[]) => {
      const rows = drafts.map((draft, index) => ({ ...draft, id: `actual-group-${index}` }));
      stored.push(...rows); return rows;
    });
    const { result } = renderHook(() => useStaffAppData({ isOnline: true, isOwner: false,
      weekStart: new Date("2099-01-05"), dates: [], currentDateStr: "2099-01-05",
      currentDateObj: new Date("2099-01-05"), directoriesWarm: false, onReadyForPickup: vi.fn(),
    }));
    const drafts = [{ id: "draft-1", _bookingDate: "2099-01-05" }, { id: "draft-2", _bookingDate: "2099-01-12" }, { id: "draft-3", _bookingDate: "2099-01-12" }] as Booking[];
    await act(async () => {
      const saved = await result.current.commitBookingList(drafts, "2099-01-05");
      expect(saved.ok).toBe(true);
      expect(saved.bookings.map((row) => row.id).sort()).toEqual(stored.map((row) => row.id).sort());
      expect(saved.bookings.map((row) => row.id)).not.toContain("draft-1");
    });
    expect(stored).toHaveLength(3);
  });
});
