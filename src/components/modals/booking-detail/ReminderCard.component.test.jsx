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

  it("makes the collection message primary when the groom is Ready", () => {
    render(
      <ReminderCard
        booking={{ id: "b1", dogName: "Freddie", owner: "Tom Clark", status: "Ready for pick-up", reminderState: "none" }}
        pickupHuman={{ fullName: "Tom Clark", phone: "+447700900000" }}
        isEditing={false}
        onSendReminder={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: /send pickup-ready sms/i })).toHaveAttribute("data-priority", "primary");
  });

  it("keeps the collection message secondary before Ready", () => {
    render(
      <ReminderCard
        booking={{ id: "b1", dogName: "Freddie", owner: "Tom Clark", status: "In bath", reminderState: "none" }}
        pickupHuman={{ fullName: "Tom Clark", phone: "+447700900000" }}
        isEditing={false}
        onSendReminder={vi.fn()}
      />,
    );
    expect(screen.getByRole("link", { name: /send pickup-ready sms/i })).toHaveAttribute("data-priority", "secondary");
  });
});
