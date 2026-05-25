import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DogSearchSection } from "./DogSearchSection.jsx";

// Jayne Lingard owns two dogs. Belle is already on the booking; Eti is the
// sibling that the "add another dog" picker must surface. The regression:
// the picker used to filter the in-memory `dogs` map, which — after a
// dog-name search or pagination — often won't contain the sibling. Here we
// reproduce that state (Eti is absent from `dogs`) but present it via
// `dogsByHumanId`, the pagination-proof source the fix reads from.
const belle = {
  id: "dog-belle",
  name: "Belle",
  breed: "Cavapoo",
  size: "medium",
  humanId: "Jayne Lingard",
  _humanId: "jayne-id",
  alerts: [],
};
const eti = {
  id: "dog-eti",
  name: "Eti",
  breed: "Cavapoo",
  size: "medium",
  humanId: "Jayne Lingard",
  _humanId: "jayne-id",
  alerts: [],
};

function renderSection(overrides = {}) {
  const props = {
    dogs: { [belle.id]: belle }, // sibling Eti intentionally absent
    humans: {},
    dogsByHumanId: { "jayne-id": [belle, eti] },
    ensureDogsForHumans: vi.fn(),
    dogEntries: [{ dog: belle, humanKey: "Jayne Lingard", service: "full-groom", addons: [] }],
    dogQuery: "",
    setDogQuery: vi.fn(),
    selectedHumanKey: "Jayne Lingard",
    selectedHumanId: "jayne-id",
    addingAnotherDog: true,
    setAddingAnotherDog: vi.fn(),
    primaryTheme: { gradient: ["#0AA", "#077"], light: "#EAF", headerText: "#fff", headerTextSub: "#eee" },
    onSelectEntry: vi.fn(),
    onAddAnotherDog: vi.fn(),
    onRemoveDog: vi.fn(),
    onServiceChange: vi.fn(),
    onAddonsChange: vi.fn(),
    onClearAll: vi.fn(),
    onClose: vi.fn(),
    onOpenAddDog: vi.fn(),
    onOpenAddHuman: vi.fn(),
    onSearchDogs: vi.fn(),
    isSearchingDogs: false,
    setError: vi.fn(),
    ...overrides,
  };
  render(<DogSearchSection {...props} />);
  return props;
}

describe("DogSearchSection — add another dog picker", () => {
  it("requests the owner's dogs and lists the sibling missing from the paginated map", () => {
    const props = renderSection();

    expect(props.ensureDogsForHumans).toHaveBeenCalledWith(["jayne-id"]);
    expect(screen.getByText("Eti")).toBeInTheDocument();
    expect(screen.queryByText("No other dogs for this owner.")).not.toBeInTheDocument();
  });

  it("does not offer a dog already on the booking", () => {
    renderSection();
    // Belle appears once (the dog card above) and is excluded from the picker.
    expect(screen.getAllByText("Belle")).toHaveLength(1);
  });

  it("adds the sibling when its row is clicked", () => {
    const props = renderSection();
    fireEvent.mouseDown(screen.getByText("Eti"));
    expect(props.onAddAnotherDog).toHaveBeenCalledWith(
      expect.objectContaining({ id: "dog-eti", name: "Eti" }),
    );
  });

  it("falls back to the in-memory map when dogsByHumanId hasn't loaded yet", () => {
    // No dogsByHumanId entry, but the sibling happens to be in `dogs`.
    renderSection({
      dogs: { [belle.id]: belle, [eti.id]: eti },
      dogsByHumanId: {},
    });
    expect(screen.getByText("Eti")).toBeInTheDocument();
    expect(screen.queryByText("No other dogs for this owner.")).not.toBeInTheDocument();
  });
});
