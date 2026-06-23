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

  it("shows the owner's profile notes as a read-only card and drops the conversation-note editor", () => {
    render(
      <CustomerContextPanel
        conversation={{ id: "conv-1", phone_e164: "+447700900123", notes: "thread note (should NOT show)" }}
        context={matchedContext({
          human: {
            id: "human-1",
            fullName: "Sarah Jones",
            name: "Sarah",
            surname: "Jones",
            phone: "+447700900123",
            notes: "Owner prefers morning slots.",
          },
        })}
      />,
    );

    // Owner profile notes (humans.notes) are shown read-only.
    expect(screen.getByText("Owner prefers morning slots.")).toBeInTheDocument();
    // The old per-conversation note editor is gone.
    expect(screen.queryByLabelText("Conversation note")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save note" })).not.toBeInTheDocument();
  });

  it("offers an Update notes action that calls the handler", async () => {
    const onUpdateNotes = vi.fn().mockResolvedValue({ ok: true, summary: "Saved a new customer note." });

    render(
      <CustomerContextPanel
        conversation={{ id: "conv-1", phone_e164: "+447700900123" }}
        context={matchedContext()}
        onUpdateNotes={onUpdateNotes}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /update notes/i }));

    await waitFor(() => expect(onUpdateNotes).toHaveBeenCalledTimes(1));
  });

  it("orders the panel: notes card → dog → actions → details, with email as a button", () => {
    render(
      <CustomerContextPanel
        conversation={{ id: "conv-1", phone_e164: "+447700900123" }}
        context={matchedContext({
          human: {
            id: "human-1",
            fullName: "Sarah Jones",
            name: "Sarah",
            surname: "Jones",
            phone: "+447700900123",
            email: "sarah@example.com",
            notes: "Owner prefers mornings.",
            address: "1 High St",
          },
          dogs: [{ id: "dog-1", name: "Rex", breed: "Cockapoo" }],
        })}
        onOpenHuman={vi.fn()}
        onBookAppointment={vi.fn()}
      />,
    );

    const notes = screen.getByText("Owner prefers mornings.");
    const dog = screen.getByText("Rex");
    const emailBtn = screen.getByRole("link", { name: /email/i });
    const bookAppointment = screen.getByRole("button", { name: /Book appointment/i });
    const detailsHeading = screen.getByText("Details");

    const follows = (a, b) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

    expect(follows(notes, dog)).toBe(true); // NOTES card above the dog card
    expect(follows(dog, bookAppointment)).toBe(true); // dog before the actions
    expect(follows(bookAppointment, detailsHeading)).toBe(true); // actions before details
    // Email is an action button (mailto), not a plain detail line.
    expect(emailBtn).toHaveAttribute("href", "mailto:sarah@example.com");
  });
});
