import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

const invoke = vi.fn();
vi.mock("../../../supabase/client", () => ({
  supabase: { functions: { invoke: (...args) => invoke(...args) } },
}));

const { BroadcastMessageModal } = await import("./BroadcastMessageModal.jsx");

function renderModal() {
  return render(
    <ToastProvider>
      <BroadcastMessageModal defaultDate="2026-06-29" onClose={vi.fn()} />
    </ToastProvider>,
  );
}

describe("BroadcastMessageModal", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("disables both actions until a reason is typed", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /Preview recipients/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Reason \/ message/i), {
      target: { value: "Closed Monday for a burst pipe" },
    });
    expect(screen.getByRole("button", { name: /Preview recipients/ })).toBeEnabled();
  });

  it("previews via a dry run, then sends for real", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        counts: { sent: 2, skipped: 1, already: 0 },
        sent: [{ human_id: "h1", name: "Sarah", channel: "whatsapp", preview: "Hi Sarah, ..." }],
        skipped: [{ human_id: "h2", name: "Dave", reason: "opted_out_or_no_channel" }],
        can_send: true,
        broadcast_enabled: true,
        template_approved: true,
      },
      error: null,
    });

    renderModal();
    fireEvent.change(screen.getByLabelText(/Reason \/ message/i), {
      target: { value: "Closed Monday" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Preview recipients/ }));

    // Dry run called with dry_run: true.
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("broadcast-message", {
        body: { booking_date: "2026-06-29", reason: "Closed Monday", dry_run: true },
      }),
    );
    // Recipient count (via the Send button label below) + opted-out list surfaced.
    expect(await screen.findByText(/would be messaged/)).toBeInTheDocument();
    expect(screen.getByText("Dave")).toBeInTheDocument();
    expect(screen.getByText(/Opted out of WhatsApp & SMS/)).toBeInTheDocument();

    // Now the real send is enabled.
    invoke.mockResolvedValueOnce({
      data: { counts: { sent: 2, skipped: 1, already: 0 }, sent: [], skipped: [], can_send: true },
      error: null,
    });
    fireEvent.click(screen.getByRole("button", { name: /Send to all \(2\)/ }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("broadcast-message", {
        body: { booking_date: "2026-06-29", reason: "Closed Monday", dry_run: false },
      }),
    );
  });

  it("surfaces the dormant gate when the feature is switched off", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        counts: { sent: 1, skipped: 0, already: 0 },
        sent: [{ human_id: "h1", name: "Sarah", channel: "whatsapp", preview: "Hi Sarah, ..." }],
        skipped: [],
        can_send: false,
        broadcast_enabled: false,
        template_approved: false,
      },
      error: null,
    });

    renderModal();
    fireEvent.change(screen.getByLabelText(/Reason \/ message/i), { target: { value: "Closed" } });
    fireEvent.click(screen.getByRole("button", { name: /Preview recipients/ }));

    expect(await screen.findByText(/the broadcast kill-switch is off/)).toBeInTheDocument();
  });
});
