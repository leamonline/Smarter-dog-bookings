// Validation + autosave-status tests for the explicit-save Business tab and an
// autosave tab (P1 batch C).

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: vi.fn(), dismiss: vi.fn() }),
}));

import { BusinessSettings } from "./BusinessSettings.jsx";
import { BookingRulesSettings } from "./BookingRulesSettings.jsx";
import { CustomerPortalSettings } from "./CustomerPortalSettings.jsx";

const BOOKING_RULES = {
  bookingHorizonDays: 180,
  autoConfirm: true,
  depositHoldHours: 12,
  depositBank: {
    accountName: "",
    sortCode: "",
    accountNumber: "",
  },
  termsUrl: "https://smarterdog.co.uk/terms",
  depositTermsVersion: null,
  depositTermsContentHash: null,
  customerPortal: {
    allowCancellations: true,
    allowRescheduling: true,
    allowRepeatBooking: false,
    showHistory: true,
  },
};

const INACTIVE_RUNTIME = {
  state: "inactive",
  scheduledEffectiveAt: null,
};

describe("BusinessSettings email validation", () => {
  const config = { businessName: "My Salon", businessPhone: "", businessEmail: "", businessAddress: "" };

  it("blocks save and shows an error for an invalid email", async () => {
    const user = userEvent.setup();
    const onUpdateConfig = vi.fn().mockResolvedValue({ ok: true });
    render(<BusinessSettings config={config} onUpdateConfig={onUpdateConfig} canEdit />);

    await user.type(screen.getByPlaceholderText(/hello@smarterdog/i), "not-an-email");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/email doesn't look right/i);
    expect(onUpdateConfig).not.toHaveBeenCalled();
  });

  it("saves once the email is valid", async () => {
    const user = userEvent.setup();
    const onUpdateConfig = vi.fn().mockResolvedValue({ ok: true });
    render(<BusinessSettings config={config} onUpdateConfig={onUpdateConfig} canEdit />);

    await user.type(screen.getByPlaceholderText(/hello@smarterdog/i), "hi@smarterdog.co.uk");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => expect(onUpdateConfig).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("autosave SaveStatus indicator", () => {
  it("shows '✓ Saved' after an autosave succeeds", async () => {
    const user = userEvent.setup();
    const onUpdateBookingRules = vi.fn().mockResolvedValue({ ok: true });
    render(
      <BookingRulesSettings
        config={{ defaultPickupOffset: 120 }}
        bookingRules={BOOKING_RULES}
        bookingPolicyRuntime={INACTIVE_RUNTIME}
        onUpdateConfig={vi.fn().mockResolvedValue({ ok: true })}
        onUpdateBookingRules={onUpdateBookingRules}
        canEdit
      />,
    );

    // Toggling auto-confirm triggers a live save.
    await user.click(
      screen.getByRole("switch", { name: /auto-confirm bookings/i }),
    );

    expect(await screen.findByText("✓ Saved", { exact: true })).toBeInTheDocument();
    expect(onUpdateBookingRules).toHaveBeenCalledWith({ autoConfirm: false });
  });
});

describe("BookingRulesSettings authoritative controls", () => {
  function renderRules(overrides = {}) {
    const onUpdateConfig = vi.fn().mockResolvedValue({ ok: true });
    const onUpdateBookingRules = vi.fn().mockResolvedValue({ ok: true });
    render(
      <BookingRulesSettings
        config={{ defaultPickupOffset: 120 }}
        bookingRules={BOOKING_RULES}
        bookingPolicyRuntime={INACTIVE_RUNTIME}
        onUpdateConfig={onUpdateConfig}
        onUpdateBookingRules={onUpdateBookingRules}
        canEdit
        {...overrides}
      />,
    );
    return { onUpdateConfig, onUpdateBookingRules };
  }

  it("removes legacy placebo controls and labels the inactive v1 setup", () => {
    renderRules();

    expect(
      screen.queryByText("Advance booking window", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Minimum cancellation notice", { exact: true }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Upcoming policy")).toBeInTheDocument();
    expect(screen.getByText("previous_day_1500_v1")).toBeInTheDocument();
    expect(
      screen.getByText(/3:00 pm on the previous calendar day/i),
    ).toBeInTheDocument();
  });

  it("keeps the current pick-up offset wired to legacy config while v1 is inactive", async () => {
    const { onUpdateConfig } = renderRules();

    const pickupOffset = screen.getByRole("spinbutton", {
      name: /default pick-up offset/i,
    });
    fireEvent.change(pickupOffset, { target: { value: "150" } });

    await waitFor(() => expect(onUpdateConfig).toHaveBeenCalled());
    const updater = onUpdateConfig.mock.calls.at(-1)[0];
    expect(
      updater({ defaultPickupOffset: 120 }).defaultPickupOffset,
    ).toBe(150);
  });

  it("removes the legacy setup when the server reports v1 active", () => {
    renderRules({
      bookingPolicyRuntime: {
        state: "active",
        scheduledEffectiveAt: null,
      },
    });

    expect(
      screen.queryByText("Current booking setup", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Default pick-up offset", { exact: true }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Current policy", { exact: true })).toBeInTheDocument();
  });

  it("rejects an out-of-range horizon and saves a valid whole-day value", async () => {
    const user = userEvent.setup();
    const { onUpdateBookingRules } = renderRules();
    const horizon = screen.getByRole("spinbutton", {
      name: /booking horizon/i,
    });

    await user.clear(horizon);
    await user.type(horizon, "731");
    await user.tab();

    expect(screen.getByRole("alert")).toHaveTextContent(
      /whole number from 1 to 730/i,
    );
    expect(onUpdateBookingRules).not.toHaveBeenCalled();

    await user.clear(horizon);
    await user.type(horizon, "365");
    await user.tab();

    await waitFor(() =>
      expect(onUpdateBookingRules).toHaveBeenCalledWith({
        bookingHorizonDays: 365,
      }),
    );
  });

  it("offers only the server-supported deposit hold windows", async () => {
    const user = userEvent.setup();
    const { onUpdateBookingRules } = renderRules();
    const hold = screen.getByRole("combobox", {
      name: /deposit hold window/i,
    });

    expect(
      [...hold.querySelectorAll("option")].map((option) => option.value),
    ).toEqual(["6", "12", "24", "36", "48"]);

    await user.selectOptions(hold, "36");
    expect(onUpdateBookingRules).toHaveBeenCalledWith({
      depositHoldHours: 36,
    });
  });

  it("rejects partial bank details and saves a complete set together", async () => {
    const user = userEvent.setup();
    const { onUpdateBookingRules } = renderRules();

    await user.type(screen.getByLabelText("Account name"), "Smarter Dog");
    await user.click(
      screen.getByRole("button", { name: /save bank details/i }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /enter all three bank details or clear all three/i,
    );
    expect(onUpdateBookingRules).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Sort code"), "12-34-56");
    await user.type(screen.getByLabelText("Account number"), "12345678");
    await user.click(
      screen.getByRole("button", { name: /save bank details/i }),
    );

    expect(onUpdateBookingRules).toHaveBeenCalledWith({
      depositBank: {
        accountName: "Smarter Dog",
        sortCode: "12-34-56",
        accountNumber: "12345678",
      },
    });
  });

  it("restores the confirmed bank projection when the server rejects a save", async () => {
    const user = userEvent.setup();
    renderRules({
      onUpdateBookingRules: vi.fn().mockResolvedValue({
        ok: false,
        error: "bank details must be complete",
      }),
    });

    await user.type(screen.getByLabelText("Account name"), "Smarter Dog");
    await user.type(screen.getByLabelText("Sort code"), "12-34-56");
    await user.type(screen.getByLabelText("Account number"), "12345678");
    await user.click(
      screen.getByRole("button", { name: /save bank details/i }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Account name")).toHaveValue(""),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /bank details must be complete/i,
    );
  });

  it("saves or clears a Terms publication only as a complete version/hash pair", async () => {
    const user = userEvent.setup();
    const { onUpdateBookingRules } = renderRules();

    await user.type(screen.getByLabelText("Deposit Terms version"), "2026-07 v1");
    await user.click(
      screen.getByRole("button", { name: /save terms settings/i }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /version and lowercase sha-256 hash together/i,
    );
    expect(onUpdateBookingRules).not.toHaveBeenCalled();

    await user.type(
      screen.getByLabelText("Deposit Terms SHA-256"),
      "a".repeat(64),
    );
    await user.click(
      screen.getByRole("button", { name: /save terms settings/i }),
    );

    expect(onUpdateBookingRules).toHaveBeenCalledWith({
      termsUrl: "https://smarterdog.co.uk/terms",
      depositTermsVersion: "2026-07 v1",
      depositTermsContentHash: "a".repeat(64),
    });
  });

  it("warns explicitly when deposit-dependent booking is not ready", () => {
    renderRules();

    expect(screen.getByRole("alert")).toHaveTextContent(
      /deposit-dependent bookings.*blocked.*bank details.*terms publication/i,
    );
  });
});

describe("CustomerPortalSettings authoritative controls", () => {
  it("removes Show upcoming bookings and explains that upcoming visits remain visible", () => {
    const onUpdateBookingRules = vi.fn().mockResolvedValue({ ok: true });
    render(
      <CustomerPortalSettings
        bookingRules={BOOKING_RULES}
        onUpdateBookingRules={onUpdateBookingRules}
        canEdit
      />,
    );

    expect(
      screen.queryByText("Show upcoming bookings", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/upcoming visits are always visible/i),
    ).toBeInTheDocument();
  });

  it.each([
    ["Show past booking history", "showHistory", false],
    ["Allow repeat booking", "allowRepeatBooking", true],
    ["Allow cancellations", "allowCancellations", false],
    ["Allow rescheduling", "allowRescheduling", false],
  ])("saves %s through the authoritative portal contract", async (
    label,
    key,
    expected,
  ) => {
    const user = userEvent.setup();
    const onUpdateBookingRules = vi.fn().mockResolvedValue({ ok: true });
    render(
      <CustomerPortalSettings
        bookingRules={BOOKING_RULES}
        onUpdateBookingRules={onUpdateBookingRules}
        canEdit
      />,
    );
    await user.click(
      screen.getByRole("switch", { name: label }),
    );
    expect(onUpdateBookingRules).toHaveBeenCalledWith({
      customerPortal: { [key]: expected },
    });
  });
});
