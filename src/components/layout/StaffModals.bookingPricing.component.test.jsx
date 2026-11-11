// The review must read the resolved salon configuration. useStaffAppData
// exposes it as salonConfig; data.config is not a field and would make every
// guide price fall back to the built-in table.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ pricing: undefined }));

vi.mock("../modals/NewBookingModal.jsx", () => ({
  NewBookingModal: (props) => {
    captured.pricing = props.configPricing;
    return <div>New booking</div>;
  },
}));

const { StaffModals } = await import("./StaffModals.jsx");

const settingsPricing = { "full-groom": { small: 4400 } };

describe("staff booking review pricing", () => {
  it("passes the salon Settings guide prices into the new booking drawer", async () => {
    render(
      <StaffModals
        data={{
          humansApi: {},
          dogsApi: { dogsByHumanId: {} },
          bookingsApi: {},
          dogs: {},
          humans: {},
          bookingsByDate: {},
          daySettings: {},
          dayOpenState: {},
          commitBookingList: vi.fn(),
          salonConfig: { pricing: settingsPricing },
        }}
        nav={{ currentDateObj: new Date("2099-01-05"), currentDateStr: "2099-01-05", handleDatePick: vi.fn() }}
        modals={{
          showNewBooking: { sessionKey: 1, dateStr: "2099-01-05", slot: "09:00" },
          setShowDatePicker: vi.fn(),
          setShowAddDogModal: vi.fn(),
          setShowNewClient: vi.fn(),
          setCollectionNotice: vi.fn(),
          setSelectedBooking: vi.fn(),
        }}
        session={{
          setDraftTarget: vi.fn(),
          requestNewBooking: vi.fn(),
          closeNewBooking: vi.fn(),
          parkBooking: vi.fn(),
        }}
        ui={{
          pathname: "/",
          navigate: vi.fn(),
          onOpenDog: vi.fn(),
          onOpenHuman: vi.fn(),
          onOpenBooking: vi.fn(),
          onCloseDogProfile: vi.fn(),
          onCloseHumanProfile: vi.fn(),
        }}
      />,
    );
    expect(await screen.findByText("New booking")).toBeInTheDocument();
    expect(captured.pricing).toBe(settingsPricing);
  });
});
