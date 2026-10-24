import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The My details write path, end to end below the database: the real
 * dashboard, the real data hook and the real RPC wrapper, with only the
 * Supabase client faked. The fake applies update_customer_contact_details'
 * own rules (trim, upper-case postcode, a blank postcode keeps the stored
 * one) to an in-memory humans row, and the assertions read THAT row — what
 * was written — per AGENTS.md, not the arguments handed to the writer. A
 * wrapper that dropped or mis-mapped p_postcode fails here.
 */

const store = vi.hoisted(() => ({ human: null, writes: 0 }));

function rpcResult(value) {
  const promise = Promise.resolve(value);
  return Object.assign(promise, { overrideTypes: () => promise });
}

function blankToNull(value) {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

// Mirrors supabase/migrations/20260712115759_legal_risk_tranche1.sql.
function updateCustomerContactDetails(params) {
  const h = store.human;
  h.name = params.p_name.trim();
  h.surname = params.p_surname.trim();
  h.address = params.p_address.trim();
  h.postcode = (params.p_postcode ?? "").trim().toUpperCase() || h.postcode;
  h.email = blankToNull(params.p_email);
  h.whatsapp = params.p_whatsapp ?? false;
  h.fb = blankToNull(params.p_fb);
  h.insta = blankToNull(params.p_insta);
  h.tiktok = blankToNull(params.p_tiktok);
  store.writes += 1;
  return { data: [{ ...h }], error: null };
}

vi.mock("../../supabase/customerClient", () => ({
  customerSupabase: {
    rpc: (name, params) => {
      if (name === "update_customer_contact_details") {
        return rpcResult(updateCustomerContactDetails(params));
      }
      if (name === "list_customer_trusted_humans") {
        return rpcResult({ data: [], error: null });
      }
      return rpcResult({ data: null, error: { message: `unexpected rpc ${name}` } });
    },
  },
}));

// Reads the dashboard makes alongside, not part of this write path.
vi.mock("../../supabase/repositories/dogsRepo", () => ({
  listForHuman: () => Promise.resolve({ dogs: [], error: null }),
}));
vi.mock("../../supabase/repositories/bookingsRepo", () => ({
  listCustomerBookings: () => Promise.resolve({ bookings: [], error: null }),
  listOlderCustomerBookings: () => Promise.resolve({ bookings: [], error: null }),
  hasCustomerBookingsBefore: () => Promise.resolve(false),
}));
vi.mock("../../supabase/hooks/useCustomerOnboardingActions", () => ({
  useCustomerOnboardingActions: () => ({ lookupAddress: vi.fn() }),
}));
vi.mock("../../hooks/useDraftPersistence", () => ({
  useDraftPersistence: () => ({ restored: null, save: vi.fn(), clear: vi.fn() }),
}));
vi.mock("./AddToCalendarButton.tsx", () => ({
  AddToCalendarButton: () => null,
}));

import { CustomerDashboard } from "./CustomerDashboard.jsx";
import { ToastProvider } from "../../contexts/ToastContext.jsx";

const OPENING = {
  id: "41000000-0000-4000-8000-000000000001",
  name: "Sam",
  surname: "Jones",
  address: "1 Old Road, Hyde, SK14 1AA",
  postcode: "SK14 1AA",
  email: "sam@example.com",
  whatsapp: false,
  fb: null,
  insta: null,
  tiktok: null,
};

function card() {
  return within(screen.getByRole("heading", { name: "My details" }).closest(".portal-card"));
}

async function renderDashboard() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <CustomerDashboard humanRecord={{ ...OPENING, phone: "+447700900123" }} onSignOut={vi.fn()} />
      </ToastProvider>
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "My details" });
}

async function clickSave() {
  await act(async () => {
    fireEvent.click(card().getByRole("button", { name: "Save" }));
  });
  await waitFor(() => expect(card().queryByRole("button", { name: "Save" })).not.toBeInTheDocument());
}

describe("My details write path — the stored row", () => {
  beforeEach(() => {
    store.human = { ...OPENING };
    store.writes = 0;
  });

  it("stores a new address with its own postcode, normalised", async () => {
    await renderDashboard();
    fireEvent.click(card().getByRole("button", { name: /edit details/i }));
    fireEvent.click(card().getByRole("button", { name: "Update address" }));
    fireEvent.click(card().getByRole("button", { name: /enter it manually/i }));
    fireEvent.change(card().getByLabelText("Full address"), { target: { value: "2 New Street, Hyde" } });
    fireEvent.change(card().getByLabelText("Postcode"), { target: { value: " sk14 2ab " } });

    await clickSave();

    expect(store.writes).toBe(1);
    expect(store.human).toMatchObject({ address: "2 New Street, Hyde", postcode: "SK14 2AB" });
    expect(card().getByText("2 New Street, Hyde")).toBeInTheDocument();
  });

  it("keeps the newly stored postcode through a later name-only save", async () => {
    await renderDashboard();
    fireEvent.click(card().getByRole("button", { name: /edit details/i }));
    fireEvent.click(card().getByRole("button", { name: "Update address" }));
    fireEvent.click(card().getByRole("button", { name: /enter it manually/i }));
    fireEvent.change(card().getByLabelText("Full address"), { target: { value: "2 New Street, Hyde" } });
    fireEvent.change(card().getByLabelText("Postcode"), { target: { value: "SK14 2AB" } });
    await clickSave();

    fireEvent.click(card().getByRole("button", { name: /edit details/i }));
    fireEvent.change(card().getByLabelText("First name"), { target: { value: "  Samantha " } });
    await clickSave();

    expect(store.writes).toBe(2);
    expect(store.human).toMatchObject({
      name: "Samantha",
      address: "2 New Street, Hyde",
      postcode: "SK14 2AB",
    });
    // The card shows the stored (trimmed) name, and Cancel returns to it.
    fireEvent.click(card().getByRole("button", { name: /edit details/i }));
    fireEvent.change(card().getByLabelText("First name"), { target: { value: "Zed" } });
    fireEvent.click(card().getByRole("button", { name: /cancel/i }));
    expect(card().getByText("Samantha Jones")).toBeInTheDocument();
  });

  it("leaves the stored address and postcode alone when only the name changes", async () => {
    await renderDashboard();
    fireEvent.click(card().getByRole("button", { name: /edit details/i }));
    fireEvent.change(card().getByLabelText("First name"), { target: { value: "Samantha" } });

    await clickSave();

    expect(store.human).toMatchObject({
      name: "Samantha",
      address: OPENING.address,
      postcode: OPENING.postcode,
    });
  });
});
