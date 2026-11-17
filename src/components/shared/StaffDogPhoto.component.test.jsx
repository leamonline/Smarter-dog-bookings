import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ url: null, onLoadError: vi.fn() }));
vi.mock("../../supabase/hooks/useStaffDogPhoto", () => ({
  useStaffDogPhotoUrl: () => ({ url: mocks.url, onLoadError: mocks.onLoadError }),
}));

import { StaffDogPhoto } from "./StaffDogPhoto.jsx";

beforeEach(() => {
  mocks.url = null;
  mocks.onLoadError.mockReset();
});

describe("StaffDogPhoto", () => {
  it("renders nothing for a dog without a photo, so the layout is unchanged", () => {
    const { container } = render(<StaffDogPhoto path={null} dogName="Bella" />);
    expect(container.innerHTML).toBe("");
  });

  it("holds the space with the dog's initial until the link is ready", () => {
    render(<StaffDogPhoto path="d/a.jpg" dogName="Bella" />);
    expect(document.querySelector("[data-staff-dog-photo]").textContent).toBe("B");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows the photo, named for screen readers, and reports a failed load", () => {
    mocks.url = "https://signed.example/bella";
    render(<StaffDogPhoto path="d/a.jpg" dogName="Bella" />);
    const img = screen.getByRole("img", { name: "Photo of Bella" });
    expect(img.getAttribute("src")).toBe("https://signed.example/bella");
    fireEvent.error(img);
    expect(mocks.onLoadError).toHaveBeenCalledTimes(1);
  });
});
