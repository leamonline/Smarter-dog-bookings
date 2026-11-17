// The receipt must name every recipient submitted with the save. Start over
// clears the live recipient ref while the insert is still running; reading
// that ref afterwards would hide a trusted person's failed or unknown send.
import { describe, it, expect, vi } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../contexts/ToastContext.jsx";

const captured = vi.hoisted(() => ({ receipts: [] }));
// The drawer can be booked as soon as the dog and slot are ready. Trusted
// contacts arrive on a later promise. Releasing that promise from the test
// keeps the click from skipping the recipient step under a slow coverage run.
const trustedGate = vi.hoisted(() => {
  let release = () => {};
  const pending = new Promise((resolve) => { release = resolve; });
  return { pending, release, fetch: vi.fn(() => pending) };
});

vi.mock("../../supabase/hooks/humans/useTrustedContacts", () => ({
  fetchTrustedContactsForHuman: trustedGate.fetch,
}));

vi.mock("../../supabase/hooks/useBookingConfirmation", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useBookingConfirmation: (bookingIds, humanIds, enabled) => {
      captured.receipts.push({ bookingIds: [...bookingIds], humanIds: [...humanIds], enabled });
      return {
        state: "delivered", retryBookingIds: [], error: "", retrying: false,
        retry: vi.fn(), refresh: vi.fn(), sample: false,
      };
    },
  };
});

import { NewBookingModal } from "./NewBookingModal.jsx";

const OPEN_DATE = "2099-01-05";
const luna = {
  id: "dog-luna", name: "Luna", breed: "Poodle", size: "small",
  humanId: "Emma Wilson", _humanId: "emma-id", alerts: [],
};

describe("booking receipt recipient scope", () => {
  it("keeps the trusted recipient after Start over during the save", async () => {
    captured.receipts.length = 0;
    let finishSave;
    const onAdd = vi.fn(() => new Promise((resolve) => { finishSave = resolve; }));
    render(
      <ToastProvider>
        <NewBookingModal
          onClose={vi.fn()}
          onAdd={onAdd}
          dogs={{}}
          humans={{ owner: { id: "emma-id", fullName: "Emma Wilson", name: "Emma", phone: "+447700900123", whatsapp: true } }}
          dogsByHumanId={{}}
          ensureDogsForHumans={vi.fn()}
          bookingsByDate={{}}
          dayOpenState={{ [OPEN_DATE]: true }}
          daySettings={{}}
          initialDateStr={OPEN_DATE}
          initialSlot="09:00"
          initialEntries={[{ dog: luna, humanKey: "Emma Wilson", service: "full-groom", addons: [] }]}
        />
      </ToastProvider>,
    );
    const book = await screen.findByRole("button", { name: "Book & send confirmation" });
    await waitFor(() => expect(book).toBeEnabled());
    expect(trustedGate.fetch).toHaveBeenCalledWith("emma-id");
    await act(async () => {
      trustedGate.release({
        trustedContacts: [{ id: "trusted-id", fullName: "Sam Trusted", relationship: "partner" }],
      });
      await trustedGate.pending;
    });
    fireEvent.click(book);
    expect(onAdd).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "Who should we notify?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Sam Trusted/i }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
    expect(await screen.findByRole("button", { name: "Creating booking…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    finishSave({ ok: true, bookings: [{ id: "saved-real-id" }] });
    expect(await screen.findByRole("heading", { name: "Booking created" })).toBeInTheDocument();
    const receipt = captured.receipts.at(-1);
    expect(receipt.bookingIds).toEqual(["saved-real-id"]);
    expect(receipt.humanIds).toEqual(["emma-id", "trusted-id"]);
    expect(receipt.enabled).toBe(true);
  });
});

// With "Preferred service", the server skips an owner nobody can reach and
// writes no log for them. The receipt must not wait on that missing log, or it
// stays pending forever and withholds the message-only retry.
describe("booking receipt with an owner nobody can reach", () => {
  const unreachable = { id: "emma-id", fullName: "Emma Wilson", name: "Emma", phone: null, email: null, whatsapp: true };
  const renderDrawer = (owner) => render(
    <ToastProvider>
      <NewBookingModal
        onClose={vi.fn()}
        onAdd={vi.fn().mockResolvedValue({ ok: true, bookings: [{ id: "saved-real-id" }] })}
        dogs={{}}
        humans={{ owner }}
        dogsByHumanId={{}}
        ensureDogsForHumans={vi.fn()}
        bookingsByDate={{}}
        dayOpenState={{ [OPEN_DATE]: true }}
        daySettings={{}}
        initialDateStr={OPEN_DATE}
        initialSlot="09:00"
        initialEntries={[{ dog: luna, humanKey: "Emma Wilson", service: "full-groom", addons: [] }]}
      />
    </ToastProvider>,
  );

  it("tracks only the trusted contact who was actually messaged", async () => {
    captured.receipts.length = 0;
    renderDrawer({ ...unreachable, trustedContacts: [{ id: "trusted-id", fullName: "Sam Trusted", relationship: "partner" }] });
    fireEvent.click(await screen.findByRole("button", { name: "Book & send confirmation" }));
    expect(await screen.findByRole("heading", { name: "Who should we notify?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Sam Trusted/i }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm booking" }));
    expect(await screen.findByRole("heading", { name: "Booking created" })).toBeInTheDocument();
    const receipt = captured.receipts.at(-1);
    expect(receipt.humanIds).toEqual(["trusted-id"]);
    expect(receipt.enabled).toBe(true);
    expect(screen.getByText("Confirmation delivered")).toBeInTheDocument();
  });

  it("says no confirmation was sent when the unreachable owner was the only recipient", async () => {
    captured.receipts.length = 0;
    trustedGate.fetch.mockResolvedValueOnce({ trustedContacts: [] });
    renderDrawer(unreachable);
    fireEvent.click(await screen.findByRole("button", { name: "Book & send confirmation" }));
    expect(await screen.findByRole("heading", { name: "Booking created" })).toBeInTheDocument();
    expect(screen.getByText("No confirmation sent")).toBeInTheDocument();
    expect(screen.getByText(/no usable phone number or email for Emma/)).toBeInTheDocument();
    expect(captured.receipts.at(-1).enabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Refresh message status" })).not.toBeInTheDocument();
  });

  it("leaves a reachable owner on the receipt", async () => {
    captured.receipts.length = 0;
    trustedGate.fetch.mockResolvedValueOnce({ trustedContacts: [] });
    renderDrawer({ ...unreachable, phone: "+447700900123" });
    fireEvent.click(await screen.findByRole("button", { name: "Book & send confirmation" }));
    expect(await screen.findByRole("heading", { name: "Booking created" })).toBeInTheDocument();
    expect(captured.receipts.at(-1)).toMatchObject({ humanIds: ["emma-id"], enabled: true });
  });
});
