import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConfirmReportedSize } from "./ConfirmReportedSize.jsx";

const waiting = { id: "dog-1", name: "Bramble", size: null, reportedSize: "medium" };

describe("ConfirmReportedSize", () => {
  it("confirms the owner's estimate through the ordinary staff dog update", async () => {
    const onUpdateDog = vi.fn().mockResolvedValue({ id: "dog-1", size: "medium" });
    const onConfirmed = vi.fn();
    render(<ConfirmReportedSize dog={waiting} onUpdateDog={onUpdateDog} onConfirmed={onConfirmed} />);

    expect(screen.getByText(/owner thinks/i)).toHaveTextContent("The owner thinks medium");
    fireEvent.click(screen.getByRole("button", { name: "Confirm Medium" }));

    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith("medium"));
    // Guarded: only lands if the dog is still unsized with the estimate shown.
    expect(onUpdateDog).toHaveBeenCalledWith("dog-1", { size: "medium" }, { onlyIfUnsizedWithReported: "medium" });
  });

  it("reports a failed save instead of claiming success", async () => {
    const onUpdateDog = vi.fn().mockResolvedValue(null);
    const onConfirmed = vi.fn();
    const onFailed = vi.fn();
    render(
      <ConfirmReportedSize dog={waiting} onUpdateDog={onUpdateDog} onConfirmed={onConfirmed} onFailed={onFailed} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Confirm Medium" }));

    await waitFor(() => expect(onFailed).toHaveBeenCalled());
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it.each([
    ["the dog already has a size", { ...waiting, size: "small" }, vi.fn()],
    ["the owner gave no estimate", { ...waiting, reportedSize: null }, vi.fn()],
    ["the estimate is not a real size", { ...waiting, reportedSize: "huge" }, vi.fn()],
    ["the viewer cannot edit dogs", waiting, undefined],
  ])("shows nothing when %s", (_label, dog, onUpdateDog) => {
    const { container } = render(<ConfirmReportedSize dog={dog} onUpdateDog={onUpdateDog} />);
    expect(container).toBeEmptyDOMElement();
  });
});
