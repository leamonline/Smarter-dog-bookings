// Staff adding a dog's profile photo on the owner's behalf (20261121120000).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../contexts/ToastContext.jsx";

vi.mock("../../hooks/useGroomPhotos", () => ({
  useGroomPhotos: () => ({
    fetchPhotosForDog: vi.fn(() => Promise.resolve([])),
    uploadPhoto: vi.fn(),
    deletePhoto: vi.fn(),
    updatePhotoNotes: vi.fn(),
  }),
}));

const upload = vi.hoisted(() => ({ uploadDogPhoto: vi.fn(), discardDogPhoto: vi.fn(), currentDogPhotoPath: vi.fn() }));
vi.mock("../../supabase/hooks/useStaffDogPhotoUpload", () => ({
  useStaffDogPhotoUpload: () => upload,
}));

const { DogCardModal } = await import("./DogCardModal.jsx");

const dog = { id: "dog-1", name: "Bella", breed: "Cockapoo", age: "3 yrs", size: "small", humanId: "h1", _humanId: "h1", alerts: [] };

function renderModal({ dogOverrides = {}, onUpdateDog = vi.fn(() => Promise.resolve({ id: "dog-1" })) } = {}) {
  render(
    <ToastProvider>
      <DogCardModal
        dogId="dog-1"
        onClose={vi.fn()}
        onOpenHuman={vi.fn()}
        dogs={{ Bella: { ...dog, ...dogOverrides } }}
        humans={{}}
        onUpdateDog={onUpdateDog}
        onUpdateHuman={vi.fn()}
        onAddHuman={vi.fn()}
        onDeleteDog={vi.fn()}
        bookingsByDate={{}}
        fetchBookingHistoryForDog={vi.fn(() => Promise.resolve([]))}
        fetchDogById={vi.fn(() => Promise.resolve(null))}
        handleAdd={vi.fn()}
        findHumanByFullName={vi.fn(() => null)}
        searchHumansByTerm={vi.fn(() => Promise.resolve([]))}
      />
    </ToastProvider>,
  );
  return { onUpdateDog };
}

const pick = () => {
  const file = new File(["x"], "bella.jpg", { type: "image/jpeg" });
  fireEvent.change(document.querySelector("[data-dog-photo-input]"), { target: { files: [file] } });
  return file;
};

describe("staff adding a dog photo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upload.uploadDogPhoto.mockResolvedValue({ photoPath: "dog-1/new.jpg", error: null });
    upload.currentDogPhotoPath.mockResolvedValue({ photoPath: "dog-1/old.jpg", error: null });
  });

  it("offers Add a photo for a dog without one, and Change for a dog with one", () => {
    renderModal();
    expect(screen.getByRole("button", { name: "Add a photo of Bella" })).toBeInTheDocument();
  });

  it("offers Change when the dog already has a photo", () => {
    renderModal({ dogOverrides: { photoPath: "dog-1/old.jpg" } });
    expect(screen.getByRole("button", { name: "Change Bella's photo" })).toBeInTheDocument();
  });

  it("uploads, points the dog at the new photo and deletes the one it replaced", async () => {
    const { onUpdateDog } = renderModal({ dogOverrides: { photoPath: "dog-1/old.jpg" } });
    const file = pick();
    await waitFor(() => expect(onUpdateDog).toHaveBeenCalledWith("dog-1", { photoPath: "dog-1/new.jpg" }));
    expect(upload.uploadDogPhoto).toHaveBeenCalledWith("dog-1", file);
    await waitFor(() => expect(upload.discardDogPhoto).toHaveBeenCalledWith("dog-1/old.jpg", "replaced by staff"));
    expect(await screen.findByText("Bella's photo saved")).toBeInTheDocument();
  });

  it("deletes the new upload, keeps the old photo and says so when the save is confirmed not to have landed", async () => {
    const { onUpdateDog } = renderModal({
      dogOverrides: { photoPath: "dog-1/old.jpg" },
      onUpdateDog: vi.fn(() => Promise.resolve(null)),
    });
    pick();
    await waitFor(() => expect(onUpdateDog).toHaveBeenCalled());
    await waitFor(() => expect(upload.discardDogPhoto).toHaveBeenCalledWith("dog-1/new.jpg", "unsaved staff upload"));
    expect(upload.discardDogPhoto).not.toHaveBeenCalledWith("dog-1/old.jpg", expect.anything());
    expect(await screen.findByText("Couldn't save the photo. Please try again.")).toBeInTheDocument();
  });

  it("keeps the upload, and the old photo, when a lost reply means the save may have committed", async () => {
    upload.currentDogPhotoPath.mockResolvedValue({ photoPath: null, error: new Error("offline") });
    const { onUpdateDog } = renderModal({
      dogOverrides: { photoPath: "dog-1/old.jpg" },
      onUpdateDog: vi.fn(() => Promise.resolve(null)),
    });
    pick();
    expect(await screen.findByText("Couldn't save the photo. Please try again.")).toBeInTheDocument();
    expect(onUpdateDog).toHaveBeenCalled();
    expect(upload.discardDogPhoto).not.toHaveBeenCalled();
  });

  it("treats a save the database did commit as saved, and deletes nothing", async () => {
    upload.currentDogPhotoPath.mockResolvedValue({ photoPath: "dog-1/new.jpg", error: null });
    renderModal({
      dogOverrides: { photoPath: "dog-1/old.jpg" },
      onUpdateDog: vi.fn(() => Promise.resolve(null)),
    });
    pick();
    expect(await screen.findByText("Bella's photo saved")).toBeInTheDocument();
    expect(upload.discardDogPhoto).not.toHaveBeenCalled();
  });

  it("changes nothing when the photo can't be prepared or uploaded", async () => {
    upload.uploadDogPhoto.mockResolvedValue({ photoPath: null, error: new Error("nope") });
    const { onUpdateDog } = renderModal();
    pick();
    expect(await screen.findByText("We couldn't save the photo. Please try again.")).toBeInTheDocument();
    expect(onUpdateDog).not.toHaveBeenCalled();
    expect(upload.discardDogPhoto).not.toHaveBeenCalled();
  });
});
