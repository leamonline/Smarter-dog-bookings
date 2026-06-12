import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ComposeNewModal } from "./ComposeNewModal.jsx";

vi.mock("../../../../supabase/client.js", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        New message
      </button>
      {open && (
        <ComposeNewModal
          onClose={() => setOpen(false)}
          onSent={vi.fn()}
          onSentSMS={vi.fn()}
        />
      )}
    </>
  );
}

describe("ComposeNewModal", () => {
  it("closes on Escape and restores focus to the opener", async () => {
    render(<Harness />);

    const opener = screen.getByRole("button", { name: "New message" });
    opener.focus();
    fireEvent.click(opener);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Search by name, surname, phone, or dog name…"),
    ).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
