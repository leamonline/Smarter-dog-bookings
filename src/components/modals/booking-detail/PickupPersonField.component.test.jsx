import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PickupPersonField } from "./PickupPersonField.jsx";

const humans = {
  owner: { id: "owner", fullName: "Tom Clark", trustedIds: ["friend"] },
  friend: { id: "friend", fullName: "Sam Jones" },
};

describe("PickupPersonField", () => {
  it("shows the saved pick-up person in view mode", () => {
    render(<PickupPersonField booking={{ owner: "Tom Clark", pickupBy: "Sam Jones" }} editData={{ pickupBy: "friend" }} humans={humans} primaryHuman={humans.owner} isEditing={false} setEditData={vi.fn()} />);
    expect(screen.getByText("Pick-up person")).toBeInTheDocument();
    expect(screen.getByText("Sam Jones")).toBeInTheDocument();
  });

  it("offers the owner, trusted contacts and the current saved person in edit mode", async () => {
    let editData = { pickupBy: "friend" };
    const setEditData = vi.fn((update) => { editData = update(editData); });
    render(<PickupPersonField booking={{ owner: "Tom Clark", pickupBy: "Sam Jones" }} editData={editData} humans={humans} primaryHuman={humans.owner} isEditing setEditData={setEditData} />);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Pick-up person" }), "owner");
    expect(editData.pickupBy).toBe("owner");
  });
});
