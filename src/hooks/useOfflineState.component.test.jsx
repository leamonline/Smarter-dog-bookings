import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOfflineState } from "./useOfflineState";

// The front desk runs on tablets with flaky WiFi — the offline path is real.
// These tests pin the save-flow contracts the online hooks also honour, so
// useBookingSave can branch on the results identically on or off WiFi
// (PR #255's latent-drift findings; the declarations in useBookingActions
// now match these behaviours).

// A Monday, matching the sample dataset's week layout.
const weekStart = new Date(2026, 3, 6);
const mondayStr = "2026-04-06";

function renderOffline() {
  return renderHook(() =>
    useOfflineState(weekStart, mondayStr, new Date(2026, 3, 6)),
  );
}

describe("useOfflineState updateDog", () => {
  it("returns the merged dog and applies the update", () => {
    const { result } = renderOffline();

    let saved;
    act(() => {
      saved = result.current.updateDog("Bella", { groomNotes: "Short clip" });
    });

    expect(saved).toMatchObject({ name: "Bella", groomNotes: "Short clip" });
    expect(result.current.dogs["Bella"].groomNotes).toBe("Short clip");
  });

  it("returns null for an unknown dog so save flows can stop", () => {
    const { result } = renderOffline();

    let saved;
    act(() => {
      saved = result.current.updateDog("nobody", { groomNotes: "x" });
    });

    // Nullish = "not found / failed" to callers (useBookingSave checks
    // `== null`); a bare undefined here used to read as success.
    expect(saved).toBeNull();
    expect(result.current.dogs["nobody"]).toBeUndefined();
  });
});

describe("useOfflineState updateHuman", () => {
  it("returns the merged human and applies the update", () => {
    const { result } = renderOffline();

    let saved;
    act(() => {
      saved = result.current.updateHuman("h1", {
        trustedContacts: [{ id: "h2", relationship: "Partner" }],
      });
    });

    expect(saved).toMatchObject({
      id: "h1",
      fullName: "Sarah Jones",
      trustedContacts: [{ id: "h2", relationship: "Partner" }],
    });
    expect(result.current.humans["Sarah Jones"].trustedContacts).toEqual([
      { id: "h2", relationship: "Partner" },
    ]);
  });

  it("returns null for an unknown human so editors can stop", () => {
    const { result } = renderOffline();

    let saved;
    act(() => {
      saved = result.current.updateHuman("nobody", {
        trustedContacts: [],
      });
    });

    expect(saved).toBeNull();
    expect(result.current.humans.nobody).toBeUndefined();
  });
});

describe("useOfflineState handleUpdate", () => {
  it("resolves to the updated booking on a same-date edit", async () => {
    const { result } = renderOffline();
    const existing = result.current.bookingsByDate[mondayStr][0];

    let saved;
    await act(async () => {
      saved = await result.current.handleUpdate(
        { ...existing, slot: "10:00" },
        mondayStr,
        mondayStr,
      );
    });

    expect(saved).toMatchObject({ id: existing.id, slot: "10:00" });
    expect(
      result.current.bookingsByDate[mondayStr].find((b) => b.id === existing.id)
        .slot,
    ).toBe("10:00");
  });

  it("moves the booking on a cross-date edit", async () => {
    const { result } = renderOffline();
    const existing = result.current.bookingsByDate[mondayStr][0];
    const tuesdayStr = "2026-04-07";

    await act(async () => {
      await result.current.handleUpdate(
        { ...existing },
        mondayStr,
        tuesdayStr,
      );
    });

    expect(
      result.current.bookingsByDate[mondayStr].some((b) => b.id === existing.id),
    ).toBe(false);
    expect(
      (result.current.bookingsByDate[tuesdayStr] || []).some(
        (b) => b.id === existing.id,
      ),
    ).toBe(true);
  });
});
