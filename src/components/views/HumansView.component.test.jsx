// Component tests for the server-driven Humans Directory: it renders the
// directoryHumans list in server order (no client re-sort), the A–Z rail
// disables empty letters and reports jumps, the sort toggle and Load-more
// fall back cleanly, and cards expose independent actions.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

import { SalonProvider } from "../../contexts/SalonContext";

const { HumansView } = await import("./HumansView.jsx");

const sarah = { id: "h1", name: "Sarah", surname: "Jones", fullName: "Sarah Jones", phone: "07700900111", whatsapp: true, historyFlag: "" };
const dave = { id: "h2", name: "Dave", surname: "Smith", fullName: "Dave Smith", phone: "07700900112", whatsapp: false, historyFlag: "" };

// The view reads shared salon data from SalonContext (Debt 11), so the
// harness provides it the way App.jsx does; unrelated provider props are stubs.
function salonProps(overrides = {}) {
  return {
    dogs: {},
    humans: {},
    bookingsByDate: {},
    daySettings: {},
    dayOpenState: {},
    currentDateStr: "2026-08-10",
    currentDateObj: new Date("2026-08-10T12:00:00"),
    onAdd: vi.fn(),
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    onUpdateDog: vi.fn(),
    onUpdateHuman: vi.fn(),
    onAddHuman: vi.fn(),
    onAddDog: vi.fn(),
    onOpenHuman: vi.fn(),
    onOpenDog: vi.fn(),
    ...overrides,
  };
}

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
  const { humans, dogs, dogsByHumanId, ensureDogsForHumans, onOpenHuman, onUpdateHuman, isOnline, ...viewProps } = props;
  render(
    <SalonProvider {...salonProps({ humans, dogs, dogsByHumanId, ensureDogsForHumans, onOpenHuman, onUpdateHuman, isOnline })}>
      <HumansView {...viewProps} />
    </SalonProvider>,
  );
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
    const phone = within(article).getByRole("link", { name: "Call Sarah Jones" });

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
    expect(card).toHaveClass(`human-directory-card--${mode.toLowerCase()}`);
    expect(within(card).getByText(/Minnie/)).toBeInTheDocument();
    if (mode === "Grid") {
      expect(within(card).getByTestId("human-initials")).toHaveTextContent("SJ");
      expect(within(card).getByRole("link", { name: "sarah@example.com" })).toHaveAttribute(
        "href",
        "mailto:sarah@example.com",
      );
    } else {
      expect(within(card).queryByTestId("human-initials")).not.toBeInTheDocument();
      const ownerDetails = within(card).getByTestId("human-owner-details");
      expect(
        Array.from(
          ownerDetails.querySelectorAll(
            ".human-directory-card__name, .human-directory-card__phone, .human-directory-card__email",
          ),
        ).map((element) => element.textContent),
      ).toEqual(["Sarah Jones", "07700900111", "sarah@example.com"]);
      expect(within(card).getByRole("link", { name: "Email Sarah Jones" })).toHaveAttribute(
        "href",
        "mailto:sarah@example.com",
      );
    }

    fireEvent.click(within(card).getByRole("button", { name: "View profile for Sarah Jones" }));
    expect(onOpenHuman).toHaveBeenCalledWith("h1");
  });

  it("lets one dog fill the balanced silhouette stage without visible pack labels", () => {
    renderView({
      directoryHumans: [sarah],
      dogsByHumanId: {
        h1: [{ id: "d1", name: "Minnie", breed: "Shih Tzu", size: "small" }],
      },
    });

    const card = screen.getByRole("article", { name: "Sarah Jones" });
    const dogPanel = within(card).getByTestId("human-dog-panel");
    const stage = within(dogPanel).getByTestId("human-pack-stage");
    const figures = within(stage).getByTestId("human-pack-figures");
    expect(card).toHaveAttribute("data-pack-composition", "single");
    expect(card).toHaveClass("human-directory-card--grid", "human-directory-card--small");
    expect(stage).toHaveClass("human-pack-stage--single");
    expect(figures).toHaveClass("human-pack-figures--single");
    expect(within(stage).getByRole("img", { name: "Minnie, small dog" })).toHaveAttribute(
      "data-size-tone",
      "small",
    );
    expect(within(card).queryByText(/their pack/i)).not.toBeInTheDocument();
    expect(within(card).queryByText(/^1 dog$/i)).not.toBeInTheDocument();
  });

  it.each(["Grid", "List"])(
    "shows each dog as one stronger name-and-breed line without visible size copy in %s mode",
    (mode) => {
      renderView({
        directoryHumans: [sarah],
        dogsByHumanId: {
          h1: [{ id: "d1", name: "Max", breed: "Shih Tzu", size: "small" }],
        },
      });
      if (mode === "List") fireEvent.click(screen.getByRole("button", { name: "List" }));

      const card = screen.getByRole("article", { name: "Sarah Jones" });
      const dogArea = within(card).getByRole("list", { name: "1 linked dog" });
      expect(within(dogArea).getByText("Max - Shih Tzu")).toHaveClass(
        "human-pack-roster__label",
      );
      expect(within(dogArea).queryByText(/^(Small|Medium|Large)$/i)).not.toBeInTheDocument();
    },
  );

  it("renders every linked dog in a fixed multi-dog composition and scrollable roster", () => {
    const linkedDogs = [
      { id: "d1", name: "Minnie", breed: "Shih Tzu", size: "small" },
      { id: "d2", name: "Bertie", breed: "Cockapoo", size: "medium" },
      { id: "d3", name: "Rufus", breed: "Labrador", size: "large" },
      { id: "d4", name: "Poppy", breed: "Pug", size: "small" },
      { id: "d5", name: "Lola", breed: "Cavapoo", size: "medium" },
      { id: "d6", name: "Teddy", breed: "Bichon Frise", size: "small" },
    ];

    renderView({
      directoryHumans: [sarah],
      dogsByHumanId: { h1: linkedDogs },
    });

    const card = screen.getByRole("article", { name: "Sarah Jones" });
    const dogArea = within(card).getByRole("list", { name: "6 linked dogs" });
    const stage = within(card).getByTestId("human-pack-stage");
    for (const dog of linkedDogs) {
      expect(
        within(dogArea).getByText(`${dog.name} - ${dog.breed}`),
      ).toBeInTheDocument();
      expect(
        within(stage).getByRole("img", { name: new RegExp(`^${dog.name},`, "i") }),
      ).toBeInTheDocument();
    }
    expect(card).toHaveAttribute("data-pack-composition", "multiple");
    expect(card).toHaveClass("human-directory-card--grid", "human-directory-card--mixed");
    expect(stage).toHaveClass("human-pack-stage--multiple");
    expect(dogArea).toHaveClass("human-pack-roster");
    expect(within(card).queryByLabelText(/more dogs/i)).not.toBeInTheDocument();
    expect(within(card).queryByText(/^6 dogs$/i)).not.toBeInTheDocument();
  });

  it("uses equal-height grid tracks and keeps full contact text available", () => {
    renderView({
      directoryHumans: [{ ...sarah, email: "sarah.with.a.long.email@example.com" }],
    });

    const grid = screen.getByTestId("humans-directory-grid");
    const card = screen.getByRole("article", { name: "Sarah Jones" });
    const email = within(card).getByRole("link", {
      name: "sarah.with.a.long.email@example.com",
    });
    expect(grid).toHaveClass("auto-rows-fr", "items-stretch");
    expect(card).toHaveClass("human-directory-card--grid");
    expect(email).not.toHaveClass("truncate");
    expect(email).toHaveClass("break-all", "whitespace-normal");
    expect(within(card).getByTestId("human-contact-strip")).toHaveClass("flex-wrap");
  });

  it("presents larger call, WhatsApp, SMS and email actions at the right of a list card", () => {
    renderView({ directoryHumans: [{ ...sarah, email: "sarah@example.com" }] });
    fireEvent.click(screen.getByRole("button", { name: "List" }));

    const card = screen.getByRole("article", { name: "Sarah Jones" });
    const contactStrip = within(card).getByTestId("human-contact-strip");
    const contactActions = within(card).getByTestId("human-contact-actions");
    const call = within(contactActions).getByRole("link", { name: "Call Sarah Jones" });
    const whatsapp = within(contactActions).getByRole("link", { name: "Open in WhatsApp" });
    const sms = within(contactActions).getByRole("link", { name: "Send SMS to Sarah Jones" });
    const email = within(contactActions).getByRole("link", { name: "Email Sarah Jones" });
    expect(contactStrip).toHaveTextContent("07700900111");
    expect(contactStrip).toHaveTextContent("sarah@example.com");
    expect(call).toHaveClass("size-11");
    expect(whatsapp).toHaveClass("size-11");
    expect(sms).toHaveClass("size-11");
    expect(email).toHaveClass("size-11");
    expect(call.querySelector("svg")).toHaveAttribute("width", "22");
    expect(whatsapp.querySelector("svg")).toHaveAttribute("width", "22");
    expect(sms).toHaveAttribute("href", "sms:+447700900111");
    expect(email).toHaveAttribute("href", "mailto:sarah@example.com");
    expect(within(contactActions).queryByText("WhatsApp")).not.toBeInTheDocument();
  });

  it.each(["Grid", "List"])("keeps every direct %s card action at least 44px tall", (mode) => {
    renderView({
      directoryHumans: [{ ...sarah, email: "sarah@example.com", historyFlag: "Muzzle required" }],
      dogsByHumanId: { h1: [] },
    });
    if (mode === "List") fireEvent.click(screen.getByRole("button", { name: "List" }));

    const card = screen.getByRole("article", { name: "Sarah Jones" });
    expect(within(card).getByRole("link", { name: "Call Sarah Jones" })).toHaveClass("size-11");
    expect(within(card).getByRole("link", { name: "Open in WhatsApp" })).toHaveClass(
      "size-11",
    );
    if (mode === "Grid") {
      expect(within(card).getByRole("link", { name: "sarah@example.com" })).toHaveClass("min-h-11");
    } else {
      expect(within(card).getByRole("link", { name: "Send SMS to Sarah Jones" })).toHaveClass(
        "size-11",
      );
      expect(within(card).getByRole("link", { name: "Email Sarah Jones" })).toHaveClass(
        "size-11",
      );
    }
    expect(within(card).getByRole("button", { name: /No dogs linked yet/i })).toHaveClass("min-h-11");
    expect(within(card).getByRole("button", { name: "View profile for Sarah Jones" })).toHaveClass("size-11");
    expect(within(card).getByRole("button", { name: "Safety alert: Muzzle required" })).toHaveClass(
      "min-h-11",
      "min-w-11",
    );
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
    expect(within(article).getByText("sarah@example.com")).toHaveClass(
      "human-directory-card__email",
    );
    const email = within(article).getByRole("link", { name: "Email Sarah Jones" });
    expect(email).toHaveAttribute("href", "mailto:sarah@example.com");

    email.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(email);
    expect(onOpenHuman).not.toHaveBeenCalled();
  });

  it("renders the history-flag reason as visible text, not just an emoji", () => {
    renderView({ directoryHumans: [{ ...sarah, historyFlag: "Muzzle required" }] });
    // The reason is real text (screen-reader readable), not only a title tooltip.
    const article = screen.getByRole("article", { name: "Sarah Jones" });
    const safetyAlert = within(article).getByRole("button", {
      name: "Safety alert: Muzzle required",
    });
    expect(within(article).getByText("Muzzle required")).toBeInTheDocument();
    fireEvent.click(safetyAlert);
    expect(safetyAlert).toHaveAttribute("aria-expanded", "true");
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
    fireEvent.click(within(article).getByRole("button", { name: /No dogs linked yet/i }));
    expect(onOpenHuman).toHaveBeenCalledWith("h1");
  });

  it.each(["Grid", "List"])("keeps the no-phone state inside the %s card", (mode) => {
    renderView({ directoryHumans: [{ ...sarah, phone: "" }] });
    if (mode === "List") fireEvent.click(screen.getByRole("button", { name: "List" }));

    const article = screen.getByRole("article", { name: "Sarah Jones" });
    expect(within(article).getByText("No phone")).toBeInTheDocument();
  });

  it.each(["Grid", "List"])(
    "keeps archived %s card identity primary and unarchive in a 44px secondary row",
    async (mode) => {
      const archivedHuman = { ...sarah, id: "h9", fullName: "Sarah Jones" };
      const fetchArchivedHumans = vi.fn(() => Promise.resolve([archivedHuman]));
      const { onOpenHuman, onUpdateHuman } = renderView({ fetchArchivedHumans });

      if (mode === "List") fireEvent.click(screen.getByRole("button", { name: "List" }));
      fireEvent.click(screen.getByRole("button", { name: "Show archived" }));

      const article = await screen.findByRole("article", { name: "Sarah Jones" });
      const primary = within(article).getByTestId("human-card-primary");
      const secondary = within(article).getByTestId("human-card-secondary-actions");
      const profile = within(article).getByRole("button", { name: "View profile for Sarah Jones" });
      const unarchive = within(article).getByRole("button", { name: "Unarchive" });
      expect(article).toHaveClass("flex-col");
      expect(primary).toHaveClass("w-full", "min-w-0");
      expect(within(primary).getByText("Sarah Jones")).toBeInTheDocument();
      expect(within(primary).getByRole("button", { name: "View profile for Sarah Jones" })).toBe(profile);
      expect(within(primary).queryByRole("button", { name: "Unarchive" })).not.toBeInTheDocument();
      expect(secondary).toHaveClass("flex", "w-full", "justify-end");
      expect(within(secondary).getByRole("button", { name: "Unarchive" })).toBe(unarchive);
      expect(unarchive).toHaveClass("min-h-11");

      fireEvent.click(profile);
      expect(onOpenHuman).toHaveBeenCalledWith("h9");
      fireEvent.click(unarchive);
      expect(onUpdateHuman).toHaveBeenCalledWith("h9", { archivedAt: null });
      expect(onOpenHuman).toHaveBeenCalledTimes(1);
    },
  );
});
