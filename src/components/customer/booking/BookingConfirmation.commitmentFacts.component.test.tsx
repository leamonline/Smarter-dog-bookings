import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BookingConfirmation } from "./BookingConfirmation";
import { depositForDogsPence } from "../../../constants/index";
import type { CustomerDog } from "../../../supabase/repositories/dogsRepo";

type Step5Props = ComponentProps<typeof BookingConfirmation>;

// Step 5 is the commitment point: whatever it says here is what the customer
// believes they are agreeing to. Two facts used to be wrong at exactly this
// moment — the deposit was never mentioned until after the booking was written,
// and the cancellation window was hard-coded to "the day before" while the
// server enforces a configurable deadline measured from the appointment time.

const alfie = { dogId: "dog-1", name: "Alfie", size: "small" as const };
const tipi = { dogId: "dog-2", name: "Tipi", size: "small" as const };

const dogRecords: CustomerDog[] = [
  { id: "dog-1", name: "Alfie", breed: "Boston Terrier", size: "small", reportedSize: "small", isPregnant: false },
  { id: "dog-2", name: "Tipi", breed: "Boston Terrier", size: "small", reportedSize: "small", isPregnant: false },
];

function renderStep5(overrides: Partial<Step5Props> = {}) {
  const props: Step5Props = {
    selectedDogs: [alfie],
    services: { "dog-1": "full-groom" },
    selectedDate: "2099-06-15",
    slotAllocation: {
      dropOffTime: "10:00",
      groupId: "g1",
      assignments: [{ dogId: "dog-1", slot: "10:00" }],
    },
    onConfirm: () => {},
    onBack: () => {},
    submitting: false,
    dogs: dogRecords,
    ...overrides,
  };
  return render(<BookingConfirmation {...props} />);
}

describe("BookingConfirmation — deposit disclosure before commitment", () => {
  it("says nothing about a deposit when none is due", () => {
    renderStep5();

    expect(screen.queryByText("Deposit")).toBeNull();
    expect(screen.getByText(/paid at pick-up/i)).toBeInTheDocument();
  });

  it("states the deposit beside the total before the confirm action", () => {
    renderStep5({ depositTotal: 10 });

    expect(screen.getByText("Deposit")).toBeInTheDocument();
    expect(screen.getByText("£10")).toBeInTheDocument();
    expect(screen.getByText(/to hold this appointment/i)).toBeInTheDocument();
    // The total must stop claiming the whole sum is settled at pick-up.
    expect(screen.queryByText(/From £42 \(paid at pick-up\)/i)).toBeNull();
  });

  it("charges the flat deposit per dog, so a two-dog visit holds twice", () => {
    renderStep5({
      selectedDogs: [alfie, tipi],
      services: { "dog-1": "full-groom", "dog-2": "bath-and-brush" },
      slotAllocation: {
        dropOffTime: "10:00",
        groupId: "g1",
        assignments: [
          { dogId: "dog-1", slot: "10:00" },
          { dogId: "dog-2", slot: "10:00" },
        ],
      },
      depositTotal: depositForDogsPence(2) / 100,
    });

    expect(screen.getByText("£20")).toBeInTheDocument();
    expect(screen.getByText(/£10 per pup/i)).toBeInTheDocument();
  });

  it("stays silent when the per-owner deposit rule could not be read", () => {
    // The rule fails open, so absence of the flag is not evidence that nothing
    // is owed — and step 5 must not turn that silence into a promise.
    renderStep5({ depositTotal: null });

    expect(screen.queryByText("Deposit")).toBeNull();
    expect(screen.queryByText(/to hold this appointment/i)).toBeNull();
  });
});

describe("BookingConfirmation — change-deadline note", () => {
  it("renders the sentence the server supplied, not a hard-coded one", () => {
    renderStep5({
      changeDeadlineNote: "Changes close 24 hours before your appointment.",
    });

    expect(
      screen.getByText("Changes close 24 hours before your appointment."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/up until the day before/i)).toBeNull();
  });

  it("shows no cancellation promise when the policy is unknown", () => {
    renderStep5({ changeDeadlineNote: null });

    expect(screen.queryByText(/cancel/i)).toBeNull();
    expect(screen.queryByText(/day before/i)).toBeNull();
  });
});

describe("BookingConfirmation — a booking made inside the change window", () => {
  // 2 September 2026: a customer confirmed at 10:32 for 08:30 the next morning
  // — 22h58m ahead, already past the 24-hour deadline as she pressed the
  // button. She discovered it 2h47m later, when a change was refused. The
  // screen had shown her "Changes close 24 hours before your appointment",
  // which is true, and told her nothing about the booking in front of her.
  const GENERIC = "Changes close 24 hours before your appointment.";

  it("warns that this booking cannot be changed online", () => {
    renderStep5({ changeDeadlineNote: GENERIC, changeAlreadyClosed: true });

    expect(screen.getByText(/too close to the day to change or cancel online/i))
      .toBeInTheDocument();
  });

  it("replaces the generic sentence rather than sitting beside it", () => {
    // Both at once reads as a promise plus a contradiction. The specific fact
    // about this booking is the one that helps.
    renderStep5({ changeDeadlineNote: GENERIC, changeAlreadyClosed: true });

    expect(screen.queryByText(GENERIC)).toBeNull();
  });

  it("still points the customer somewhere useful", () => {
    // Honesty over appeasement, but never a dead end: the salon can always
    // move it by hand, so say so instead of leaving them stuck.
    renderStep5({ changeDeadlineNote: GENERIC, changeAlreadyClosed: true });

    expect(screen.getByText(/message us if anything changes/i)).toBeInTheDocument();
  });

  it("leaves an ordinary booking with the ordinary sentence", () => {
    renderStep5({ changeDeadlineNote: GENERIC, changeAlreadyClosed: false });

    expect(screen.getByText(GENERIC)).toBeInTheDocument();
    expect(screen.queryByText(/too close to the day/i)).toBeNull();
  });

  it("warns even when the generic sentence could not be read", () => {
    // The two come from different reads. Losing the policy sentence must not
    // suppress a warning the server has positively confirmed.
    renderStep5({ changeDeadlineNote: null, changeAlreadyClosed: true });

    expect(screen.getByText(/too close to the day to change or cancel online/i))
      .toBeInTheDocument();
  });
});
