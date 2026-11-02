import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

const invoke = vi.fn();
let trustedLinks = [];
let trustedHumans = [];
let contactQueryError = null;
let ownerDayRows = null;
// Per-call overrides for the owner-day lookup, consumed in order, so a test
// can hold one lookup open while a later one resolves.
let dayLookupQueue = [];

const defaultDayRows = () => [
  {
    id: "booking-1",
    status: "Arrived",
    dog_name_snapshot: "Bella",
    dogs: { human_id: "human-1", name: "Bella" },
  },
];

const dayRow = (id, status, name) => ({
  id,
  status,
  dog_name_snapshot: name,
  dogs: { human_id: "human-1", name },
});

function makeBookingsQuery() {
  const query = {
    eq: vi.fn(() => query),
    neq: vi.fn(() =>
      dayLookupQueue.length
        ? dayLookupQueue.shift()
        : Promise.resolve({ data: ownerDayRows ?? defaultDayRows(), error: null }),
    ),
  };
  return query;
}

const tablesQueried = () => supabase.from.mock.calls.map(([table]) => table);

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
  status: "Ready for collection",
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
    ownerDayRows = null;
    dayLookupQueue = [];
  });

  it("asks before loading recipient controls", async () => {
    renderModal();

    expect(await screen.findByText(/message their humans/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Minutes until ready for collection")).not.toBeInTheDocument();
    // Only booking statuses are read before staff opt in, never contact details.
    expect(tablesQueried()).toEqual(["bookings"]);

    fireEvent.click(await screen.findByRole("button", { name: "Send message" }));

    expect(await screen.findByLabelText("Minutes until ready for collection")).toHaveValue(15);
    expect(await screen.findByText("Owner")).toBeInTheDocument();
  });

  it("closes from Not now without loading contacts or sending", async () => {
    const onClose = vi.fn();

    renderModal(onClose);

    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(tablesQueried()).toEqual(["bookings"]);
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
    fireEvent.click(await screen.findByRole("button", { name: "Send message" }));

    await screen.findByText("Partner");
    expect(screen.getByLabelText("Minutes until ready for collection")).toHaveValue(15);
    expect(screen.getByText(/finished pampering Bella and they.re ready to head home in 15 mins/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Send" })).toHaveLength(2);
  });

  it("sends the existing collection template to the chosen recipient", async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    renderModal();
    fireEvent.click(await screen.findByRole("button", { name: "Send message" }));

    await screen.findByText("Owner");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith(
      "whatsapp-send",
      expect.objectContaining({
        body: expect.objectContaining({
          human_id: "human-1",
          template_name: "ready_for_collection_v2",
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
    fireEvent.click(await screen.findByRole("button", { name: "Send message" }));

    await screen.findByText("Owner");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Message undeliverable");
    expect(screen.getByRole("heading", { name: /is ready/i })).toBeInTheDocument();
  });

  it("reports a contact-load failure without claiming there are no contacts", async () => {
    contactQueryError = new Error("query failed");
    renderModal();

    fireEvent.click(await screen.findByRole("button", { name: "Send message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn.t load contact details/i);
    expect(screen.getByRole("heading", { name: /is ready/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.queryByText(/no contact to notify/i)).not.toBeInTheDocument();
  });

  it("re-runs contact queries and shows recipients after a successful retry", async () => {
    contactQueryError = new Error("query failed");
    renderModal();
    fireEvent.click(await screen.findByRole("button", { name: "Send message" }));

    await screen.findByRole("alert");
    const callsAfterFailure = supabase.from.mock.calls.length;
    contactQueryError = null;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Owner")).toBeInTheDocument();
    expect(supabase.from.mock.calls.length).toBeGreaterThan(callsAfterFailure);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  describe("customers with more than one dog in that day", () => {
    it("holds the message, and closes without a modal, while a sibling is still in the salon", async () => {
      ownerDayRows = [
        dayRow("booking-1", "Ready for collection", "Bella"),
        dayRow("booking-2", "Arrived", "Max"),
      ];
      const onClose = vi.fn();

      renderModal(onClose);

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole("button", { name: "Send message" })).not.toBeInTheDocument();
      expect(screen.getByText(/Holding the message until Max is ready too/i)).toBeInTheDocument();
      expect(tablesQueried()).toEqual(["bookings"]);
      expect(invoke).not.toHaveBeenCalled();
    });

    it("names both dogs once the last one is ready", async () => {
      ownerDayRows = [
        dayRow("booking-1", "Arrived", "Bella"), // the one that just became ready
        dayRow("booking-2", "Ready for collection", "Max"),
      ];
      const onClose = vi.fn();

      renderModal(onClose);

      expect(await screen.findByRole("heading", { name: /Bella and Max are ready/i })).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("does not wait for, or name, a dog that has already gone home", async () => {
      ownerDayRows = [
        dayRow("booking-1", "Ready for collection", "Bella"),
        dayRow("booking-2", "Completed", "Max"),
      ];
      const onClose = vi.fn();

      renderModal(onClose);

      expect(await screen.findByRole("heading", { name: /^Bella is ready$/i })).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("sends both dogs' names in one parameter, and the wording reads correctly for two", async () => {
      invoke.mockResolvedValue({ data: { success: true }, error: null });
      ownerDayRows = [
        dayRow("booking-1", "Arrived", "Bella"),
        dayRow("booking-2", "Ready for collection", "Max"),
      ];
      renderModal();

      fireEvent.click(await screen.findByRole("button", { name: "Send message" }));
      expect(
        await screen.findByText(/finished pampering Bella and Max and they.re ready to head home in 15 mins/i),
      ).toBeInTheDocument();

      await screen.findByText("Owner");
      fireEvent.click(screen.getByRole("button", { name: "Send" }));

      await waitFor(() => expect(invoke).toHaveBeenCalledWith(
        "whatsapp-send",
        expect.objectContaining({
          body: expect.objectContaining({
            template_name: "ready_for_collection_v2",
            params: ["Bella and Max", "15"],
          }),
        }),
      ));
    });

    it("a reopened notice is not closed by the stale lookup it superseded", async () => {
      // 1st lookup (Bella just became Ready, Max still in) is held open.
      let finishStale;
      dayLookupQueue = [
        new Promise((resolve) => {
          finishStale = () =>
            resolve({
              data: [
                dayRow("booking-1", "Ready for collection", "Bella"),
                dayRow("booking-2", "Arrived", "Max"),
              ],
              error: null,
            });
        }),
      ];
      const onClose = vi.fn();
      const ui = (booking) => (
        <ToastProvider>
          <CollectionNoticeModal booking={booking} onClose={onClose} />
        </ToastProvider>
      );
      const { rerender } = render(ui({ ...bookingFixture }));

      // Max is cancelled before that lookup returns, so Bella's notice is
      // reopened: a NEW object for the same booking. Its lookup finds Max gone.
      ownerDayRows = [dayRow("booking-1", "Ready for collection", "Bella")];
      rerender(ui({ ...bookingFixture }));
      expect(await screen.findByRole("button", { name: "Send message" })).toBeInTheDocument();

      // The stale lookup now finishes, still seeing Max as waiting.
      await act(async () => {
        finishStale();
      });

      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
    });

    it("still lets staff message if the sibling lookup fails", async () => {
      supabase.from.mockImplementationOnce(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              neq: vi.fn(() => Promise.resolve({ data: null, error: new Error("boom") })),
            })),
          })),
        })),
      }));

      renderModal();

      expect(await screen.findByRole("button", { name: "Send message" })).toBeInTheDocument();
    });
  });
});
