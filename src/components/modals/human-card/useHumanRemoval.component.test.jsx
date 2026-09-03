// useHumanRemoval — the delete / archive confirm step of the Human card
// (Debt 7; pure move out of HumanCardModal). The anchor suite already
// proves Archive asks before calling onArchiveHuman; this locks the
// post-confirm outcomes (toast + close vs. error) and the id each path
// hands to its parent handler.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ToastProvider } from "../../../contexts/ToastContext.jsx";

const toastShow = vi.hoisted(() => vi.fn());
vi.mock("../../../contexts/ToastContext.jsx", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useToast: () => ({ show: toastShow }) };
});

const { useHumanRemoval } = await import("./useHumanRemoval.js");

const wrapper = ({ children }) => <ToastProvider>{children}</ToastProvider>;

function renderRemoval(overrides = {}) {
  const props = {
    human: { id: "h1", fullName: "Sarah Jones" },
    humanId: "h1",
    onClose: vi.fn(),
    onDeleteHuman: vi.fn(async () => ({ ok: true })),
    onArchiveHuman: vi.fn(async () => ({ id: "h1", archivedAt: "2026-09-03" })),
    setPendingArchive: vi.fn(),
    ...overrides,
  };
  const hook = renderHook(() => useHumanRemoval(props), { wrapper });
  return { ...hook, props };
}

describe("useHumanRemoval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("delete", () => {
    it("only offers Delete when the parent wired onDeleteHuman", () => {
      expect(renderRemoval().result.current.requestDelete).toBeTypeOf("function");
      expect(renderRemoval({ onDeleteHuman: undefined }).result.current.requestDelete).toBeUndefined();
    });

    it("requestDelete opens the confirm and cancelDelete drops it without calling the parent", () => {
      const { result, props } = renderRemoval();
      expect(result.current.pendingDelete).toBe(false);
      act(() => result.current.requestDelete());
      expect(result.current.pendingDelete).toBe(true);
      act(() => result.current.cancelDelete());
      expect(result.current.pendingDelete).toBe(false);
      expect(props.onDeleteHuman).not.toHaveBeenCalled();
    });

    it("confirmDelete deletes by the route humanId, toasts, and closes the card", async () => {
      const { result, props } = renderRemoval({
        human: { id: "resolved-id" },
        humanId: "route-id",
      });
      act(() => result.current.requestDelete());
      await act(async () => {
        await result.current.confirmDelete();
      });
      expect(props.onDeleteHuman).toHaveBeenCalledWith("route-id");
      expect(result.current.pendingDelete).toBe(false);
      expect(toastShow).toHaveBeenCalledWith("Deleted", "success");
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it("surfaces the parent's error and keeps the card open", async () => {
      const { result, props } = renderRemoval({
        onDeleteHuman: vi.fn(async () => ({ error: "Still has bookings" })),
      });
      act(() => result.current.requestDelete());
      await act(async () => {
        await result.current.confirmDelete();
      });
      expect(result.current.pendingDelete).toBe(false);
      expect(toastShow).toHaveBeenCalledWith("Still has bookings", "error");
      expect(props.onClose).not.toHaveBeenCalled();
    });

    it("stays silent on a result with neither ok nor error", async () => {
      const { result, props } = renderRemoval({ onDeleteHuman: vi.fn(async () => undefined) });
      await act(async () => {
        await result.current.confirmDelete();
      });
      expect(toastShow).not.toHaveBeenCalled();
      expect(props.onClose).not.toHaveBeenCalled();
    });
  });

  describe("archive", () => {
    it("confirmArchive prefers the resolved record's id, toasts, closes, and clears the flag", async () => {
      const { result, props } = renderRemoval({
        human: { id: "resolved-id" },
        humanId: "route-id",
      });
      await act(async () => {
        await result.current.confirmArchive();
      });
      expect(props.onArchiveHuman).toHaveBeenCalledWith("resolved-id");
      expect(props.setPendingArchive).toHaveBeenCalledWith(false);
      expect(toastShow).toHaveBeenCalledWith("Archived", "success");
      expect(props.onClose).toHaveBeenCalledTimes(1);
    });

    it("falls back to the route humanId when the human has not resolved yet", async () => {
      const { result, props } = renderRemoval({ human: {}, humanId: "route-id" });
      await act(async () => {
        await result.current.confirmArchive();
      });
      expect(props.onArchiveHuman).toHaveBeenCalledWith("route-id");
    });

    it("a null result toasts the retry message and keeps the card open", async () => {
      const { result, props } = renderRemoval({ onArchiveHuman: vi.fn(async () => null) });
      await act(async () => {
        await result.current.confirmArchive();
      });
      expect(props.setPendingArchive).toHaveBeenCalledWith(false);
      expect(toastShow).toHaveBeenCalledWith(
        "Couldn't archive that one — give it another go",
        "error",
      );
      expect(props.onClose).not.toHaveBeenCalled();
    });

    it("cancelArchive clears the flag without calling the parent", () => {
      const { result, props } = renderRemoval();
      act(() => result.current.cancelArchive());
      expect(props.setPendingArchive).toHaveBeenCalledWith(false);
      expect(props.onArchiveHuman).not.toHaveBeenCalled();
    });
  });
});
