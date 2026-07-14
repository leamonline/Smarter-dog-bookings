// Component tests for the server-driven Humans Directory: it renders the
// directoryHumans list in server order (no client re-sort), the A–Z rail
// disables empty letters and reports jumps, the sort toggle and Load-more
// fall back cleanly, and cards stay keyboard-openable.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { HumansView } = await import("./HumansView.jsx");

const sarah = { id: "h1", name: "Sarah", surname: "Jones", fullName: "Sarah Jones", phone: "07700900111", whatsapp: true, historyFlag: "" };
const dave = { id: "h2", name: "Dave", surname: "Smith", fullName: "Dave Smith", phone: "07700900112", whatsapp: false, historyFlag: "" };

function renderView(overrides = {}) {
  const props = {
    humans: {},
    dogs: {},
    dogsByHumanId: {},
    ensureDogsForHumans: vi.fn(),
    onOpenHuman: vi.fn(),
    onNewClient: vi.fn(),
    onUpdateHuman: vi.fn(),
    fetchArchivedHumans: vi.fn(() => Promise.resolve([])),
    findHumanByFullName: vi.fn(),
    hasMore: false,
    totalCount: 2,
    loadMore: vi.fn(() => Promise.resolve()),
    onSearch: vi.fn(),
    searchQuery: "",
    isSearching: false,
    isInitialLoading: false,
    isOnline: true,
    directoryHumans: [dave, sarah], // deliberately not alphabetical
    availableLetters: ["D", "J", "S"],
    sortMode: "first",
    onSortModeChange: vi.fn(),
    activeLetter: null,
    onLetterChange: vi.fn(),
    filters: { flagged: false, noDogs: false, noPhone: false, whatsapp: false },
    onToggleFilter: vi.fn(),
    ...overrides,
  };
  render(<HumansView {...props} />);
  return props;
}

describe("HumansView directory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    try {
      localStorage.removeItem("humansViewMode");
    } catch {
      /* ignore */
    }
  });

  it("labels the count as 'matching' (not 'registered') when only a letter filter is active", () => {
    renderView({ activeLetter: "D", totalCount: 2 });
    expect(screen.getByText("2 matching humans")).toBeInTheDocument();
    expect(screen.queryByText("2 humans registered")).not.toBeInTheDocument();
  });

  it("offers one Add client action and opens the guided flow", () => {
    const { onNewClient } = renderView();
    const action = screen.getByRole("button", { name: "Add client" });
    expect(screen.queryByRole("button", { name: /add human/i })).not.toBeInTheDocument();
    fireEvent.click(action);
    expect(onNewClient).toHaveBeenCalledTimes(1);
  });

  it("renders the directory list in the server-provided order", () => {
    renderView();
    const cards = screen.getAllByRole("button", { name: /profile$/ });
    expect(cards[0]).toHaveAccessibleName("Open Dave Smith's profile");
    expect(cards[1]).toHaveAccessibleName("Open Sarah Jones's profile");
  });

  it("disables A–Z letters that have no matches", () => {
    renderView();
    expect(screen.getAllByRole("button", { name: "Jump to the letter A" })[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Jump to the letter S" })[0]).not.toBeDisabled();
  });

  it("clicking an available letter reports the jump", () => {
    const { onLetterChange } = renderView();
    fireEvent.click(screen.getAllByRole("button", { name: "Jump to the letter J" })[0]);
    expect(onLetterChange).toHaveBeenCalledWith("J");
  });

  it("the sort toggle marks the active mode and switches on click", () => {
    const { onSortModeChange } = renderView();
    expect(screen.getByRole("button", { name: "First name" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Surname" }));
    expect(onSortModeChange).toHaveBeenCalledWith("last");
  });

  it("Load more is the fallback and calls loadMore", () => {
    const { loadMore } = renderView({ hasMore: true });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(loadMore).toHaveBeenCalled();
  });

  it("opens a profile on card click and on keyboard Enter", () => {
    const { onOpenHuman } = renderView();
    const card = screen.getByRole("button", { name: "Open Dave Smith's profile" });
    fireEvent.click(card);
    expect(onOpenHuman).toHaveBeenCalledWith("h2");
    fireEvent.keyDown(screen.getByRole("button", { name: "Open Sarah Jones's profile" }), { key: "Enter" });
    expect(onOpenHuman).toHaveBeenCalledWith("h1");
  });

  it("footer shows loaded-of-total", () => {
    renderView({ totalCount: 5 });
    expect(screen.getByText("Showing 2 of 5 humans")).toBeInTheDocument();
  });

  it("shows the email on a card when present", () => {
    renderView({ directoryHumans: [{ ...sarah, email: "sarah@example.com" }] });
    expect(
      screen.getByRole("link", { name: "sarah@example.com" }),
    ).toHaveAttribute("href", "mailto:sarah@example.com");
  });

  it("renders the history-flag reason as visible text, not just an emoji", () => {
    renderView({ directoryHumans: [{ ...sarah, historyFlag: "Muzzle required" }] });
    // The reason is real text (screen-reader readable), not only a title tooltip.
    expect(screen.getByText("Muzzle required")).toBeInTheDocument();
  });

  it("the grid/list view toggle switches mode and persists it", () => {
    renderView();
    expect(screen.getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("humansViewMode")).toBe("list");
    // Cards still render in list mode.
    expect(screen.getByRole("button", { name: "Open Dave Smith's profile" })).toBeInTheDocument();
  });

  it("filter chips toggle the server-side filter and reflect active state", () => {
    const { onToggleFilter } = renderView();
    fireEvent.click(screen.getByRole("button", { name: "No dogs" }));
    expect(onToggleFilter).toHaveBeenCalledWith("noDogs");
  });

  it("an active filter is pressed and listed in the footer", () => {
    renderView({
      filters: { flagged: true, noDogs: false, noPhone: true, whatsapp: false },
      totalCount: 4,
    });
    expect(screen.getByRole("button", { name: "Flagged" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Showing 2 of 4 humans · Flagged, No phone/)).toBeInTheDocument();
  });

  it("a no-dogs human shows the add-a-dog hint, which opens the profile", () => {
    const { onOpenHuman } = renderView({
      directoryHumans: [sarah],
      dogs: {},
      dogsByHumanId: {},
    });
    fireEvent.click(screen.getByRole("button", { name: "No dogs yet — add one?" }));
    expect(onOpenHuman).toHaveBeenCalledWith("h1");
  });
});
