// usePendingSignupLink — what happens when a phone save collides with a
// number another record already holds (Debt 7; the flow #774 added).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

const toastShow = vi.hoisted(() => vi.fn());
vi.mock("../../../contexts/ToastContext.jsx", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useToast: () => ({ show: toastShow }) };
});

const { usePendingSignupLink } = await import("./usePendingSignupLink.js");

const sarah = { id: "h1", fullName: "Sarah Jones", name: "Sarah", surname: "Jones" };
const shell = { id: "h9", name: "New", surname: "Member", isPendingSignup: true };
const dave = { id: "h2", name: "dave", surname: "smith", isPendingSignup: false };
const updates = { phone: "07700900123", address: "1 High St" };

function renderLink(overrides = {}) {
  const props = {
    human: sarah,
    humanId: "h1",
    humanFullName: "Sarah Jones",
    findHumanByPhone: vi.fn(async () => shell),
    onLinkPendingSignup: vi.fn(async () => ({ ok: true })),
    onUpdateHuman: vi.fn(async () => ({ id: "h1" })),
    ...overrides,
  };
  const hook = renderHook(() => usePendingSignupLink(props), {
    wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
  });
  return { ...hook, props };
}

describe("usePendingSignupLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("names an established customer who holds the number and hands the save back unhandled", async () => {
    const { result } = renderLink({ findHumanByPhone: vi.fn(async () => dave) });
    let handled;
    await act(async () => {
      handled = await result.current.handlePhoneTaken("07700900123", updates);
    });
    expect(handled).toBe(false);
    expect(toastShow).toHaveBeenCalledWith(
      "07700900123 is already on Dave Smith's record — open their profile to move it",
      "error",
    );
    expect(result.current.pendingLink).toBeNull();
  });

  it("falls back to a generic message when nobody can be found or linking is unavailable", async () => {
    const unknown = renderLink({ findHumanByPhone: vi.fn(async () => null) });
    await act(async () => {
      await unknown.result.current.handlePhoneTaken("07700900123", updates);
    });
    expect(toastShow).toHaveBeenCalledWith(
      "That number is already on another customer's record",
      "error",
    );

    const noLinker = renderLink({ onLinkPendingSignup: undefined });
    await act(async () => {
      await noLinker.result.current.handlePhoneTaken("07700900123", updates);
    });
    expect(noLinker.result.current.pendingLink).toBeNull();
  });

  it("holds the save open while the prompt is up, and cancel backs out without a write", async () => {
    const { result, props } = renderLink();
    let outcome;
    act(() => {
      outcome = result.current.handlePhoneTaken("07700900123", updates);
    });
    await waitFor(() => expect(result.current.pendingLink).toMatchObject({ hit: shell, phone: "07700900123" }));
    act(() => result.current.handleCancelLink());
    await expect(outcome).resolves.toBe(false);
    expect(result.current.pendingLink).toBeNull();
    expect(props.onLinkPendingSignup).not.toHaveBeenCalled();
    expect(props.onUpdateHuman).not.toHaveBeenCalled();
  });

  it("confirm links the shell, re-runs the rest of the draft and resolves the save", async () => {
    const { result, props } = renderLink();
    let outcome;
    act(() => {
      outcome = result.current.handlePhoneTaken("07700900123", updates);
    });
    await waitFor(() => expect(result.current.pendingLink).not.toBeNull());
    await act(async () => {
      await result.current.handleConfirmLink();
    });
    expect(props.onLinkPendingSignup).toHaveBeenCalledWith("h1", "h9", "07700900123");
    expect(props.onUpdateHuman).toHaveBeenCalledWith("h1", updates);
    expect(toastShow).toHaveBeenCalledWith(
      "Linked 07700900123 to Sarah Jones — they can book from the portal now",
      "success",
    );
    await expect(outcome).resolves.toBe(true);
    expect(result.current.pendingLink).toBeNull();
    expect(result.current.linking).toBe(false);
  });

  it("reports a refused link and leaves the draft open", async () => {
    const { result, props } = renderLink({
      onLinkPendingSignup: vi.fn(async () => ({ ok: false, error: "That signup was already linked" })),
    });
    let outcome;
    act(() => {
      outcome = result.current.handlePhoneTaken("07700900123", updates);
    });
    await waitFor(() => expect(result.current.pendingLink).not.toBeNull());
    await act(async () => {
      await result.current.handleConfirmLink();
    });
    expect(toastShow).toHaveBeenCalledWith("That signup was already linked", "error");
    expect(props.onUpdateHuman).not.toHaveBeenCalled();
    await expect(outcome).resolves.toBe(false);
    expect(result.current.pendingLink).toBeNull();
  });

  it("still counts the link as done when the follow-up save fails, but says so", async () => {
    const { result } = renderLink({ onUpdateHuman: vi.fn(async () => null) });
    let outcome;
    act(() => {
      outcome = result.current.handlePhoneTaken("07700900123", updates);
    });
    await waitFor(() => expect(result.current.pendingLink).not.toBeNull());
    await act(async () => {
      await result.current.handleConfirmLink();
    });
    expect(toastShow).toHaveBeenCalledWith(
      "Linked 07700900123 to Sarah Jones, but the other edits didn't save — try again",
      "error",
    );
    await expect(outcome).resolves.toBe(true);
  });
});
