// Park and resume go through the real session and StaffModals. Passing
// initialConfirmationChannel only into NewBookingModal misses this hop:
// StaffModals has to read it back off showNewBooking after the drawer remounts.
import { useEffect } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { useModalState } from "../../hooks/useModalState";
import { useBookingSession } from "../../hooks/useBookingSession";

vi.mock("../../supabase/hooks/humans/useTrustedContacts", () => ({
  fetchTrustedContactsForHuman: vi.fn().mockResolvedValue({ trustedContacts: [] }),
}));

vi.mock("../modals/AddDogModal.jsx", () => ({
  AddDogModal: ({ onClose }) => (
    <button type="button" onClick={onClose}>Close add dog</button>
  ),
}));

const { StaffModals } = await import("./StaffModals.jsx");

// StaffModals loads the drawer with React.lazy. The full coverage run instruments
// that import, and the default one-second query can expire while Suspense is
// still showing "Loading…". Load the module first, then allow the boundary time
// to settle. The assertion is unchanged.
const DRAWER_LOAD_MS = 15000;
beforeAll(async () => {
  await import("../modals/NewBookingModal.jsx");
}, DRAWER_LOAD_MS);

const OPEN_DATE = "2099-01-05";
const luna = {
  id: "dog-luna",
  name: "Luna",
  breed: "Poodle",
  size: "small",
  humanId: "Emma Wilson",
  _humanId: "emma-id",
  alerts: [],
};

function BookingShell() {
  const modals = useModalState();
  const session = useBookingSession({
    showNewBooking: modals.showNewBooking,
    setShowNewBooking: modals.setShowNewBooking,
    pendingBooking: modals.pendingBooking,
    setPendingBooking: modals.setPendingBooking,
    setShowAddDogModal: modals.setShowAddDogModal,
    clearDogSearch: () => {},
    currentDateStr: OPEN_DATE,
  });
  useEffect(() => {
    session.requestNewBooking({
      dateStr: OPEN_DATE,
      slot: "09:00",
      initialHumanId: "emma-id",
      initialEntries: [{ dog: luna, humanKey: "Emma Wilson", service: "full-groom", addons: [] }],
    });
    // Open once. requestNewBooking's identity changes when the drawer opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <StaffModals
      data={{
        humansApi: {},
        dogsApi: { dogsByHumanId: {}, ensureDogsForHumans: vi.fn(), searchDogs: vi.fn(), isSearching: false },
        bookingsApi: {},
        dogs: {},
        humans: { owner: { id: "emma-id", fullName: "Emma Wilson", name: "Emma" } },
        bookingsByDate: {},
        daySettings: {},
        dayOpenState: { [OPEN_DATE]: true },
        commitBookingList: vi.fn(),
        salonConfig: { pricing: {} },
      }}
      nav={{ currentDateObj: new Date(`${OPEN_DATE}T00:00:00`), currentDateStr: OPEN_DATE, handleDatePick: vi.fn() }}
      modals={modals}
      session={session}
      ui={{
        pathname: "/",
        navigate: vi.fn(),
        onOpenDog: vi.fn(),
        onOpenHuman: vi.fn(),
        onOpenBooking: vi.fn(),
        onCloseDogProfile: vi.fn(),
        onCloseHumanProfile: vi.fn(),
      }}
    />
  );
}

describe("staff booking parked confirmation", () => {
  it("restores Don't send after adding a dog and reopening the drawer", async () => {
    render(<BookingShell />);
    const method = await screen.findByRole("combobox", { name: "Customer confirmation" }, { timeout: DRAWER_LOAD_MS });
    fireEvent.change(method, { target: { value: "none" } });
    expect(screen.getByRole("button", { name: "Create booking" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "+ Add another dog" }));
    fireEvent.mouseDown(screen.getByText("+ New dog for Emma Wilson"));
    fireEvent.click(await screen.findByRole("button", { name: "Close add dog" }));

    expect(await screen.findByRole("combobox", { name: "Customer confirmation" })).toHaveValue("none");
    expect(screen.getByRole("button", { name: "Create booking" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Book & send confirmation" })).not.toBeInTheDocument();
  }, 20000);
});
