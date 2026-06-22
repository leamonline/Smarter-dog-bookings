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

    expect(screen.getByText("Loading customer…")).toBeInTheDocument();
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

  it("orders the panel: dog card → note → actions → details (email last)", () => {
    render(
      <CustomerContextPanel
        conversation={{ id: "conv-1", phone_e164: "+447700900123", notes: "" }}
        context={matchedContext({
          human: {
            id: "human-1",
            fullName: "Sarah Jones",
            name: "Sarah",
            surname: "Jones",
            phone: "+447700900123",
            email: "sarah@example.com",
          },
          dogs: [{ id: "dog-1", name: "Rex", breed: "Cockapoo" }],
        })}
        onOpenHuman={vi.fn()}
        onBookAppointment={vi.fn()}
        onSaveConversationNotes={vi.fn()}
      />,
    );

    const dog = screen.getByText("Rex");
    const note = screen.getByText("Conversation note");
    const bookAppointment = screen.getByRole("button", { name: /Book appointment/i });
    const detailsHeading = screen.getByText("Details");
    const email = screen.getByText("sarah@example.com");

    const follows = (a, b) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    expect(follows(dog, note)).toBe(true); // dog card before the note
    expect(follows(note, bookAppointment)).toBe(true); // note before the actions
    expect(follows(bookAppointment, detailsHeading)).toBe(true); // actions before details
    expect(follows(detailsHeading, email)).toBe(true); // email lives under details, at the end
  });
});
