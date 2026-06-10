// Focused tests for the Human card actions hook, extracted from
// HumanCardModal (Debt #7). Locks the unwired-callback stubs (now routed
// through the shared logger), overflow-menu assembly, and the signup
// approve/reject flows the anchor suite doesn't reach.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, screen } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

vi.mock("../../../lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
const { logger } = await import("../../../lib/logger");
const { useHumanCardActions } = await import("./useHumanCardActions.js");

const human = {
  id: "human-1",
  fullName: "Sarah Jones",
  phone: "07700 900111",
};

const wrapper = ({ children }) => <ToastProvider>{children}</ToastProvider>;

function renderActions(props = {}) {
  const onClose = vi.fn();
  const result = renderHook(
    () =>
      useHumanCardActions({
        human,
        humanId: "human-1",
        onClose,
        ...props,
      }),
    { wrapper },
  );
  return { ...result, onClose };
}

describe("useHumanCardActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handleOpenBooking calls the wired handler and skips the stub", () => {
    const onOpenBooking = vi.fn();
    const { result } = renderActions({ onOpenBooking });
    act(() => result.current.handleOpenBooking("booking-9"));
    expect(onOpenBooking).toHaveBeenCalledWith("booking-9");
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("handleOpenBooking falls back to a grep-able logger stub when unwired", () => {
    const { result } = renderActions();
    act(() => result.current.handleOpenBooking("booking-9"));
    expect(logger.warn).toHaveBeenCalledWith(
      "[HumanCardModal] TODO: onOpenBooking",
      {
        tags: { component: "HumanCardModal", op: "onOpenBooking" },
        extra: { bookingId: "booking-9" },
      },
    );
  });

  it("overflow menu only grows Merge/Archive entries when handlers are wired", () => {
    const { result: bare } = renderActions();
    expect(bare.current.overflowItems.map((i) => i.label)).toEqual([
      "New booking for this human",
      "Send message",
    ]);

    const { result: wired } = renderActions({
      onMergeHumans: vi.fn(),
      onArchiveHuman: vi.fn(),
    });
    expect(wired.current.overflowItems.map((i) => i.label)).toEqual([
      "New booking for this human",
      "Send message",
      "Merge duplicate",
      "Archive",
    ]);
  });

  it("an unwired overflow item logs the TODO stub with the human id", () => {
    const { result } = renderActions();
    act(() => {
      result.current.overflowItems
        .find((i) => i.label === "Send message")
        .onClick();
    });
    expect(logger.warn).toHaveBeenCalledWith(
      "[HumanCardModal] TODO: onSendMessage",
      {
        tags: { component: "HumanCardModal", op: "onSendMessage" },
        extra: { humanId: "human-1" },
      },
    );
  });

  it("approve success shows the success toast and clears the busy flag", async () => {
    const onApproveSignup = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderActions({ onApproveSignup });
    await act(async () => {
      await result.current.handleApproveSignup();
    });
    expect(onApproveSignup).toHaveBeenCalledWith("human-1");
    expect(result.current.signupBusy).toBe(false);
    expect(
      screen.getByText("Customer approved — they can book now"),
    ).toBeInTheDocument();
  });

  it("reject success closes the dialog flag and the modal", async () => {
    const onRejectSignup = vi.fn().mockResolvedValue({ ok: true });
    const { result, onClose } = renderActions({ onRejectSignup });
    act(() => result.current.setPendingReject(true));

    await act(async () => {
      await result.current.handleRejectSignup("Too far away");
    });
    expect(onRejectSignup).toHaveBeenCalledWith("human-1", "Too far away");
    expect(result.current.pendingReject).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it("reject failure surfaces the error and keeps the modal open", async () => {
    const onRejectSignup = vi
      .fn()
      .mockResolvedValue({ ok: false, error: "Row is locked" });
    const { result, onClose } = renderActions({ onRejectSignup });

    await act(async () => {
      await result.current.handleRejectSignup(null);
    });
    expect(screen.getByText("Row is locked")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
