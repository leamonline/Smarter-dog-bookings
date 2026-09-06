import { test, expect, type Page } from "@playwright/test";
import { LARGE_DOG_SLOTS } from "../src/constants/salon";
import { createDefaultBookingRules } from "../src/constants/salonSettings";

// Regression guard for UX-AUDIT-REPORT Top 5 #2: the Settings page used to
// render blank below the first two sections (long-scroll layout painting
// bug). It was rebuilt with one responsive, horizontally scrollable tablist;
// these tests walk every section and assert each panel actually
// surfaces content, so a blank panel can never quietly ship again.
//
// The e2e harness runs with VITE_FORCE_OFFLINE=1 (sample data, no Supabase),
// where settings are editable (canEdit = isOwner || !isOnline). Two tabs are
// asserted on visible content rather than controls: Calendar Sync, whose
// interactive controls need a live Supabase feed-token RPC so offline it
// legitimately sits in its loading state, and Capacity Engine, which is
// read-only by design (AUDIT-1) — see its dedicated test below.
const TABS_WITH_CONTROLS = [
  "Your Business",
  "Hours & Closures",
  "Holidays",
  "Your Account",
  "Services & Pricing",
  "Booking Rules",
  "Customer Portal",
  "Notifications",
] as const;

const INTERACTIVE = "button, input, select, textarea, [role='switch']";

type BookingPolicyRpcState = {
  rules: ReturnType<typeof createDefaultBookingRules>;
  rejectNextUpdate: boolean;
};

const bookingPolicyRpcStates = new WeakMap<Page, BookingPolicyRpcState>();

async function installBookingPolicyRpc(page: Page) {
  const state: BookingPolicyRpcState = {
    rules: createDefaultBookingRules(),
    rejectNextUpdate: false,
  };
  bookingPolicyRpcStates.set(page, state);

  await page.route("**/__e2e/booking-policy-rpc", async (route) => {
    const { name, args } = route.request().postDataJSON();
    if (name === "booking_policy_runtime_status") {
      await route.fulfill({
        json: {
          data: { state: "inactive", scheduledEffectiveAt: null },
          error: null,
        },
      });
      return;
    }
    if (name === "current_booking_rules") {
      await route.fulfill({ json: { data: state.rules, error: null } });
      return;
    }
    if (name === "update_booking_rules") {
      if (state.rejectNextUpdate) {
        state.rejectNextUpdate = false;
        await route.fulfill({
          json: {
            data: null,
            error: { message: "Deterministic policy rejection." },
          },
        });
        return;
      }
      const patch = args?.p_rules || {};
      state.rules = {
        ...state.rules,
        ...patch,
        depositBank: patch.depositBank
          ? { ...patch.depositBank }
          : state.rules.depositBank,
        customerPortal: patch.customerPortal
          ? { ...state.rules.customerPortal, ...patch.customerPortal }
          : state.rules.customerPortal,
      };
      await route.fulfill({ json: { data: state.rules, error: null } });
      return;
    }
    await route.fulfill({
      status: 400,
      json: { data: null, error: { message: `Unexpected RPC: ${name}` } },
    });
  });
}

