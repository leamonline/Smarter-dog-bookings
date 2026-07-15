// Component tests for the server-driven Humans Directory: it renders the
// directoryHumans list in server order (no client re-sort), the A–Z rail
// disables empty letters and reports jumps, the sort toggle and Load-more
// fall back cleanly, and cards expose independent actions.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

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
    const cards = screen.getAllByRole("article");
    expect(cards[0]).toHaveAccessibleName("Dave Smith");
    expect(cards[1]).toHaveAccessibleName("Sarah Jones");
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

  it("renders articles with explicit profile and contact actions", () => {
    const { onOpenHuman } = renderView({ directoryHumans: [sarah] });
    const article = screen.getByRole("article", { name: "Sarah Jones" });
    const profile = within(article).getByRole("button", { name: "View profile for Sarah Jones" });
    const phone = within(article).getByRole("link", { name: "07700900111" });

    phone.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(phone);
    expect(onOpenHuman).not.toHaveBeenCalled();
    fireEvent.click(profile);
    expect(onOpenHuman).toHaveBeenCalledWith("h1");
  });

  it.each(["Grid", "List"])("uses the identity-led %s card without merging contact actions", (mode) => {
    const { onOpenHuman } = renderView({
      directoryHumans: [{ ...sarah, email: "sarah@example.com" }],
      dogsByHumanId: {
        h1: [{ id: "d1", name: "Minnie", breed: "Shih Tzu", size: "small" }],
      },
    });
    if (mode === "List") fireEvent.click(screen.getByRole("button", { name: "List" }));

    const card = screen.getByRole("article", { name: "Sarah Jones" });
    expect(within(card).getByTestId("human-initials")).toHaveTextContent("SJ");
    expect(within(card).getByText(/Minnie/)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "sarah@example.com" })).toHaveAttribute(
      "href",
      "mailto:sarah@example.com",
    );

    fireEvent.click(within(card).getByRole("button", { name: "View profile for Sarah Jones" }));
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

  it("offers email as an independent action in List mode", () => {
    const { onOpenHuman } = renderView({
      directoryHumans: [{ ...sarah, email: "sarah@example.com" }],
    });
    fireEvent.click(screen.getByRole("button", { name: "List" }));

    const article = screen.getByRole("article", { name: "Sarah Jones" });
    const email = within(article).getByRole("link", { name: "sarah@example.com" });
    expect(email).toHaveAttribute("href", "mailto:sarah@example.com");

    email.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(email);
    expect(onOpenHuman).not.toHaveBeenCalled();
  });

  it("renders the history-flag reason as visible text, not just an emoji", () => {
    renderView({ directoryHumans: [{ ...sarah, historyFlag: "Muzzle required" }] });
    // The reason is real text (screen-reader readable), not only a title tooltip.
    const article = screen.getByRole("article", { name: "Sarah Jones" });
    expect(within(article).getByText("Muzzle required")).toBeInTheDocument();
  });

  it("the grid/list view toggle switches mode and persists it", () => {
    renderView();
    expect(screen.getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "List" }));
    expect(screen.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("humansViewMode")).toBe("list");
    // Cards still render in list mode.
    expect(screen.getByRole("article", { name: "Dave Smith" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View profile for Dave Smith" })).toBeInTheDocument();
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
    const article = screen.getByRole("article", { name: "Sarah Jones" });
    fireEvent.click(within(article).getByRole("button", { name: "No dogs yet — add one?" }));
    expect(onOpenHuman).toHaveBeenCalledWith("h1");
  });

  it.each(["Grid", "List"])("keeps the no-phone state inside the %s card", (mode) => {
    renderView({ directoryHumans: [{ ...sarah, phone: "" }] });
    if (mode === "List") fireEvent.click(screen.getByRole("button", { name: "List" }));

    const article = screen.getByRole("article", { name: "Sarah Jones" });
    expect(within(article).getByText("No phone")).toBeInTheDocument();
  });

  it("keeps profile and inline unarchive actions independent in archived List mode", async () => {
    const archivedHuman = { ...sarah, id: "h9", fullName: "Sarah Jones" };
    const fetchArchivedHumans = vi.fn(() => Promise.resolve([archivedHuman]));
    const { onOpenHuman, onUpdateHuman } = renderView({ fetchArchivedHumans });

    fireEvent.click(screen.getByRole("button", { name: "List" }));
    fireEvent.click(screen.getByRole("button", { name: "Show archived" }));

    const article = await screen.findByRole("article", { name: "Sarah Jones" });
    const profile = within(article).getByRole("button", { name: "View profile for Sarah Jones" });
    const unarchive = within(article).getByRole("button", { name: "Unarchive" });
    expect(unarchive).not.toHaveClass("absolute");
    expect(unarchive).toHaveClass("min-h-[40px]");

    fireEvent.click(profile);
    expect(onOpenHuman).toHaveBeenCalledWith("h9");
    fireEvent.click(unarchive);
    expect(onUpdateHuman).toHaveBeenCalledWith("h9", { archivedAt: null });
    expect(onOpenHuman).toHaveBeenCalledTimes(1);
  });
});
