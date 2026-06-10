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

// Regression guard for UX-AUDIT-REPORT Top 5 #1: typing in the New Booking
// search used to hang on a permanent "Searching..." state because results
// came only from the (slow) server search. The fix (9943b69) filters the
// in-memory dog map locally and only shows "Searching..." while the server
// search is in flight AND no local match exists. These tests pin each leg
// of that behaviour so the hang can't quietly return.
const jayne = {
  id: "jayne-id",
  fullName: "Jayne Lingard",
  name: "Jayne",
  surname: "Lingard",
  phone: "07700111222",
};

function renderTypedSearch(overrides = {}) {
  return renderSection({
    dogEntries: [], // nothing picked yet → search mode renders
    addingAnotherDog: false,
    dogs: { [belle.id]: belle, [eti.id]: eti },
    humans: { [jayne.fullName]: jayne },
    ...overrides,
  });
}

describe("DogSearchSection — typed search (UX #1)", () => {
  it("notifies the parent so the debounced server search runs", () => {
    const props = renderTypedSearch();
    fireEvent.change(
      screen.getByPlaceholderText(/start typing a dog's name/i),
      { target: { value: "luna" } },
    );
    expect(props.setDogQuery).toHaveBeenCalledWith("luna");
    expect(props.onSearchDogs).toHaveBeenCalledWith("luna");
  });

  it("filters the local dog map as the user types", () => {
    renderTypedSearch({ dogQuery: "bel" });
    expect(screen.getByText("Belle")).toBeInTheDocument();
    expect(screen.queryByText("Eti")).not.toBeInTheDocument();
    // Owner row is offered alongside the matching dog.
    expect(screen.getByText("Jayne Lingard")).toBeInTheDocument();
  });

  it("does not show 'Searching...' when local matches exist, even mid server search", () => {
    renderTypedSearch({ dogQuery: "bel", isSearchingDogs: true });
    expect(screen.getByText("Belle")).toBeInTheDocument();
    expect(screen.queryByText("Searching...")).not.toBeInTheDocument();
  });

  it("shows 'Searching...' only while the server search is in flight with no local match", () => {
    renderTypedSearch({ dogQuery: "zzz", isSearchingDogs: true });
    expect(screen.getByText("Searching...")).toBeInTheDocument();
  });

  it("resolves to the no-results state with create CTAs instead of hanging", () => {
    // The original bug: this state stayed at "Searching..." forever.
    renderTypedSearch({ dogQuery: "zzz", isSearchingDogs: false });
    expect(screen.queryByText("Searching...")).not.toBeInTheDocument();
    expect(screen.getByText(/no dogs found matching "zzz"/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ New Dog" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ New Human" })).toBeInTheDocument();
  });
});