async function openSettingsSection(page: Page, label: string) {
  const tab = page.getByRole("tab", { name: label, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

test.describe("Settings tabs", () => {
  test.beforeEach(async ({ page }) => {
    await installBookingPolicyRpc(page);
  });

  for (const label of TABS_WITH_CONTROLS) {
    test(`"${label}" tab paints interactive content`, async ({ page }) => {
      await page.goto("/settings");
      await openSettingsSection(page, label);

      const panel = page.locator("#settings-panel");
      await expect(panel).toBeVisible();
      // The original bug left panels present in the DOM but not painting —
      // so the assertion is on *visible* interactive content, not existence.
      await expect(panel.locator(INTERACTIVE).first()).toBeVisible();
    });
  }

  // Capacity Engine is deliberately a zero-control card (AUDIT-1): the 2-2-1
  // rules are hardcoded in the engine, so the panel renders them straight off
  // LARGE_DOG_SLOTS instead of offering placebo toggles. Assert the content
  // paints and pin the read-only contract, so re-adding controls here forces
  // the tab back into TABS_WITH_CONTROLS.
  test(`"Capacity Engine" tab paints its read-only content`, async ({
    page,
  }) => {
    await page.goto("/settings");
    await openSettingsSection(page, "Capacity Engine");

    const panel = page.locator("#settings-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByText("What the 2-2-1 rule means")).toBeVisible();
    for (const time of Object.keys(LARGE_DOG_SLOTS)) {
      await expect(panel.getByText(time, { exact: true })).toBeVisible();
    }
    await expect(panel.locator(INTERACTIVE)).toHaveCount(0);
  });

  test(`"Calendar Sync" tab paints its content offline`, async ({ page }) => {
    await page.goto("/settings");
    await openSettingsSection(page, "Calendar Sync");

    const panel = page.locator("#settings-panel");
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("heading", { name: /staff calendar feed/i }),
    ).toBeVisible();
    await expect(panel.getByText(/how to subscribe/i)).toBeVisible();
  });

  test("Booking Rules renders only authoritative v1 controls", async ({
    page,
  }) => {
    await page.goto("/settings");
    await openSettingsSection(page, "Booking Rules");

    const panel = page.locator("#settings-panel");
    await expect(panel.getByText("Upcoming policy", { exact: true })).toBeVisible();
    await expect(
      panel.getByText("previous_day_1500_v1", { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByText(/3:00 pm on the previous calendar day/i),
    ).toBeVisible();
    await expect(
      panel.getByText("Advance booking window", { exact: true }),
    ).toHaveCount(0);
    await expect(
      panel.getByText("Minimum cancellation notice", { exact: true }),
    ).toHaveCount(0);

    const hold = panel.getByRole("combobox", {
      name: "Deposit hold window",
    });
    await expect(hold.locator("option")).toHaveCount(5);
    await expect(hold.locator("option")).toHaveText([
      "6 hours",
      "12 hours",
      "24 hours",
      "36 hours",
      "48 hours",
    ]);
  });

  test("Booking Rules saves and refetches every v1 value after a full reload", async ({
    page,
  }) => {
    await page.goto("/settings");
    await openSettingsSection(page, "Booking Rules");
    const panel = page.locator("#settings-panel");
    const state = bookingPolicyRpcStates.get(page);
    if (!state) throw new Error("Booking-policy RPC state was not installed.");

    await panel.getByRole("spinbutton", { name: "Booking horizon" }).fill("365");
    await panel.getByRole("spinbutton", { name: "Booking horizon" }).press("Tab");
    await panel.getByRole("switch", { name: "Auto-confirm bookings" }).click();
    await panel.getByRole("combobox", { name: "Deposit hold window" }).selectOption("36");
    await panel.getByLabel("Account name", { exact: true }).fill("Smarter Dog");
    await panel.getByLabel("Sort code", { exact: true }).fill("12-34-56");
    await panel.getByLabel("Account number", { exact: true }).fill("12345678");
    await panel.getByRole("button", { name: "Save bank details" }).click();
    await expect
      .poll(() => state.rules.depositBank.accountName)
      .toBe("Smarter Dog");
    await panel.getByLabel("Deposit Terms version").fill("2026-07 v1");
    await panel.getByLabel("Deposit Terms SHA-256").fill("a".repeat(64));
    await panel.getByRole("button", { name: "Save Terms settings" }).click();
    await expect
      .poll(() => state.rules.depositTermsVersion)
      .toBe("2026-07 v1");

    await page.reload();
    await openSettingsSection(page, "Booking Rules");

    await expect(
      panel.getByRole("spinbutton", { name: "Booking horizon" }),
    ).toHaveValue("365");
    await expect(
      panel.getByRole("switch", { name: "Auto-confirm bookings" }),
    ).toHaveAttribute("aria-checked", "false");
    await expect(
      panel.getByRole("combobox", { name: "Deposit hold window" }),
    ).toHaveValue("36");
    await expect(
      panel.getByLabel("Account name", { exact: true }),
    ).toHaveValue("Smarter Dog");
    await expect(panel.getByLabel("Deposit Terms version")).toHaveValue(
      "2026-07 v1",
    );
    await expect(panel.getByLabel("Deposit Terms SHA-256")).toHaveValue(
      "a".repeat(64),
    );
    await expect(
      panel.getByText(/deposit-dependent bookings are blocked/i),
    ).toHaveCount(0);
  });

  test("Booking Rules retains the confirmed projection after a rejected save and reload", async ({
    page,
  }) => {
    await page.goto("/settings");
    await openSettingsSection(page, "Booking Rules");
    const panel = page.locator("#settings-panel");
    const state = bookingPolicyRpcStates.get(page);
    if (!state) throw new Error("Booking-policy RPC state was not installed.");

    state.rejectNextUpdate = true;
    await panel.getByRole("spinbutton", { name: "Booking horizon" }).fill("365");
    await panel.getByRole("spinbutton", { name: "Booking horizon" }).press("Tab");

    await expect(panel.getByRole("alert")).toContainText(
      "Deterministic policy rejection.",
    );
    await expect(
      panel.getByRole("spinbutton", { name: "Booking horizon" }),
    ).toHaveValue("180");

    await page.reload();
    await openSettingsSection(page, "Booking Rules");
    await expect(
      panel.getByRole("spinbutton", { name: "Booking horizon" }),
    ).toHaveValue("180");
  });

  test("Customer Portal keeps upcoming visits visible without a switch", async ({
    page,
  }) => {
    await page.goto("/settings");
    await openSettingsSection(page, "Customer Portal");

    const panel = page.locator("#settings-panel");
    await expect(
      panel.getByText(/upcoming visits are always visible/i),
    ).toBeVisible();
    await expect(
      panel.getByText("Show upcoming bookings", { exact: true }),
    ).toHaveCount(0);
    await expect(panel.getByRole("switch")).toHaveCount(4);
  });

  test("Customer Portal saves and refetches all four switches after a full reload", async ({
    page,
  }) => {
    await page.goto("/settings");
    await openSettingsSection(page, "Customer Portal");
    const panel = page.locator("#settings-panel");

    const labels = [
      "Show past booking history",
      "Allow repeat booking",
      "Allow cancellations",
      "Allow rescheduling",
    ];
    for (const label of labels) {
      await panel.getByRole("switch", { name: label }).click();
    }

    await page.reload();
    await openSettingsSection(page, "Customer Portal");

    await expect(
      panel.getByRole("switch", { name: "Show past booking history" }),
    ).toHaveAttribute("aria-checked", "false");
    await expect(
      panel.getByRole("switch", { name: "Allow repeat booking" }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      panel.getByRole("switch", { name: "Allow cancellations" }),
    ).toHaveAttribute("aria-checked", "false");
    await expect(
      panel.getByRole("switch", { name: "Allow rescheduling" }),
    ).toHaveAttribute("aria-checked", "false");
  });
});

// Database-level immutability remains covered by
// supabase/tests/145_booking_policy_rules.test.sql (versioned bank instruction
// and Terms publication writes) and 160_staff_visit_policy_commands.test.sql
// (the frozen Terms publication snapshot on each eligible visit). This browser
// suite intentionally verifies only RPC save/refetch and rejection behaviour.
