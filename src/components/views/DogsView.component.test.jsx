// Component tests for the server-driven Dogs Directory: it renders the
// directoryDogs list in server order (no client re-sort), the A–Z rail disables
// empty letters and reports jumps, the sort/filter/view toggles report changes,
// cards stay keyboard-openable and show the owner's contact links, and the
// archived view loads + unarchives.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../../contexts/ToastContext.jsx", () => ({
  useToast: () => ({ show: vi.fn() }),
}));

const { DogsView } = await import("./DogsView.jsx");

// Server directory entries carry the joined owner_* fields (ownerFullName/
// ownerPhone), so they resolve without a humans map.
const rex = { id: "d1", name: "Rex", breed: "Boxer", size: "large", age: "3", alerts: [], ownerFullName: "Sarah Jones", ownerPhone: "07700900111" };
const bella = { id: "d2", name: "Bella", breed: "Poodle", size: "small", age: "", alerts: ["Nervous of clippers"], ownerFullName: "Dave Smith", ownerPhone: "07700900112" };

function renderView(overrides = {}) {
  const props = {
    dogs: {},
    humans: {},
    onOpenDog: vi.fn(),
    onAddDog: vi.fn(),
    onAddHuman: vi.fn(),
    hasMore: false,
    totalCount: 2,
    loadMore: vi.fn(() => Promise.resolve()),
    onSearch: vi.fn(),
    searchQuery: "",
    isSearching: false,
    isInitialLoading: false,
    isOnline: true,
    directoryDogs: [rex, bella], // deliberately not alphabetical
    availableLetters: ["B", "R"],
    sortMode: "name",
    onSortModeChange: vi.fn(),
    filters: { size: null, alert: false, incomplete: false },
    onToggleFilter: vi.fn(),
    activeLetter: null,
    onLetterChange: vi.fn(),
    fetchArchivedDogs: vi.fn(() => Promise.resolve([])),
    onUpdateDog: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
  render(<DogsView {...props} />);
  return props;
}

describe("DogsView directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try {
      localStorage.removeItem("dogsViewMode");
      localStorage.removeItem("dogsDirSort");
    } catch {
      /* ignore */
    }
  });

  it("renders the directory list in the server-provided order", () => {
    renderView();
    const cards = screen.getAllByRole("button", { name: /^Open .+ profile$/ });
    expect(cards[0]).toHaveAccessibleName("Open Rex's profile");
    expect(cards[1]).toHaveAccessibleName("Open Bella's profile");
  });

  it("disables A–Z letters that have no matches", () => {
    renderView();
    expect(screen.getAllByRole("button", { name: "Jump to the letter A" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Jump to the letter R" })[0]).not.toBeDisabled();
  });

  it("clicking an available letter reports the jump", () => {
    const { onLetterChange } = renderView();
    fireEvent.click(screen.getAllByRole("button", { name: "Jump to the letter B" })[0]);
    expect(onLetterChange).toHaveBeenCalledWith("B");
  });

  it("labels the count as 'matching' (not 'registered') when only a letter filter is active", () => {
    renderView({ activeLetter: "B", totalCount: 2 });
    expect(screen.getByText("2 matching dogs")).toBeInTheDocument();
    expect(screen.queryByText("2 dogs registered")).not.toBeInTheDocument();
  });

  it("the sort toggle marks the active mode and switches on click", () => {
    const { onSortModeChange } = renderView();
    expect(screen.getByRole("button", { name: "Name" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Recently added" }));
    expect(onSortModeChange).toHaveBeenCalledWith("recent");
  });

  it("Load more is the fallback and calls loadMore", () => {
    const { loadMore } = renderView({ hasMore: true });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(loadMore).toHaveBeenCalled();
  });

  it("opens a profile on card click and on keyboard Enter", () => {
    const { onOpenDog } = renderView();
    fireEvent.click(screen.getByRole("button", { name: "Open Rex's profile" }));
    expect(onOpenDog).toHaveBeenCalledWith("d1");
    fireEvent.keyDown(screen.getByRole("button", { name: "Open Bella's profile" }), { key: "Enter" });
    expect(onOpenDog).toHaveBeenCalledWith("d2");
  });

  it("footer shows loaded-of-total", () => {
    renderView({ totalCount: 5 });
    expect(screen.getByText("Showing 2 of 5 dogs")).toBeInTheDocument();
  });

  it("shows the owner's phone and WhatsApp links on a card", () => {
    renderView({ directoryDogs: [rex] });
    expect(screen.getByRole("link", { name: "07700900111" })).toHaveAttribute("href", "tel:+447700900111");
    expect(screen.getByRole("link", { name: "Open in WhatsApp" })).toHaveAttribute(
      "href",
      "https://wa.me/447700900111",
    );
  });

  it("renders the alert reason as visible text, not just an emoji", () => {
    renderView({ directoryDogs: [bella] });
    expect(screen.getByText("Nervous of clippers")).toBeInTheDocument();
  });

  it("flags a dog missing size or breed as Incomplete (and a complete dog isn't)", () => {
    renderView({
      directoryDogs: [{ id: "d3", name: "Patch", breed: "", size: null, alerts: [], ownerFullName: "Sam Lee", ownerPhone: "" }],
    });
    expect(screen.getByText("Incomplete")).toBeInTheDocument();
  });

  it("a complete dog shows no Incomplete badge", () => {
    renderView({ directoryDogs: [rex] });
    expect(screen.queryByText("Incomplete")).not.toBeInTheDocument();
  });

  it("the grid/list view toggle switches mode and persists it", () => {
    renderView();
    expect(screen.getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("dogsViewMode")).toBe("list");
    expect(screen.getByRole("button", { name: "Open Rex's profile" })).toBeInTheDocument();
  });

  it("the size filter chip toggles the server-side filter and reflects active state", () => {
    const { onToggleFilter } = renderView({ filters: { size: "small", alert: false, incomplete: false } });
    expect(screen.getByRole("button", { name: "Small" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Large" }));
    expect(onToggleFilter).toHaveBeenCalledWith("size", "large");
  });

  it("the alert and incomplete chips toggle their server-side filters", () => {
    const { onToggleFilter } = renderView();
    fireEvent.click(screen.getByRole("button", { name: "Has alert" }));
    expect(onToggleFilter).toHaveBeenCalledWith("alert");
    fireEvent.click(screen.getByRole("button", { name: "Incomplete profile" }));
    expect(onToggleFilter).toHaveBeenCalledWith("incomplete");
  });

  it("an active filter is listed in the footer", () => {
    renderView({ filters: { size: "large", alert: true, incomplete: false }, totalCount: 4 });
    expect(screen.getByText(/Showing 2 of 4 dogs · Large, Has alert/)).toBeInTheDocument();
  });

  it("Show archived loads the archived set and unarchive calls onUpdateDog", async () => {
    const archivedDog = { id: "d9", name: "Max", breed: "Lab", size: "large", alerts: [], ownerFullName: "Old Owner", ownerPhone: "" };
    const fetchArchivedDogs = vi.fn(() => Promise.resolve([archivedDog]));
    const { onUpdateDog } = renderView({ fetchArchivedDogs });

    fireEvent.click(screen.getByRole("button", { name: "Show archived" }));
    expect(fetchArchivedDogs).toHaveBeenCalled();

    // The archived card arrives once the fetch resolves.
    await screen.findByRole("button", { name: "Open Max's profile" });

    fireEvent.click(screen.getByRole("button", { name: "Unarchive" }));
    expect(onUpdateDog).toHaveBeenCalledWith("d9", { archivedAt: null });
  });
});
