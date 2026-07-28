// Regression test for the "create new trusted human" duplicate guard.
// The humans directory no longer enforces a unique (name, surname), so this
// flow must look an existing customer up and link them rather than blindly
// inserting a second record. (DogCardModal.handleAddNewTrusted uses the same
// pattern.)
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";
import { TrustedHumansPanel } from "../shared/TrustedHumansPanel.jsx";

const trustedContactMocks = vi.hoisted(() => ({
  fetchTrustedContactsForHuman: vi.fn().mockResolvedValue({
    trustedContacts: [],
    trustedIds: [],
  }),
}));

vi.mock("../../../supabase/hooks/humans/useTrustedContacts", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchTrustedContactsForHuman:
    trustedContactMocks.fetchTrustedContactsForHuman,
}));

const owner = {
  id: "owner-1",
  fullName: "Alice Owner",
  name: "Alice",
  surname: "Owner",
  trustedContacts: [],
};

function renderPanel(overrides = {}) {
  const onAddHuman = vi.fn().mockResolvedValue({ id: "new-1", fullName: "Sarah Jones" });
  const onUpdateHuman = vi.fn().mockResolvedValue({ id: "saved" });
  const findHumanByFullName = vi.fn().mockResolvedValue(null);
  const props = {
    human: owner,
    humanFullName: owner.fullName,
    humans: {},
    onClose: vi.fn(),
    onOpenHuman: vi.fn(),
    onUpdateHuman,
    onAddHuman,
    findHumanByFullName,
    searchHumansByTerm: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
  const result = render(
    <ToastProvider>
      <TrustedHumansPanel {...props} />
    </ToastProvider>,
  );
  return { ...result, onAddHuman, onUpdateHuman, findHumanByFullName, props };
}

// Walk the UI to the filled-in "New trusted human" form, ready to submit.
function openAndFillNewTrustedForm() {
  fireEvent.click(screen.getByRole("button", { name: "Add" })); // reveal the add panel
  fireEvent.click(screen.getByRole("button", { name: /create new human/i }));
  fireEvent.change(screen.getByPlaceholderText("First name"), { target: { value: "Sarah" } });
  fireEvent.change(screen.getByPlaceholderText("Surname"), { target: { value: "Jones" } });
  fireEvent.change(screen.getByPlaceholderText("Phone number"), {
    target: { value: "07700900111" },
  });
}

describe("TrustedHumansPanel", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("links an existing same-named customer instead of creating a duplicate", async () => {
    const existing = {
      id: "existing-1",
      fullName: "Sarah Jones",
      name: "Sarah",
      surname: "Jones",
      trustedContacts: [],
    };
    const findHumanByFullName = vi.fn().mockResolvedValue(existing);
    const { onAddHuman, onUpdateHuman } = renderPanel({ findHumanByFullName });

    openAndFillNewTrustedForm();
    fireEvent.click(screen.getByRole("button", { name: "Add" })); // submit the new-trusted form

    await waitFor(() => expect(onUpdateHuman).toHaveBeenCalled());
    expect(findHumanByFullName).toHaveBeenCalledWith("Sarah", "Jones");
    // No new record is created — the existing customer is linked instead.
    expect(onAddHuman).not.toHaveBeenCalled();
    expect(onUpdateHuman).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({
        trustedContacts: expect.arrayContaining([
          expect.objectContaining({ id: "existing-1" }),
        ]),
      }),
    );
  });

  it("creates a new customer when no existing match is found", async () => {
    const findHumanByFullName = vi.fn().mockResolvedValue(null);
    const { onAddHuman } = renderPanel({ findHumanByFullName });

    openAndFillNewTrustedForm();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onAddHuman).toHaveBeenCalledTimes(1));
    expect(onAddHuman).toHaveBeenCalledWith(
      // The typed national number is normalised to E.164 before it's stored.
      expect.objectContaining({ name: "Sarah", surname: "Jones", phone: "+447700900111" }),
    );
  });

  it("does not report success when a newly-created human cannot be linked to the owner", async () => {
    const onUpdateHuman = vi.fn().mockResolvedValue(null);
    renderPanel({ onUpdateHuman });

    openAndFillNewTrustedForm();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(
      await screen.findByText("Couldn't add trusted human — please try again."),
    ).toBeInTheDocument();
    expect(onUpdateHuman).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Trusted human added")).not.toBeInTheDocument();
  });

  it("removes the shared relationship from both humans after confirmation", async () => {
    const linkedOwner = {
      ...owner,
      trustedContacts: [
        {
          id: "trusted-1",
          fullName: "Mark Smith",
          relationship: "Dog walker",
        },
      ],
    };
    const linkedTrustedHuman = {
      id: "trusted-1",
      fullName: "Mark Smith",
      name: "Mark",
      surname: "Smith",
      phone: "07700900222",
      trustedContacts: [
        {
          id: "owner-1",
          fullName: "Alice Owner",
          relationship: "",
        },
      ],
    };
    const onUpdateHuman = vi.fn().mockResolvedValue({ id: "saved" });

    renderPanel({
      human: linkedOwner,
      humans: {
        "Alice Owner": linkedOwner,
        "Mark Smith": linkedTrustedHuman,
      },
      onUpdateHuman,
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Remove Mark Smith as trusted human",
      }),
    );

    expect(await screen.findByText("Unlink trusted human?")).toBeInTheDocument();
    expect(onUpdateHuman).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(onUpdateHuman).toHaveBeenCalledTimes(2));
    expect(onUpdateHuman).toHaveBeenNthCalledWith(1, "owner-1", {
      trustedContacts: [],
    });
    expect(onUpdateHuman).toHaveBeenNthCalledWith(2, "trusted-1", {
      trustedContacts: [],
    });
  });

  it("saves a relationship edit back to the shared human record", async () => {
    const linkedOwner = {
      ...owner,
      trustedContacts: [
        {
          id: "trusted-1",
          fullName: "Mark Smith",
          relationship: "Friend",
        },
      ],
    };
    const onUpdateHuman = vi.fn().mockResolvedValue({ id: "saved" });

    renderPanel({
      human: linkedOwner,
      humans: {
        "Alice Owner": linkedOwner,
        "Mark Smith": {
          id: "trusted-1",
          fullName: "Mark Smith",
          name: "Mark",
          surname: "Smith",
          trustedContacts: [],
        },
      },
      onUpdateHuman,
    });

    const relationship = screen.getByRole("textbox", {
      name: "Relationship for Mark Smith",
    });
    fireEvent.change(relationship, { target: { value: "Dog walker" } });
    fireEvent.blur(relationship);

    await waitFor(() =>
      expect(onUpdateHuman).toHaveBeenCalledWith("owner-1", {
        trustedContacts: [
          {
            id: "trusted-1",
            fullName: "Mark Smith",
            relationship: "Dog walker",
          },
        ],
      }),
    );
  });

  it("keeps the section visible when a card has no linked owner", () => {
    renderPanel({
      human: null,
      humanFullName: "",
      missingHumanMessage: "Link an owner to manage trusted humans.",
    });

    expect(
      screen.getByRole("region", { name: "Trusted humans" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Link an owner to manage trusted humans."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add a trusted human/i }),
    ).not.toBeInTheDocument();
  });

  it("stops after a failed owner update instead of showing a false success", async () => {
    const candidate = {
      id: "trusted-1",
      fullName: "Mark Smith",
      name: "Mark",
      surname: "Smith",
      phone: "07700900222",
      trustedContacts: [],
    };
    const onUpdateHuman = vi.fn().mockResolvedValue(null);
    renderPanel({
      humans: {
        "Alice Owner": owner,
        "Mark Smith": candidate,
      },
      onUpdateHuman,
    });

    const panel = screen.getByRole("region", { name: "Trusted humans" });
    fireEvent.click(within(panel).getByRole("button", { name: "Add" }));
    fireEvent.change(
      within(panel).getByPlaceholderText("Search by name or phone..."),
      { target: { value: "Mark" } },
    );
    fireEvent.click(within(panel).getByRole("button", { name: /Mark Smith/ }));

    expect(
      await screen.findByText("Couldn't add trusted human — please try again."),
    ).toBeInTheDocument();
    expect(onUpdateHuman).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Trusted human linked")).not.toBeInTheDocument();
  });

  it("preserves the trusted human’s other links when adding the reciprocal relationship", async () => {
    const candidate = {
      id: "trusted-1",
      fullName: "Mark Smith",
      name: "Mark",
      surname: "Smith",
      phone: "07700900222",
      trustedContacts: [],
    };
    trustedContactMocks.fetchTrustedContactsForHuman.mockResolvedValueOnce({
      trustedContacts: [
        {
          id: "third-1",
          fullName: "Charlie Friend",
          relationship: "Friend",
        },
      ],
      trustedIds: ["Charlie Friend"],
    });
    const onUpdateHuman = vi.fn().mockResolvedValue({ id: "saved" });
    renderPanel({
      humans: {
        "Alice Owner": owner,
        "Mark Smith": candidate,
      },
      onUpdateHuman,
    });

    const panel = screen.getByRole("region", { name: "Trusted humans" });
    fireEvent.click(within(panel).getByRole("button", { name: "Add" }));
    fireEvent.change(
      within(panel).getByPlaceholderText("Search by name or phone..."),
      { target: { value: "Mark" } },
    );
    fireEvent.click(within(panel).getByRole("button", { name: /Mark Smith/ }));

    await waitFor(() => expect(onUpdateHuman).toHaveBeenCalledTimes(2));
    expect(onUpdateHuman).toHaveBeenNthCalledWith(2, "trusted-1", {
      trustedContacts: [
        {
          id: "third-1",
          fullName: "Charlie Friend",
          relationship: "Friend",
        },
        {
          id: "owner-1",
          relationship: "",
        },
      ],
    });
  });
});
