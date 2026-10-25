import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  listForHuman: vi.fn(),
  restored: null as unknown,
}));

vi.mock("../../../supabase/customerClient", () => ({
  customerSupabase: { rpc: mocks.rpc },
}));

vi.mock("../../../hooks/useDraftPersistence", () => ({
  useDraftPersistence: () => ({ restored: mocks.restored, save: vi.fn(), clear: vi.fn() }),
}));

vi.mock("../../../supabase/repositories/dogsRepo", () => ({
  listForHuman: mocks.listForHuman,
}));

vi.mock("../../../supabase/repositories/humansRepo", () => ({
  getBookingRules: vi.fn().mockResolvedValue(null),
}));

import { BookingWizard } from "./BookingWizard";

const row = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  name,
  breed: "Poodle",
  size: "small",
  reportedSize: "small",
  isPregnant: false,
  ...over,
});

function arrange(dogs: ReturnType<typeof row>[]) {
  mocks.rpc.mockImplementation((name: string) =>
    Promise.resolve({
      data: name === "current_customer_booking_rules" ? { bookingHorizonDays: 28 } : [],
      error: null,
    }),
  );
  mocks.listForHuman.mockResolvedValue({ dogs, error: null });
}

function renderAgain(repeatFrom: unknown) {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/new", search: "?again=1", state: { repeatFrom } }]}>
      <BookingWizard
        humanRecord={{ id: "human-1", name: "Alex", surname: "Taylor" }}
        onComplete={() => {}}
        onCancel={() => {}}
      />
    </MemoryRouter>,
  );
}

describe("BookingWizard book the same groom again", () => {
  afterEach(() => {
    // Unmount before changing test state. DateSelection may still have reads
    // in flight, so preserve valid async responses during teardown; arrange()
    // replaces them for the next test. Clearing calls is sufficient here.
    cleanup();
    mocks.rpc.mockClear();
    mocks.listForHuman.mockClear();
    mocks.restored = null;
  });

  it("refills the last visit and starts at the date step with a way back", async () => {
    arrange([row("dog-1", "Alfie")]);
    renderAgain([{ dogId: "dog-1", service: "full-groom" }]);

    expect(await screen.findByText(/Alfie \(Full Groom\)/)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 1, name: /pick a date/i })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /change dogs or services/i }));
    expect(await screen.findByText(/select up to 4 pups/i)).toBeInTheDocument();
  });

  it("never refills Puppy Groom and lands on the service step instead", async () => {
    arrange([row("dog-1", "Alfie")]);
    renderAgain([{ dogId: "dog-1", service: "puppy-groom" }]);

    expect(await screen.findByText(/Alfie \(pick a service\)/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /choose services/i })).toBeInTheDocument();
    expect(screen.queryByText(/Puppy Groom\)/)).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("judges dogs on fresh data and says when one could not be added", async () => {
    arrange([row("dog-1", "Alfie"), row("dog-2", "Bella", { isPregnant: true })]);
    renderAgain([
      { dogId: "dog-1", service: "full-groom" },
      { dogId: "dog-2", service: "full-groom" },
    ]);

    expect(await screen.findByText(/couldn't be added/i)).toBeInTheDocument();
    expect(screen.getByText(/Alfie \(Full Groom\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Bella/)).not.toBeInTheDocument();
  });

  it("asks before replacing a draft, and carrying on keeps it untouched", async () => {
    mocks.restored = {
      step: 3,
      selectedDogs: [{ dogId: "dog-9", name: "Cooper", size: "small" }],
      services: { "dog-9": "bath-and-brush" },
      selectedDate: null,
      slotAllocation: null,
    };
    arrange([row("dog-1", "Alfie"), row("dog-9", "Cooper")]);
    renderAgain([{ dogId: "dog-1", service: "full-groom" }]);

    const user = userEvent.setup();
    expect(await screen.findByText(/booking half-finished/i)).toBeInTheDocument();
    await waitFor(() => expect(mocks.listForHuman).toHaveBeenCalled());
    expect(screen.queryByText(/Booking the same again/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /carry on with my booking/i }));
    expect(screen.queryByText(/half-finished/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Alfie \(Full Groom\)/)).not.toBeInTheDocument();
  });

  it("starts from the last visit only when the customer chooses to", async () => {
    mocks.restored = {
      step: 3,
      selectedDogs: [{ dogId: "dog-9", name: "Cooper", size: "small" }],
      services: { "dog-9": "bath-and-brush" },
      selectedDate: null,
      slotAllocation: null,
    };
    arrange([row("dog-1", "Alfie"), row("dog-9", "Cooper")]);
    renderAgain([{ dogId: "dog-1", service: "full-groom" }]);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /start from my last visit/i }));
    expect(await screen.findByText(/Alfie \(Full Groom\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Cooper/)).not.toBeInTheDocument();
  });

  it("is a normal booking without the again flag", async () => {
    arrange([row("dog-1", "Alfie")]);
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/new", state: { repeatFrom: [{ dogId: "dog-1", service: "full-groom" }] } }]}
      >
        <BookingWizard
          humanRecord={{ id: "human-1", name: "Alex", surname: "Taylor" }}
          onComplete={() => {}}
          onCancel={() => {}}
        />
      </MemoryRouter>,
    );
    expect(await screen.findByText(/select up to 4 pups/i)).toBeInTheDocument();
    expect(screen.queryByText(/Booking the same again/i)).not.toBeInTheDocument();
  });
});
