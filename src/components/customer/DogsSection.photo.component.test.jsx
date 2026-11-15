import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  uploadDogPhoto: vi.fn(),
  removeDogPhoto: vi.fn(),
}));

vi.mock("../../supabase/hooks/useCustomerDogPhoto", () => ({
  useCustomerDogPhoto: () => ({ uploadDogPhoto: mocks.uploadDogPhoto, removeDogPhoto: mocks.removeDogPhoto }),
  useDogPhotoUrl: (path) => (path ? `https://signed.example/${path}` : null),
}));

vi.mock("../../supabase/hooks/useCustomerDogActions", () => ({
  useCustomerDogActions: () => ({ updateDog: vi.fn() }),
}));

import { DogsSection } from "./DogsSection.jsx";
import { ToastProvider } from "../../contexts/ToastContext.jsx";

const DOG = { id: "dog-1", name: "Tipi", breed: "Lagotto Romagnolo", size: "medium", photoPath: null };

function renderDogs(dog = DOG) {
  const onDogUpdated = vi.fn();
  render(
    <ToastProvider>
      <DogsSection dogs={[dog]} humanId="human-1" onDogUpdated={onDogUpdated} />
    </ToastProvider>,
  );
  return { onDogUpdated };
}

function choosePhoto(file = new File(["x"], "tipi.jpg", { type: "image/jpeg" })) {
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  mocks.uploadDogPhoto.mockReset();
  mocks.removeDogPhoto.mockReset();
});

describe("DogsSection photos", () => {
  it("invites a photo on a dog without one, and saves it from the picker", async () => {
    mocks.uploadDogPhoto.mockResolvedValue({ photoPath: "dog-1/new.jpg", error: null });
    const { onDogUpdated } = renderDogs();
    expect(screen.getByRole("button", { name: "Add a photo of Tipi" })).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toHaveAttribute("accept", "image/*");

    choosePhoto();
    // Only the changed field: a stale copy of the dog must never be merged back.
    await waitFor(() => expect(onDogUpdated).toHaveBeenCalledWith({ id: "dog-1", photoPath: "dog-1/new.jpg" }));
    expect(mocks.uploadDogPhoto).toHaveBeenCalledWith("dog-1", expect.any(File));
  });

  it("explains a failed upload and leaves the dog unchanged", async () => {
    const { DogPhotoError } = await import("../../lib/dogPhoto");
    mocks.uploadDogPhoto.mockResolvedValue({ photoPath: null, error: new DogPhotoError("unreadable") });
    const { onDogUpdated } = renderDogs();
    choosePhoto();
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't read that photo.");
    expect(onDogUpdated).not.toHaveBeenCalled();
  });

  it("shows the photo and offers to change it", () => {
    renderDogs({ ...DOG, photoPath: "dog-1/current.jpg" });
    const button = screen.getByRole("button", { name: "Change Tipi's photo" });
    expect(button.querySelector("img")).toHaveAttribute("src", "https://signed.example/dog-1/current.jpg");
  });

  it("falls back to the dog's initial when the photo will not load", () => {
    renderDogs({ ...DOG, photoPath: "dog-1/current.jpg" });
    const button = screen.getByRole("button", { name: "Change Tipi's photo" });
    fireEvent.error(button.querySelector("img"));
    expect(button.querySelector("img")).toBeNull();
    expect(button).toHaveTextContent("T");
  });

  it("removes a photo from the dog's Edit form", async () => {
    mocks.removeDogPhoto.mockResolvedValue({ photoPath: null, error: null });
    const { onDogUpdated } = renderDogs({ ...DOG, photoPath: "dog-1/current.jpg" });
    fireEvent.click(screen.getByRole("button", { name: "Edit Tipi" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    await waitFor(() => expect(onDogUpdated).toHaveBeenCalledWith({ id: "dog-1", photoPath: null }));
    expect(mocks.removeDogPhoto).toHaveBeenCalledWith("dog-1");
  });

  it("offers no Remove photo when there is no photo", () => {
    renderDogs();
    fireEvent.click(screen.getByRole("button", { name: "Edit Tipi" }));
    expect(screen.queryByRole("button", { name: "Remove photo" })).not.toBeInTheDocument();
  });
});
