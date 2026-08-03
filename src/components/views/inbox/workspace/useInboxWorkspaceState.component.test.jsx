import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInboxWorkspaceState } from "./useInboxWorkspaceState.js";

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");

function installMatchMedia(matches) {
  let changeListener = null;
  const mediaQuery = {
    matches,
    media: "(max-width: 767px)",
    onchange: null,
    addEventListener: vi.fn((type, listener) => {
      if (type === "change") changeListener = listener;
    }),
    removeEventListener: vi.fn((type, listener) => {
      if (type === "change" && changeListener === listener) changeListener = null;
    }),
    setMatches(nextMatches) {
      this.matches = nextMatches;
      changeListener?.({ matches: nextMatches });
    },
  };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => mediaQuery),
  });
  return mediaQuery;
}

afterEach(() => {
  vi.restoreAllMocks();
  if (originalMatchMedia) {
    Object.defineProperty(window, "matchMedia", originalMatchMedia);
  } else {
    delete window.matchMedia;
  }
});

describe("useInboxWorkspaceState", () => {
  it("keeps drafts, dates and slots isolated by conversation", () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useInboxWorkspaceState({
      initialConversationId: "a",
      initialDateStr: "2026-08-02",
      onSelectConversation: vi.fn(),
    }));

    act(() => result.current.actions.setDraft("a", "Draft A"));
    act(() => result.current.actions.setDate("a", "2026-08-03"));
    act(() => result.current.actions.setSlots("a", [
      { dateStr: "2026-08-03", slot: "09:00" },
    ]));
    act(() => result.current.actions.selectConversation("b"));
    act(() => result.current.actions.setDraft("b", "Draft B"));

    expect(result.current.state.workByConversation.a).toEqual({
      draft: "Draft A",
      dateStr: "2026-08-03",
      slots: [{ dateStr: "2026-08-03", slot: "09:00" }],
    });
    expect(result.current.state.workByConversation.b).toEqual({
      draft: "Draft B",
      dateStr: "2026-08-02",
      slots: [],
    });
  });

  it("inserts selected slots without clearing them and supports draft clearing", () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useInboxWorkspaceState({
      initialConversationId: "a",
      initialDateStr: "2026-08-02",
      onSelectConversation: vi.fn(),
    }));

    act(() => result.current.actions.setDraft("a", "Hello Sarah"));
    act(() => result.current.actions.setSlots("a", [
      { dateStr: "2025-08-06", slot: "09:00" },
    ]));
    act(() => result.current.actions.insertSlots("a"));

    expect(result.current.state.workByConversation.a.draft).toBe(
      "Hello Sarah\n\nWeds 6 Aug — 9:00am",
    );
    expect(result.current.state.workByConversation.a.slots).toHaveLength(1);

    act(() => result.current.actions.clearDraft("a"));
    expect(result.current.state.workByConversation.a.draft).toBe("");
  });

  it("keeps booking-suggestion dismissal for the session by conversation", () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useInboxWorkspaceState({
      initialConversationId: "a",
      initialDateStr: "2026-08-02",
      onSelectConversation: vi.fn(),
    }));

    act(() => result.current.actions.dismissSuggestion("a"));
    expect(result.current.state.dismissedSuggestionIds).toEqual({ a: true });
  });

  it("maps mobile browser Back from context to thread to list with one live sentinel", () => {
    installMatchMedia(true);
    const pushState = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    const onSelectConversation = vi.fn();
    const originalUrl = window.location.href;
    const { result } = renderHook(() => useInboxWorkspaceState({
      initialConversationId: null,
      initialDateStr: "2026-08-02",
      onSelectConversation,
    }));

    act(() => result.current.actions.selectConversation("a"));
    expect(pushState).toHaveBeenCalledTimes(1);
    act(() => result.current.actions.openContext("booking"));
    expect(pushState).toHaveBeenCalledTimes(1);

    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(result.current.state.mobilePane).toBe("thread");
    expect(result.current.state.contextOpen).toBe(false);
    expect(pushState).toHaveBeenCalledTimes(2);

    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(result.current.state.mobilePane).toBe("list");
    expect(result.current.state.selectedId).toBeNull();
    expect(onSelectConversation).toHaveBeenLastCalledWith(null);
    expect(window.location.href).toBe(originalUrl);
    for (const call of pushState.mock.calls) {
      expect(call[2]).toBe(originalUrl);
    }
  });

  it("removes mobile listeners and a live sentinel on unmount", () => {
    const mediaQuery = installMatchMedia(true);
    vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    const historyBack = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const removeWindowListener = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useInboxWorkspaceState({
      initialConversationId: "a",
      initialDateStr: "2026-08-02",
      onSelectConversation: vi.fn(),
    }));

    unmount();

    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(removeWindowListener).toHaveBeenCalledWith("popstate", expect.any(Function));
    expect(historyBack).toHaveBeenCalledTimes(1);
  });

  it("syncs an externally selected conversation without calling the selection callback", () => {
    installMatchMedia(false);
    const onSelectConversation = vi.fn();
    const { result } = renderHook(() => useInboxWorkspaceState({
      initialConversationId: null,
      initialDateStr: "2026-08-02",
      onSelectConversation,
    }));

    act(() => result.current.actions.syncSelectedConversation("external"));
    expect(result.current.state.selectedId).toBe("external");
    expect(result.current.state.mobilePane).toBe("thread");
    expect(onSelectConversation).not.toHaveBeenCalled();
  });
});
