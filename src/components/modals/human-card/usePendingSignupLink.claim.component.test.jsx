// usePendingSignupLink — the CLAIM path: this record is the portal signup
// shell, and the customer's typed name matched a customer already on the
// books (humans.claims_human_id). Staff link rather than approve.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

const toastShow = vi.hoisted(() => vi.fn());
vi.mock("../../../contexts/ToastContext.jsx", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useToast: () => ({ show: toastShow }) };
});

const { usePendingSignupLink } = await import("./usePendingSignupLink.js");

const clare = { id: "h-clare", name: "Clare", surname: "Duncan", fullName: "Clare Duncan" };
const shell = {
  id: "h-shell",
  name: "New member",
  surname: "Pending 7399567445",
  fullName: "New member Pending 7399567445",
  phone: "+447399567445",
  claimsHumanId: "h-clare",
};

function renderLink(overrides = {}) {
  const props = {
    human: shell,
    humanId: shell.id,
    humanFullName: shell.fullName,
    humans: { "Clare Duncan": clare },
    fetchHumanById: vi.fn(async () => null),
    findHumanByPhone: vi.fn(async () => null),
    onLinkPendingSignup: vi.fn(async () => ({ ok: true })),
    onUpdateHuman: vi.fn(async () => ({ id: shell.id })),
    onOpenHuman: vi.fn(),
    ...overrides,
  };
  const hook = renderHook(() => usePendingSignupLink(props), {
    wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider>,
  });
  return { ...hook, props };
}

describe("usePendingSignupLink — claim path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the claimed record from the cache without a round-trip", async () => {
    const { result, props } = renderLink();
    await waitFor(() => expect(result.current.claimedHuman?.id).toBe("h-clare"));
    expect(result.current.claimedName).toBe("Clare Duncan");
    expect(props.fetchHumanById).not.toHaveBeenCalled();
  });

  it("fetches the claimed record when it sits past the paginated window", async () => {
    const fetchHumanById = vi.fn(async () => clare);
    const { result } = renderLink({ humans: {}, fetchHumanById });
    await waitFor(() => expect(result.current.claimedHuman?.id).toBe("h-clare"));
    expect(fetchHumanById).toHaveBeenCalledWith("h-clare");
  });

  it("links the shell onto the claimed record and opens it", async () => {
    const { result, props } = renderLink();
    await waitFor(() => expect(result.current.claimedHuman).not.toBeNull());

    act(() => result.current.openClaimLink());
    expect(result.current.pendingClaimLink).toBe(true);

    await act(async () => {
      await result.current.handleConfirmClaimLink();
    });
    // Winner first, shell second — the shell is what gets deleted.
    expect(props.onLinkPendingSignup).toHaveBeenCalledWith(
      "h-clare",
      "h-shell",
      "+447399567445",
    );
    expect(toastShow).toHaveBeenCalledWith(
      "Linked +447399567445 to Clare Duncan — they can book from the portal now",
      "success",
    );
    expect(props.onOpenHuman).toHaveBeenCalledWith("h-clare");
    expect(result.current.pendingClaimLink).toBe(false);
  });

  it("stays on the shell and reports a refused link", async () => {
    const { result, props } = renderLink({
      onLinkPendingSignup: vi.fn(async () => ({
        ok: false,
        error: "link_pending_signup: h-clare already has a portal login",
      })),
    });
    await waitFor(() => expect(result.current.claimedHuman).not.toBeNull());
    act(() => result.current.openClaimLink());
    await act(async () => {
      await result.current.handleConfirmClaimLink();
    });
    expect(toastShow).toHaveBeenCalledWith(
      "link_pending_signup: h-clare already has a portal login",
      "error",
    );
    expect(props.onOpenHuman).not.toHaveBeenCalled();
    expect(result.current.pendingClaimLink).toBe(false);
  });

  it("closeClaimLink backs out without a write", async () => {
    const { result, props } = renderLink();
    await waitFor(() => expect(result.current.claimedHuman).not.toBeNull());
    act(() => result.current.openClaimLink());
    act(() => result.current.closeClaimLink());
    expect(result.current.pendingClaimLink).toBe(false);
    expect(props.onLinkPendingSignup).not.toHaveBeenCalled();
  });

  it("offers no claim link when the RPC is unwired, or when nothing is claimed", async () => {
    const unwired = renderLink({ onLinkPendingSignup: undefined });
    await waitFor(() => expect(unwired.result.current.claimedName).toBe("Clare Duncan"));
    expect(unwired.result.current.claimedHuman).toBeNull();

    const plain = renderLink({ human: { ...shell, claimsHumanId: null } });
    await waitFor(() => expect(plain.result.current.claimedHuman).toBeNull());
    expect(plain.result.current.claimedName).toBe("");
  });
});
