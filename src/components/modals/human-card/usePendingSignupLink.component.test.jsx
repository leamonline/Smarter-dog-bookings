// usePendingSignupLink — the Human card's two routes into
// link_pending_signup(): a phone save that collides with a portal signup
// shell, and a shell that claims to be an existing customer.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor, screen } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";
import { usePendingSignupLink } from "./usePendingSignupLink.js";

const wrapper = ({ children }) => <ToastProvider>{children}</ToastProvider>;

const clare = { id: "h-clare", name: "Clare", surname: "Duncan", fullName: "Clare Duncan", phone: "+447772860207" };
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
    human: clare,
    humanId: clare.id,
    humanFullName: "Clare Duncan",
    humans: {},
    fetchHumanById: vi.fn().mockResolvedValue(null),
    findHumanByPhone: vi.fn().mockResolvedValue(null),
    onLinkPendingSignup: vi.fn().mockResolvedValue({ ok: true }),
    onUpdateHuman: vi.fn().mockResolvedValue({ id: "h-clare" }),
    onOpenHuman: vi.fn(),
    ...overrides,
  };
  const hook = renderHook(() => usePendingSignupLink(props), { wrapper });
  return { ...hook, props };
}

beforeEach(() => vi.clearAllMocks());

describe("usePendingSignupLink — phone path", () => {
  it("prompts to link when the number belongs to a pending signup shell, then links and re-saves", async () => {
    const findHumanByPhone = vi.fn().mockResolvedValue({
      id: "h-shell", name: "New member", surname: "Pending", phone: "+447399567445", isPendingSignup: true,
    });
    const { result, props } = renderLink({ findHumanByPhone });

    let outcome;
    act(() => {
      outcome = result.current.handlePhoneTaken("+447399567445", { phone: "+447399567445", notes: "x" });
    });
    await waitFor(() => expect(result.current.pendingLink).not.toBeNull());
    expect(result.current.dialogOpen).toBe(true);

    await act(async () => {
      await result.current.handleConfirmLink();
    });
    expect(props.onLinkPendingSignup).toHaveBeenCalledWith("h-clare", "h-shell", "+447399567445");
    expect(props.onUpdateHuman).toHaveBeenCalledWith("h-clare", { phone: "+447399567445", notes: "x" });
    await expect(outcome).resolves.toBe(true);
    expect(result.current.pendingLink).toBeNull();
    expect(screen.getByText(/linked \+447399567445 to clare duncan/i)).toBeInTheDocument();
  });

  it("resolves false and keeps nothing pending when staff back out", async () => {
    const findHumanByPhone = vi.fn().mockResolvedValue({ id: "h-shell", isPendingSignup: true });
    const { result, props } = renderLink({ findHumanByPhone });

    let outcome;
    act(() => {
      outcome = result.current.handlePhoneTaken("+447399567445", {});
    });
    await waitFor(() => expect(result.current.pendingLink).not.toBeNull());
    act(() => result.current.handleCancelLink());

    await expect(outcome).resolves.toBe(false);
    expect(props.onLinkPendingSignup).not.toHaveBeenCalled();
    expect(result.current.dialogOpen).toBe(false);
  });

  it("names an established customer who holds the number instead of offering a link", async () => {
    const findHumanByPhone = vi.fn().mockResolvedValue({
      id: "h-dave", name: "dave", surname: "smith", isPendingSignup: false,
    });
    const { result, props } = renderLink({ findHumanByPhone });

    let outcome;
    await act(async () => {
      outcome = await result.current.handlePhoneTaken("+447399567445", {});
    });
    expect(outcome).toBe(false);
    expect(result.current.pendingLink).toBeNull();
    expect(props.onLinkPendingSignup).not.toHaveBeenCalled();
    expect(screen.getByText(/already on dave smith's record/i)).toBeInTheDocument();
  });

  it("surfaces the RPC refusal and resolves false", async () => {
    const findHumanByPhone = vi.fn().mockResolvedValue({ id: "h-shell", isPendingSignup: true });
    const onLinkPendingSignup = vi.fn().mockResolvedValue({ ok: false, error: "h-shell already has a portal login" });
    const { result, props } = renderLink({ findHumanByPhone, onLinkPendingSignup });

    let outcome;
    act(() => {
      outcome = result.current.handlePhoneTaken("+447399567445", {});
    });
    await waitFor(() => expect(result.current.pendingLink).not.toBeNull());
    await act(async () => {
      await result.current.handleConfirmLink();
    });
    await expect(outcome).resolves.toBe(false);
    expect(props.onUpdateHuman).not.toHaveBeenCalled();
    expect(screen.getByText(/already has a portal login/i)).toBeInTheDocument();
  });
});

describe("usePendingSignupLink — claim path", () => {
  it("resolves the claimed record from the cache and links the shell onto it", async () => {
    const { result, props } = renderLink({
      human: shell,
      humanId: shell.id,
      humanFullName: shell.fullName,
      humans: { "Clare Duncan": clare },
    });
    await waitFor(() => expect(result.current.claimedHuman?.id).toBe("h-clare"));
    expect(result.current.claimedName).toBe("Clare Duncan");
    expect(props.fetchHumanById).not.toHaveBeenCalled();

    act(() => result.current.openClaimLink());
    expect(result.current.pendingClaimLink).toBe(true);
    await act(async () => {
      await result.current.handleConfirmClaimLink();
    });
    expect(props.onLinkPendingSignup).toHaveBeenCalledWith("h-clare", "h-shell", "+447399567445");
    expect(props.onOpenHuman).toHaveBeenCalledWith("h-clare");
    expect(result.current.pendingClaimLink).toBe(false);
  });

  it("fetches the claimed record when it is past the paginated window", async () => {
    const fetchHumanById = vi.fn().mockResolvedValue(clare);
    const { result } = renderLink({ human: shell, humanId: shell.id, humans: {}, fetchHumanById });
    await waitFor(() => expect(result.current.claimedHuman?.id).toBe("h-clare"));
    expect(fetchHumanById).toHaveBeenCalledWith("h-clare");
  });

  it("offers no claim link at all when the parent has not wired the RPC", async () => {
    const { result } = renderLink({
      human: shell,
      humanId: shell.id,
      humans: { "Clare Duncan": clare },
      onLinkPendingSignup: undefined,
    });
    await waitFor(() => expect(result.current.claimedName).toBe("Clare Duncan"));
    expect(result.current.claimedHuman).toBeNull();
  });

  it("stays on the shell and reports the refusal when the link is rejected", async () => {
    const onLinkPendingSignup = vi.fn().mockResolvedValue({ ok: false, error: "h-clare already has a portal login" });
    const { result, props } = renderLink({
      human: shell,
      humanId: shell.id,
      humans: { "Clare Duncan": clare },
      onLinkPendingSignup,
    });
    await waitFor(() => expect(result.current.claimedHuman?.id).toBe("h-clare"));
    act(() => result.current.openClaimLink());
    await act(async () => {
      await result.current.handleConfirmClaimLink();
    });
    expect(props.onOpenHuman).not.toHaveBeenCalled();
    expect(screen.getByText(/already has a portal login/i)).toBeInTheDocument();
  });
});
