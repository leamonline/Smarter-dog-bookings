import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CustomerContextPanel } from "./CustomerContextPanel.jsx";

function matchedContext(overrides = {}) {
  return {
    human: {
      id: "human-1",
      fullName: "Sarah Jones",
      name: "Sarah",
      surname: "Jones",
      phone: "+447700900123",
    },
    dogs: [],
    lastBooking: null,
    trustedContacts: [],
    summary: "",
    loading: false,
    error: null,
    ...overrides,
  };
}

describe("CustomerContextPanel", () => {
  it("does not show stale customer details while a new context is loading", () => {
    render(
      <CustomerContextPanel
        conversation={{ phone_e164: "+447700900123" }}
        context={{
          human: { id: "old-human", fullName: "Old Customer", phone: "+447700900999" },
          dogs: [],
          lastBooking: null,
          trustedContacts: [],
          summary: "Old Customer has one dog.",
          loading: true,
          error: null,
        }}
      />,
    );

    expect(screen.getByText("Loading...")).toBeInTheDocument();
    expect(screen.queryByText("Old Customer")).not.toBeInTheDocument();
    expect(screen.queryByText("Old Customer has one dog.")).not.toBeInTheDocument();
  });

  it("lets staff save a private note on the conversation", async () => {
    const onSaveConversationNotes = vi.fn().mockResolvedValue({ ok: true });

    render(
      <CustomerContextPanel
        conversation={{
          id: "conv-1",
          phone_e164: "+447700900123",
          notes: "Prefers quieter appointment slots.",
        }}
        context={matchedContext()}
        onSaveConversationNotes={onSaveConversationNotes}
      />,
    );

    const note = screen.getByLabelText("Conversation note");
    expect(note).toHaveValue("Prefers quieter appointment slots.");

    fireEvent.change(note, {
      target: { value: "Prefers quieter appointment slots. Ask about matting." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save note" }));

    await waitFor(() =>
      expect(onSaveConversationNotes).toHaveBeenCalledWith(
        "conv-1",
        "Prefers quieter appointment slots. Ask about matting.",
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Note saved.");
  });
});
