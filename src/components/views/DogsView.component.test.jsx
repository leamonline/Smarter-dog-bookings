// Component tests for the server-driven Dogs Directory: it renders the
// directoryDogs list in server order (no client re-sort), the A–Z rail disables
// empty letters and reports jumps, the sort/filter/view toggles report changes,
// cards expose independent profile and owner-contact actions, and the
// archived view loads + unarchives.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

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
    const cards = screen.getAllByRole("article");
    expect(cards[0]).toHaveAccessibleName("Rex");
    expect(cards[1]).toHaveAccessibleName("Bella");
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

  it("renders articles with independent owner contacts and a profile action", () => {
    const { onOpenDog } = renderView({ directoryDogs: [rex] });
    const article = screen.getByRole("article", { name: "Rex" });
    const profile = within(article).getByRole("button", { name: "View profile for Rex" });
    const phone = within(article).getByRole("link", { name: "07700900111" });

    phone.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(phone);
    expect(onOpenDog).not.toHaveBeenCalled();
    fireEvent.click(profile);
    expect(onOpenDog).toHaveBeenCalledWith("d1");
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

  it.each([
    ["small", "small"],
    ["medium", "medium"],
    ["large", "large"],
    [null, "unknown"],
  ])("renders the %s silhouette with written size", (size, tone) => {
    renderView({ directoryDogs: [{ ...rex, size, name: `Dog ${tone}` }] });
    const card = screen.getByRole("article", { name: `Dog ${tone[0].toUpperCase()}${tone.slice(1)}` });
    expect(within(card).getByTestId("dog-size-mark")).toHaveAttribute("data-size-tone", tone);
    const written = tone === "unknown" ? "Size unknown" : `${size[0].toUpperCase()}${size.slice(1)}`;
    expect(within(card).getByText(written)).toBeInTheDocument();
  });

  it("keeps alert, incomplete, owner contact and profile actions independent", () => {
    const { onOpenDog } = renderView({ directoryDogs: [{ ...bella, size: null }] });
    const card = screen.getByRole("article", { name: "Bella" });
    expect(within(card).getByText("Incomplete")).toBeInTheDocument();
    expect(within(card).getByText("Nervous of clippers")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "07700900112" })).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "View profile for Bella" }));
    expect(onOpenDog).toHaveBeenCalledWith("d2");
  });

  it("preserves breed, age and the resolved owner label", () => {
    renderView({ directoryDogs: [rex] });
    const card = screen.getByRole("article", { name: "Rex" });
    expect(within(card).getByText("Boxer · 3 yrs")).toBeInTheDocument();
    expect(within(card).getByText("Sarah Jones")).toBeInTheDocument();
  });

  it("preserves the explicit missing-owner state", () => {
    renderView({ directoryDogs: [{ ...rex, ownerFullName: "", ownerPhone: "" }] });
    const card = screen.getByRole("article", { name: "Rex" });
    expect(within(card).getByText("Unknown owner")).toBeInTheDocument();
    expect(within(card).queryByRole("link", { name: "07700900111" })).not.toBeInTheDocument();
  });

  it("preserves the owner skeleton while the humans map is unavailable", () => {
    renderView({
      directoryDogs: [{ id: "d4", name: "Scout", breed: "Spaniel", size: "medium", age: "2", alerts: [], humanId: "h4" }],
      humans: {},
    });
    const card = screen.getByRole("article", { name: "Scout" });
    expect(card.querySelector(".animate-skeleton-pulse")).toBeInTheDocument();
    expect(within(card).queryByText("Unknown owner")).not.toBeInTheDocument();
  });

  it("gives every direct dog-card action a 44px touch target", () => {
    renderView({ directoryDogs: [bella] });
    const card = screen.getByRole("article", { name: "Bella" });
    expect(within(card).getByRole("link", { name: "07700900112" })).toHaveClass("min-h-11");
    expect(within(card).getByRole("link", { name: "Open in WhatsApp" })).toHaveClass("size-11");
    expect(within(card).getByRole("button", { name: "Safety alert: Nervous of clippers" })).toHaveClass("min-h-11");
    expect(within(card).getByRole("button", { name: "View profile for Bella" })).toHaveClass("size-11");
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
    const rexCard = screen.getByRole("article", { name: "Rex" });
    expect(within(rexCard).getByTestId("dog-size-mark")).toHaveAttribute("data-size-tone", "large");
    expect(within(rexCard).getByText("Large")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View profile for Rex" })).toBeInTheDocument();
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

  it.each(["grid", "list"])("keeps archived Dog identity and actions in independent %s rows", async (mode) => {
    const archivedDog = { id: "d9", name: "Max", breed: "Lab", size: "large", age: "4", alerts: [], ownerFullName: "Old Owner", ownerPhone: "" };
    const fetchArchivedDogs = vi.fn(() => Promise.resolve([archivedDog]));
    renderView({ fetchArchivedDogs });

    if (mode === "list") fireEvent.click(screen.getByRole("button", { name: "List" }));
    fireEvent.click(screen.getByRole("button", { name: "Show archived" }));

    const article = await screen.findByRole("article", { name: "Max" });
    const primary = within(article).getByTestId("dog-card-primary");
    const secondary = within(article).getByTestId("dog-card-secondary-actions");

    expect(primary).toHaveClass("w-full");
    expect(within(primary).getByTestId("dog-size-mark")).toHaveAttribute("data-size-tone", "large");
    expect(within(primary).getByText("Max")).toBeInTheDocument();
    expect(within(primary).getByText("Lab · 4 yrs")).toBeInTheDocument();
    expect(within(primary).getByText("Large")).toBeInTheDocument();
    expect(within(primary).getByRole("button", { name: "View profile for Max" })).toHaveClass("size-11");
    expect(within(primary).queryByRole("button", { name: "Unarchive" })).not.toBeInTheDocument();

    expect(secondary).toHaveClass("w-full");
    expect(within(secondary).getByRole("button", { name: "Unarchive" })).toHaveClass("min-h-11");
  });

  it("Show archived loads the archived set and unarchive calls onUpdateDog", async () => {
    const archivedDog = { id: "d9", name: "Max", breed: "Lab", size: "large", alerts: [], ownerFullName: "Old Owner", ownerPhone: "" };
    const fetchArchivedDogs = vi.fn(() => Promise.resolve([archivedDog]));
    const { onOpenDog, onUpdateDog } = renderView({ fetchArchivedDogs });

    fireEvent.click(screen.getByRole("button", { name: "List" }));
    fireEvent.click(screen.getByRole("button", { name: "Show archived" }));
    expect(fetchArchivedDogs).toHaveBeenCalled();

    // The archived card arrives once the fetch resolves.
    const article = await screen.findByRole("article", { name: "Max" });
    const profile = within(article).getByRole("button", { name: "View profile for Max" });
    const unarchive = within(article).getByRole("button", { name: "Unarchive" });
    expect(unarchive).not.toHaveClass("absolute");
    expect(unarchive).toHaveClass("min-h-11");

    fireEvent.click(profile);
    expect(onOpenDog).toHaveBeenCalledWith("d9");
    fireEvent.click(unarchive);
    expect(onUpdateDog).toHaveBeenCalledWith("d9", { archivedAt: null });
    expect(onOpenDog).toHaveBeenCalledTimes(1);
  });
});
