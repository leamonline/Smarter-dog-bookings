import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: vi.fn() }),
}));

import { NewClientWizard } from "./NewClientWizard.jsx";

function renderWizard(overrides = {}) {
  const props = {
    onClose: vi.fn(),
    addHuman: vi.fn().mockResolvedValue({ id: "human-1" }),
    addDog: vi.fn().mockResolvedValue({ id: "dog-1" }),
    onAddBookings: vi.fn().mockResolvedValue({ ok: true }),
    findHumanByFullName: vi.fn().mockResolvedValue(null),
    onBookAnother: vi.fn(),
    bookingsByDate: {},
    dayOpenState: {},
    daySettings: {},
    ...overrides,
  };
  render(<NewClientWizard {...props} />);
  return props;
}

async function enterValidClient(user) {
  await user.type(screen.getByLabelText("First name *"), "Amanda");
  await user.type(screen.getByLabelText("Surname *"), "Booth");
  await user.type(screen.getByLabelText("Phone *"), "07700 900123");
}

async function addValidDog(user, name) {
  await user.type(screen.getByRole("textbox", { name: "Dog name" }), name);
  await user.click(screen.getByRole("button", { name: "Small" }));
  await user.click(screen.getByRole("button", { name: "+ Add this dog" }));
}

describe("NewClientWizard", () => {
  it("uses Add client as the visible flow label", () => {
    renderWizard();
    expect(screen.getByText("Add client · Step 1 of 3")).toBeInTheDocument();
  });

  it("saves a client from the optional dog step without adding a dog", async () => {
    const user = userEvent.setup();
    const props = renderWizard();
    await enterValidClient(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Save client" }));

    await waitFor(() => expect(props.addHuman).toHaveBeenCalledTimes(1));
    expect(props.addDog).not.toHaveBeenCalled();
    expect(props.onAddBookings).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("saves added dogs without booking them", async () => {
    const user = userEvent.setup();
    const props = renderWizard();
    await enterValidClient(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await addValidDog(user, "Alfie");
    await user.click(screen.getByRole("button", { name: "Save & book later" }));

    await waitFor(() => expect(props.addDog).toHaveBeenCalledTimes(1));
    expect(props.onAddBookings).not.toHaveBeenCalled();
  });

  it("keeps the existing first-booking route", async () => {
    const user = userEvent.setup();
    renderWizard();
    await enterValidClient(user);
    await user.click(screen.getByRole("button", { name: "Next" }));
    await addValidDog(user, "Alfie");
    await user.click(screen.getByRole("button", { name: "Continue to booking" }));
    expect(screen.getByRole("heading", { name: "First booking" })).toBeInTheDocument();
  });
});
