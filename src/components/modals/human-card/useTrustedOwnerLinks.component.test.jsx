// useTrustedOwnerLinks — the incoming trusted-owner ids and the
// "link this human on a dog" action, extracted from HumanCardModal (Debt 7).
// Trust is directional: linking updates the DOG'S OWNER only, through the
// same onUpdateHuman path as the rest of the card.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

const trusted = vi.hoisted(() => ({
  fetchTrustedContactsForHuman: vi.fn(),
  fetchTrustedOwnerIdsForHuman: vi.fn(),
}));
vi.mock("../../../supabase/hooks/humans/useTrustedContacts", () => ({
  fetchTrustedContactsForHuman: trusted.fetchTrustedContactsForHuman,
  fetchTrustedOwnerIdsForHuman: trusted.fetchTrustedOwnerIdsForHuman,
}));

const toastShow = vi.hoisted(() => vi.fn());
vi.mock("../../../contexts/ToastContext.jsx", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useToast: () => ({ show: toastShow }) };
});

const { useTrustedOwnerLinks } = await import("./useTrustedOwnerLinks.js");

const sarah = { id: "h1", fullName: "Sarah Jones", name: "Sarah", surname: "Jones", trustedContacts: [] };
const dave = { id: "h2", fullName: "Dave Smith", name: "Dave", surname: "Smith", trustedContacts: [] };
const humans = { "Sarah Jones": sarah, "Dave Smith": dave };
const rex = { id: "d1", name: "Rex", _humanId: "h2" };

function renderLinks(overrides = {}) {
  const props = {
    human: sarah,
    humanId: "h1",
    humans,
    humanFullName: "Sarah Jones",
    onUpdateHuman: vi.fn(async () => ({ id: "h2" })),
    ensureDogsForHumans: vi.fn(),
    ...overrides,
  };
  const hook = renderHook(() => useTrustedOwnerLinks(props), {
    wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
  });
  return { ...hook, props };
}

describe("useTrustedOwnerLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trusted.fetchTrustedOwnerIdsForHuman.mockResolvedValue([]);
    trusted.fetchTrustedContactsForHuman.mockResolvedValue({ trustedContacts: [] });
  });

  it("loads the owners who trust this human and hydrates their dogs", async () => {
    trusted.fetchTrustedOwnerIdsForHuman.mockResolvedValueOnce(["h2", "h3"]);
    const { result, props } = renderLinks();
    await waitFor(() => expect(result.current.trustedOwnerIds).toEqual(["h2", "h3"]));
    expect(trusted.fetchTrustedOwnerIdsForHuman).toHaveBeenCalledWith("h1");
    expect(props.ensureDogsForHumans).toHaveBeenCalledWith(["h2", "h3"]);
  });

  it("refuses to link when the dog's owner is unknown or is this human", async () => {
    const { result, props } = renderLinks();
    await act(async () => {
      await result.current.handleLinkTrustedOnDog({ id: "d9", name: "Ghost", _humanId: "nobody" });
    });
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining("can't find who owns"), "error");
    await act(async () => {
      await result.current.handleLinkTrustedOnDog({ id: "d2", name: "Own", _humanId: "h1" });
    });
    expect(toastShow).toHaveBeenCalledWith("They already own that dog.", "error");
    expect(props.onUpdateHuman).not.toHaveBeenCalled();
  });

  it("links by appending this human to the owner's DB-hydrated trusted set", async () => {
    trusted.fetchTrustedContactsForHuman.mockResolvedValueOnce({
      trustedContacts: [{ id: "h7", relationship: "Partner" }],
    });
    const { result, props } = renderLinks();
    await act(async () => {
      await result.current.handleLinkTrustedOnDog(rex);
    });
    expect(props.onUpdateHuman).toHaveBeenCalledWith("Dave Smith", {
      trustedContacts: [
        { id: "h7", relationship: "Partner" },
        { id: "h1", relationship: "" },
      ],
    });
    expect(result.current.trustedOwnerIds).toContain("h2");
    expect(toastShow).toHaveBeenCalledWith("Linked Sarah Jones to Rex", "success");
  });

  it("treats an existing link as success without rewriting the owner", async () => {
    trusted.fetchTrustedContactsForHuman.mockResolvedValueOnce({
      trustedContacts: [{ id: "h1", relationship: "" }],
    });
    const { result, props } = renderLinks();
    await act(async () => {
      await result.current.handleLinkTrustedOnDog(rex);
    });
    expect(props.onUpdateHuman).not.toHaveBeenCalled();
    expect(result.current.trustedOwnerIds).toContain("h2");
    expect(toastShow).toHaveBeenCalledWith("Sarah Jones is already linked to Rex.", "success");
  });

  it("reports a failed save and leaves the owner list alone", async () => {
    const { result } = renderLinks({ onUpdateHuman: vi.fn(async () => null) });
    await act(async () => {
      await result.current.handleLinkTrustedOnDog(rex);
    });
    expect(toastShow).toHaveBeenCalledWith(expect.stringContaining("Couldn't link"), "error");
    expect(result.current.trustedOwnerIds).not.toContain("h2");
  });
});
