import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

vi.mock("../../../supabase/client", () => ({ supabase: null }));

const { CollectionNoticeModal } = await import("./CollectionNoticeModal.jsx");

describe("CollectionNoticeModal offline recovery", () => {
  it("offers truthful manual recovery instead of loading contacts forever", async () => {
    render(
      <ToastProvider>
        <CollectionNoticeModal
          booking={{
            id: "booking-1",
            dogName: "Bella",
            _ownerId: "human-1",
            _bookingDate: "2026-07-14",
          }}
          onClose={vi.fn()}
        />
      </ToastProvider>,
    );

    expect(screen.queryByText(/isn't available offline/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await screen.findByText(
        "Collection messaging isn't available offline. Contact the customer directly.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading contacts…")).not.toBeInTheDocument();
  });
});
