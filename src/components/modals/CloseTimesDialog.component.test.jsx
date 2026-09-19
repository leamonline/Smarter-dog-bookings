import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CloseTimesDialog } from "./CloseTimesDialog.jsx";

const SLOTS = [
  "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00",
];

function setup(props = {}) {
  const onSave = vi.fn(async () => ({ ok: true }));
  const onClose = vi.fn();
  render(
    <CloseTimesDialog
      activeSlots={SLOTS}
      closures={[]}
      bookings={[]}
      initialFrom="09:00"
      dayLabel="Monday 21 September"
      onSave={onSave}
      onClose={onClose}
      {...props}
    />,
  );
  return { onSave, onClose };
}

const saveButton = () => screen.getByRole("button", { name: /close these times/i });

describe("CloseTimesDialog", () => {
  it("prefills the start time it was opened with", () => {
    setup();
    expect(screen.getByLabelText("From")).toHaveValue("09:00");
  });

  it("falls back to the first slot when the start is not on this day's grid", () => {
    setup({ initialFrom: "07:00" });
    expect(screen.getByLabelText("From")).toHaveValue("08:30");
  });

  it("previews the exact card text as the reason is typed", async () => {
    setup();
    await userEvent.type(screen.getByLabelText("Reason"), "doctor's appointment");
    expect(screen.getByText("Closed for doctor's appointment")).toBeInTheDocument();
  });

  it("fills the reason from a quick chip", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "late start" }));
    expect(screen.getByLabelText("Reason")).toHaveValue("late start");
  });

  it("counts the slots the chosen range covers", async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText("To"), "10:30");
    expect(screen.getByText("3 slots will be closed.")).toBeInTheDocument();
  });

  it("says '1 slot' for a single covered slot", () => {
    setup();
    expect(screen.getByText("1 slot will be closed.")).toBeInTheDocument();
  });

  it("keeps save disabled until a reason is given", async () => {
    setup();
    expect(saveButton()).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Reason"), "late start");
    expect(saveButton()).toBeEnabled();
  });

  it("saves the chosen range and the reason exactly as typed", async () => {
    const { onSave } = setup();
    await userEvent.selectOptions(screen.getByLabelText("To"), "10:30");
    await userEvent.type(screen.getByLabelText("Reason"), "doctor's appointment");
    await userEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledWith({
      from: "09:00",
      to: "10:30",
      reason: "doctor's appointment",
    });
  });

  it("closes once the save succeeds", async () => {
    const { onClose } = setup();
    await userEvent.type(screen.getByLabelText("Reason"), "late start");
    await userEvent.click(saveButton());
    expect(onClose).toHaveBeenCalled();
  });

  it("warns about bookings sitting in the range without blocking the save", async () => {
    const { onSave } = setup({
      bookings: [
        { id: "b1", slot: "09:30", dogName: "Bella" },
        { id: "b2", slot: "10:00", dogName: "Milo" },
      ],
    });
    await userEvent.selectOptions(screen.getByLabelText("To"), "10:30");
    await userEvent.type(screen.getByLabelText("Reason"), "late start");
    expect(screen.getByText(/2 bookings sit in these times/i)).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
    await userEvent.click(saveButton());
    expect(onSave).toHaveBeenCalled();
  });

  it("does not warn about a booking outside the range", async () => {
    setup({ bookings: [{ id: "b1", slot: "12:00", dogName: "Bella" }] });
    await userEvent.type(screen.getByLabelText("Reason"), "late start");
    expect(screen.queryByText(/sits? in these times/i)).toBeNull();
  });

  it("refuses an overlap with a closure already on the day", async () => {
    setup({
      closures: [{ id: "c1", from: "09:00", to: "10:00", reason: "late start" }],
    });
    expect(screen.getByText(/overlap/i)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("surfaces a failed save and stays open", async () => {
    const onSave = vi.fn(async () => ({ ok: false, error: "Couldn't save change." }));
    const onClose = vi.fn();
    render(
      <CloseTimesDialog
        activeSlots={SLOTS}
        closures={[]}
        bookings={[]}
        initialFrom="09:00"
        dayLabel="Monday 21 September"
        onSave={onSave}
        onClose={onClose}
      />,
    );
    await userEvent.type(screen.getByLabelText("Reason"), "late start");
    await userEvent.click(screen.getByRole("button", { name: /close these times/i }));
    expect(await screen.findByText("Couldn't save change.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the end time legal when the start moves past it", async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText("To"), "10:00");
    await userEvent.selectOptions(screen.getByLabelText("From"), "12:30");
    expect(screen.getByLabelText("To")).toHaveValue("13:00");
  });

  it("takes a custom submit label for the edit-reason flow", () => {
    setup({ submitLabel: "Save reason" });
    expect(screen.getByRole("button", { name: "Save reason" })).toBeInTheDocument();
  });
});

describe("CloseTimesDialog — locked times (edit reason)", () => {
  function editSetup(props = {}) {
    const onSave = vi.fn(async () => ({ ok: true }));
    const onClose = vi.fn();
    render(
      <CloseTimesDialog
        activeSlots={SLOTS}
        closures={[]}
        bookings={[]}
        initialFrom="09:00"
        initialTo="10:30"
        initialReason="late start"
        timesLocked
        submitLabel="Save reason"
        dayLabel="Monday 21 September"
        onSave={onSave}
        onClose={onClose}
        {...props}
      />,
    );
    return { onSave, onClose };
  }

  it("shows the real saved range and hides the time pickers", () => {
    editSetup();
    // Shown twice on purpose: once in the explainer, once in the card preview.
    expect(screen.getAllByText("9:00 – 10:30").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("From")).toBeNull();
    expect(screen.queryByLabelText("To")).toBeNull();
  });

  it("starts from the existing reason", () => {
    editSetup();
    expect(screen.getByLabelText("Reason")).toHaveValue("late start");
  });

  it("saves a changed reason", async () => {
    const { onSave } = editSetup();
    await userEvent.clear(screen.getByLabelText("Reason"));
    await userEvent.type(screen.getByLabelText("Reason"), "vet appointment");
    await userEvent.click(screen.getByRole("button", { name: "Save reason" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "vet appointment" }),
    );
  });

  it("still saves when the saved range no longer fits the day's grid", async () => {
    // Staff closed 13:00–14:00 using an extra 13:30 slot, then removed that
    // slot. The range is no longer re-creatable, but it is also not theirs to
    // change here — so the reason must stay editable rather than being stuck
    // behind a "past the end of the day" error on a locked field.
    const { onSave } = editSetup({ initialFrom: "13:00", initialTo: "14:00" });
    expect(screen.queryByText(/past the end of the day/i)).toBeNull();
    await userEvent.clear(screen.getByLabelText("Reason"));
    await userEvent.type(screen.getByLabelText("Reason"), "early finish");
    const save = screen.getByRole("button", { name: "Save reason" });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(onSave).toHaveBeenCalled();
  });

  it("still refuses an empty reason", async () => {
    editSetup();
    await userEvent.clear(screen.getByLabelText("Reason"));
    expect(screen.getByRole("button", { name: "Save reason" })).toBeDisabled();
  });
});
