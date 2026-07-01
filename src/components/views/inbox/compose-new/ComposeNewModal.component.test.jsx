import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ComposeNewModal } from "./ComposeNewModal.jsx";
import { searchHumansAndDogs } from "../../../../supabase/repositories/humansRepo";
import { listForHuman } from "../../../../supabase/repositories/dogsRepo";
import { logger } from "../../../../lib/logger";

vi.mock("../../../../supabase/client.js", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

vi.mock("../../../../supabase/repositories/humansRepo", async (importOriginal) => ({
  ...(await importOriginal()),
  searchHumansAndDogs: vi.fn(),
}));

vi.mock("../../../../supabase/repositories/dogsRepo", async (importOriginal) => ({
  ...(await importOriginal()),
  listForHuman: vi.fn(),
}));

// TemplatePicker drags in the template catalogue + send machinery — none of
// it matters to these tests, and it fires its own data fetches on mount.
vi.mock("../thread/TemplatePicker.jsx", () => ({
  TemplatePicker: () => null,
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

  it("logs a failed dogs lookup instead of silently dropping it", async () => {
    // listForHuman never rejects — failures come back as {dogs: [], error}.
    // The modal must surface that error (Debt #24: the repo {data, error}
    // convention meeting fire-and-forget callers is where errors vanish).
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});
    searchHumansAndDogs.mockResolvedValue([
      { id: "h1", name: "Ada", surname: "Lovelace", phone: "+447700900123" },
    ]);
    listForHuman.mockResolvedValue({ dogs: [], error: new Error("boom") });

    render(<ComposeNewModal onClose={vi.fn()} onSent={vi.fn()} onSentSMS={vi.fn()} />);

    fireEvent.change(
      screen.getByPlaceholderText("Search by name, surname, phone, or dog name…"),
      { target: { value: "Ada" } },
    );

    const row = await screen.findByRole("button", { name: /Ada Lovelace/ });
    fireEvent.click(row);

    await waitFor(() =>
      expect(errorSpy).toHaveBeenCalledWith("compose-new dogs lookup:", expect.any(Error)),
    );
    errorSpy.mockRestore();
  });
});
