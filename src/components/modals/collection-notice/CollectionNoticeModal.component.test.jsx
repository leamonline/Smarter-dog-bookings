import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

const invoke = vi.fn();
let trustedLinks = [];
let trustedHumans = [];

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
                error: null,
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
          eq: vi.fn(() => Promise.resolve({ data: trustedLinks, error: null })),
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

vi.mock("../../../supabase/client.js", () => ({ supabase }));

const { CollectionNoticeModal } = await import("./CollectionNoticeModal.jsx");

const bookingFixture = {
  id: "booking-1",
  dogName: "Bella",
  status: "In bath",
  _ownerId: "human-1",
  _bookingDate: "2026-07-14",
};

function renderModal(onSent, onClose = vi.fn()) {
  return render(
    <ToastProvider>
      <CollectionNoticeModal
        booking={bookingFixture}
        onClose={onClose}
        onSent={onSent}
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
  });

  it("calls onSent once after the first successful recipient send", async () => {
    const onSent = vi.fn().mockResolvedValue(undefined);
    invoke.mockResolvedValue({ data: { success: true }, error: null });

    renderModal(onSent);

    await screen.findByText("Owner");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    expect(onSent).toHaveBeenCalledWith(bookingFixture);
  });

  it("does not call onSent when the WhatsApp send fails", async () => {
    const onSent = vi.fn();
    invoke.mockResolvedValue({
      data: { error: "WhatsApp send failed", detail: "Message undeliverable" },
      error: null,
    });

    renderModal(onSent);

    await screen.findByText("Owner");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(onSent).not.toHaveBeenCalled();
  });

  it("does not call onSent when staff close without sending", async () => {
    const onSent = vi.fn();
    const onClose = vi.fn();

    renderModal(onSent, onClose);

    await screen.findByText("Owner");
    fireEvent.click(screen.getByRole("button", { name: "No, close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(invoke).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
  });

  it("does not repeat onSent when a second recipient is sent successfully", async () => {
    trustedLinks = [{ trusted_id: "human-2", relationship: "Partner" }];
    trustedHumans = [{
      id: "human-2",
      name: "Alex",
      surname: "Jones",
      phone: "07123456780",
      whatsapp_opted_out: false,
    }];
    const onSent = vi.fn().mockResolvedValue(undefined);
    invoke.mockResolvedValue({ data: { success: true }, error: null });

    renderModal(onSent);

    await screen.findByText("Partner");
    const sendButtons = screen.getAllByRole("button", { name: "Send" });
    fireEvent.click(sendButtons[0]);
    await waitFor(() => expect(onSent).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it("shows the manual-action error when onSent rejects", async () => {
    const onSent = vi.fn().mockRejectedValue(new Error("ready update failed"));
    invoke.mockResolvedValue({ data: { success: true }, error: null });

    renderModal(onSent);

    await screen.findByText("Owner");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Message sent, but the booking could not be marked ready. Mark it ready manually.",
    );
  });
});
