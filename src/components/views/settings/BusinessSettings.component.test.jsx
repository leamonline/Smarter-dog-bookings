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
        config={{
          defaultPickupOffset: 120,
          depositReleaseHours: 12,
          depositBank: {
            accountName: "Legacy Dog",
            sortCode: "11-22-33",
            accountNumber: "87654321",
          },
        }}
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

  it("withholds v1 controls when no server projection has been confirmed", () => {
    renderRules({
      bookingPolicyConfirmed: false,
      bookingPolicyError: "Couldn't load booking rules.",
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      /couldn't load booking rules/i,
    );
    expect(
      screen.queryByRole("spinbutton", { name: "Booking horizon" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("switch", { name: "Auto-confirm bookings" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Current booking setup", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Upcoming policy", { exact: true }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Current deposit hold window"),
    ).not.toBeInTheDocument();
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

  it("keeps current deposit timing and bank details editable while v1 is inactive", async () => {
    const user = userEvent.setup();
    const { onUpdateConfig } = renderRules();

    const currentHold = screen.getByRole("spinbutton", {
      name: "Current deposit hold window",
    });
    fireEvent.change(currentHold, { target: { value: "24" } });
    await waitFor(() => expect(onUpdateConfig).toHaveBeenCalled());
    const holdUpdater = onUpdateConfig.mock.calls.at(-1)[0];
    expect(holdUpdater({ depositReleaseHours: 12 }).depositReleaseHours).toBe(
      24,
    );

    await user.clear(screen.getByLabelText("Current account name"));
    await user.type(
      screen.getByLabelText("Current account name"),
      "Current Smarter Dog",
    );
    await user.click(
      screen.getByRole("button", { name: "Save current bank details" }),
    );

    const bankUpdater = onUpdateConfig.mock.calls.at(-1)[0];
    expect(
      bankUpdater({
        depositBank: {
          accountName: "Legacy Dog",
          sortCode: "11-22-33",
          accountNumber: "87654321",
        },
      }).depositBank,
    ).toEqual({
      accountName: "Current Smarter Dog",
      sortCode: "11-22-33",
      accountNumber: "87654321",
    });
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
    expect(
      screen.queryByLabelText("Current deposit hold window"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Current account name")).not.toBeInTheDocument();
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

  it("does not erase an in-progress bank draft when a refresh returns the same projection", async () => {
    const user = userEvent.setup();
    const props = {
      config: {
        defaultPickupOffset: 120,
        depositReleaseHours: 12,
        depositBank: {
          accountName: "Legacy Dog",
          sortCode: "11-22-33",
          accountNumber: "87654321",
        },
      },
      bookingRules: BOOKING_RULES,
      bookingPolicyRuntime: INACTIVE_RUNTIME,
      onUpdateConfig: vi.fn().mockResolvedValue({ ok: true }),
      onUpdateBookingRules: vi.fn().mockResolvedValue({ ok: true }),
      canEdit: true,
    };
    const { rerender } = render(<BookingRulesSettings {...props} />);

    await user.type(
      screen.getByLabelText("Account name", { exact: true }),
      "Smarter Dog",
    );
    rerender(
      <BookingRulesSettings
        {...props}
        bookingRules={{
          ...BOOKING_RULES,
          depositBank: { ...BOOKING_RULES.depositBank },
        }}
      />,
    );

    expect(
      screen.getByLabelText("Account name", { exact: true }),
    ).toHaveValue("Smarter Dog");
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
  it("withholds policy switches until the server projection is confirmed", () => {
    const { rerender } = render(
      <CustomerPortalSettings
        bookingRules={BOOKING_RULES}
        bookingPolicyRuntime={INACTIVE_RUNTIME}
        bookingRulesLoading
        bookingRulesConfirmed={false}
        onUpdateBookingRules={vi.fn()}
        canEdit
      />,
    );

    expect(screen.getByText(/loading booking policy/i)).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();

    rerender(
      <CustomerPortalSettings
        bookingRules={BOOKING_RULES}
        bookingPolicyRuntime={INACTIVE_RUNTIME}
        bookingRulesError="Couldn't load booking rules."
        bookingRulesConfirmed={false}
        onUpdateBookingRules={vi.fn()}
        canEdit
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /couldn't load booking rules/i,
    );
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it.each([
    ["inactive", "Upcoming policy"],
    ["scheduled", "Upcoming policy"],
    ["failed", "Upcoming policy"],
    ["active", "Current policy"],
  ])("labels %s portal rules as %s", (state, label) => {
    render(
      <CustomerPortalSettings
        bookingRules={BOOKING_RULES}
        bookingPolicyRuntime={{
          state,
          scheduledEffectiveAt:
            state === "scheduled" ? "2026-08-01T14:00:00Z" : null,
        }}
        bookingRulesConfirmed
        onUpdateBookingRules={vi.fn()}
        canEdit
      />,
    );
    expect(screen.getByText(label, { exact: true })).toBeInTheDocument();
  });

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
