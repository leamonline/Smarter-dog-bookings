import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

const invoke = vi.fn();
let trustedLinks = [];
let trustedHumans = [];
let contactQueryError = null;

function makeBookingsQuery() {
  const query = {
    eq: vi.fn(() => query),
    neq: vi.fn(() =>
      Promise.resolve({
        data: [
          {
            id: "booking-1",
            status: "In bath",
            dog_name_snapshot: "Bella",
            dogs: { human_id: "human-1", name: "Bella" },
          },
        ],
        error: null,
      }),
    ),
  };
  return query;
}

const supabase = {
  from: vi.fn((table) => {
    if (table === "humans") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() =>
              Promise.resolve({
                data: {
                  id: "human-1",
                  name: "Sarah",
                  surname: "Jones",
                  phone: "07123456789",
                  whatsapp_opted_out: false,
                },
                error: contactQueryError,
              }),
            ),
          })),
          in: vi.fn(() => Promise.resolve({ data: trustedHumans, error: null })),
        })),
      };
    }
    if (table === "human_trusted_contacts") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: trustedLinks, error: contactQueryError })),
        })),
      };
    }
    if (table === "bookings") {
      return { select: vi.fn(() => makeBookingsQuery()) };
    }
    throw new Error(`Unexpected table: ${table}`);
  }),
  functions: { invoke: (...args) => invoke(...args) },
};

vi.mock("../../../supabase/client", () => ({ supabase }));

const { CollectionNoticeModal } = await import("./CollectionNoticeModal.jsx");

const bookingFixture = {
  id: "booking-1",
  dogName: "Bella",
  status: "Ready for pick-up",
  _ownerId: "human-1",
  _bookingDate: "2026-07-14",
};

function renderModal(onClose = vi.fn()) {
  return render(
    <ToastProvider>
      <CollectionNoticeModal
        booking={bookingFixture}
        onClose={onClose}
      />
    </ToastProvider>,
  );
}

describe("CollectionNoticeModal", () => {
  beforeEach(() => {
    invoke.mockReset();
    supabase.from.mockClear();
    trustedLinks = [];
    trustedHumans = [];
    contactQueryError = null;
  });

  it("asks before loading recipient controls", async () => {
    renderModal();

    expect(screen.getByText(/message their humans/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Minutes until ready for collection")).not.toBeInTheDocument();
    expect(supabase.from).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByLabelText("Minutes until ready for collection")).toHaveValue(15);
    expect(await screen.findByText("Owner")).toBeInTheDocument();
  });

  it("closes from Not now without loading contacts or sending", () => {
    const onClose = vi.fn();

    renderModal(onClose);

    fireEvent.click(screen.getByRole("button", { name: "Not now" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(supabase.from).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("retains the ready-in, preview and recipient controls when composing", async () => {
    trustedLinks = [{ trusted_id: "human-2", relationship: "Partner" }];
    trustedHumans = [{
      id: "human-2",
      name: "Alex",
      surname: "Jones",
      phone: "07123456780",
      whatsapp_opted_out: false,
    }];
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("Partner");
    expect(screen.getByLabelText("Minutes until ready for collection")).toHaveValue(15);
    expect(screen.getByText(/Bella is all done.*15 mins/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Send" })).toHaveLength(2);
  });

  it("sends the existing collection template to the chosen recipient", async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("Owner");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith(
      "whatsapp-send",
      expect.objectContaining({
        body: expect.objectContaining({
          human_id: "human-1",
          template_name: "ready_for_collection_v1",
          to: "+447123456789",
        }),
      }),
    ));
    expect(await screen.findByRole("button", { name: "Sent ✓" })).toBeDisabled();
    expect(screen.getByRole("heading", { name: /is ready/i })).toBeInTheDocument();
  });

  it("keeps Ready when sending fails", async () => {
    invoke.mockResolvedValue({
      data: { error: "WhatsApp send failed", detail: "Message undeliverable" },
      error: null,
    });

    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText("Owner");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Message undeliverable");
    expect(screen.getByRole("heading", { name: /is ready/i })).toBeInTheDocument();
  });

  it("reports a contact-load failure without claiming there are no contacts", async () => {
    contactQueryError = new Error("query failed");
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn.t load contact details/i);
    expect(screen.getByRole("heading", { name: /is ready/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.queryByText(/no contact to notify/i)).not.toBeInTheDocument();
  });

  it("re-runs contact queries and shows recipients after a successful retry", async () => {
    contactQueryError = new Error("query failed");
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByRole("alert");
    const callsAfterFailure = supabase.from.mock.calls.length;
    contactQueryError = null;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Owner")).toBeInTheDocument();
    expect(supabase.from.mock.calls.length).toBeGreaterThan(callsAfterFailure);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
