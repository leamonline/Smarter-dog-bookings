import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { ReminderCard } from "./ReminderCard.jsx";

const baseBooking = {
  dogName: "Bella",
  owner: "Jane Smith",
  reminderState: "none",
  reminderSentAt: null,
  reminderConfirmedAt: null,
};

describe("ReminderCard", () => {
  it("shows a Send reminder button in the 'none' state and calls onSendReminder", async () => {
    const onSendReminder = vi.fn();
    render(
      <ReminderCard booking={{ ...baseBooking }} pickupHuman={null} isEditing={false} onSendReminder={onSendReminder} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /send reminder/i }));
    expect(onSendReminder).toHaveBeenCalledTimes(1);
  });

  it("shows read-only sent status and no send/resend button once sent", () => {
    render(
      <ReminderCard
        booking={{ ...baseBooking, reminderState: "sent", reminderSentAt: "2026-06-18T08:00:00Z" }}
        pickupHuman={null}
        isEditing={false}
        onSendReminder={vi.fn()}
      />,
    );
    expect(screen.getByText(/reminder sent/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send reminder|resend/i })).toBeNull();
  });

  it("shows confirmed status only when confirmed", () => {
    render(
      <ReminderCard
        booking={{ ...baseBooking, reminderState: "confirmed" }}
        pickupHuman={null}
        isEditing={false}
        onSendReminder={vi.fn()}
      />,
    );
    expect(screen.getByText(/confirmed by/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send reminder|resend/i })).toBeNull();
  });

  it("makes the collection message primary and first when the groom is Ready", () => {
    render(
      <ReminderCard
        booking={{ id: "b1", dogName: "Freddie", owner: "Tom Clark", status: "Ready for pick-up", reminderState: "none" }}
        pickupHuman={{ fullName: "Tom Clark", phone: "+447700900000" }}
        isEditing={false}
        onSendReminder={vi.fn()}
      />,
    );
    const collectionLink = screen.getByRole("link", { name: /send pickup-ready sms/i });
    const reminderButton = screen.getByRole("button", { name: /send reminder/i });
    expect(collectionLink).toHaveAttribute("data-priority", "primary");
    expect(collectionLink.compareDocumentPosition(reminderButton)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(collectionLink).toHaveClass("min-h-11");
    expect(reminderButton).toHaveClass("min-h-11");
  });

  it("keeps the collection message secondary and after the reminder before Ready", () => {
    render(
      <ReminderCard
        booking={{ id: "b1", dogName: "Freddie", owner: "Tom Clark", status: "In bath", reminderState: "none" }}
        pickupHuman={{ fullName: "Tom Clark", phone: "+447700900000" }}
        isEditing={false}
        onSendReminder={vi.fn()}
      />,
    );
    const collectionLink = screen.getByRole("link", { name: /send pickup-ready sms/i });
    const reminderButton = screen.getByRole("button", { name: /send reminder/i });
    expect(collectionLink).toHaveAttribute("data-priority", "secondary");
    expect(reminderButton.compareDocumentPosition(collectionLink)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("keeps the collection message secondary after Ready", () => {
    render(
      <ReminderCard
        booking={{ id: "b1", dogName: "Freddie", owner: "Tom Clark", status: "Completed", reminderState: "none" }}
        pickupHuman={{ fullName: "Tom Clark", phone: "+447700900000" }}
        isEditing={false}
        onSendReminder={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: /send pickup-ready sms/i })).toHaveAttribute("data-priority", "secondary");
  });

  it("opens the correctly encoded pickup SMS without sending a reminder", async () => {
    const onSendReminder = vi.fn();
    render(
      <ReminderCard
        booking={{ id: "b1", dogName: "Freddie", owner: "Tom Clark", status: "Ready for pick-up", reminderState: "none" }}
        pickupHuman={{ fullName: "Tom Clark", phone: "+447700900000" }}
        isEditing={false}
        onSendReminder={onSendReminder}
      />,
    );
    const collectionLink = screen.getByRole("link", { name: /send pickup-ready sms/i });
    const body = "Hey, it's Smarter Dog Grooming Salon\nFreddie will be ready for collection in 15mins.\nSee you soon 🎓🐶❤️ X";
    expect(collectionLink.getAttribute("href")).toBe(`sms:+447700900000?body=${encodeURIComponent(body)}`);

    collectionLink.addEventListener("click", (event) => event.preventDefault(), { once: true });
    await userEvent.click(collectionLink);
    expect(onSendReminder).not.toHaveBeenCalled();
  });
});
