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

  it("removes its listeners on unmount without traversing history", () => {
    // Leaving /inbox is a navigation the staff member just made. Popping our
    // sentinel here sent them straight back into the inbox, so on a phone with
    // a thread open no other nav item could be reached at all.
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
    expect(historyBack).not.toHaveBeenCalled();
  });

  it("keeps the conversation, its draft and the URL when the viewport crosses the breakpoint", () => {
    const mediaQuery = installMatchMedia(true);
    vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    const historyBack = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const onSelectConversation = vi.fn();
    const originalUrl = window.location.href;
    const { result } = renderHook(() => useInboxWorkspaceState({
      initialConversationId: null,
      initialDateStr: "2026-08-02",
      onSelectConversation,
    }));

    act(() => result.current.actions.selectConversation("a"));
    act(() => result.current.actions.setDraft("a", "Wednesday at 9 works — shall I hold it?"));

    // Phone to landscape (390 → 844 crosses 767), tablet to desktop, a
    // foldable opening: all the same crossing.
    act(() => mediaQuery.setMatches(false));
    act(() => mediaQuery.setMatches(true));

    expect(historyBack).not.toHaveBeenCalled();
    expect(window.location.href).toBe(originalUrl);
    expect(result.current.state.selectedId).toBe("a");
    expect(result.current.state.mobilePane).toBe("thread");
    expect(result.current.state.workByConversation.a.draft).toBe(
      "Wednesday at 9 works — shall I hold it?",
    );
    expect(onSelectConversation).not.toHaveBeenCalledWith(null);
  });

  it("adds no history of its own through a burst of crossings", () => {
    // A dragged window or an opening foldable fires these back to back. The
    // old teardown queued a history.back() on each crossing out and pushed a
    // fresh sentinel on each crossing back in, so a burst left an unpredictable
    // number of asynchronous pops in flight against a stack it had also been
    // rewriting — and each pop that landed answered by closing a pane. One
    // sentinel, no traversals, whatever the burst looks like.
    const mediaQuery = installMatchMedia(true);
    const pushState = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    const historyBack = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { result } = renderHook(() => useInboxWorkspaceState({
      initialConversationId: null,
      initialDateStr: "2026-08-02",
      onSelectConversation: vi.fn(),
    }));

    act(() => result.current.actions.selectConversation("a"));
    act(() => result.current.actions.openContext("booking"));
    expect(pushState).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 4; i += 1) {
      act(() => mediaQuery.setMatches(false));
      act(() => mediaQuery.setMatches(true));
    }

    expect(pushState).toHaveBeenCalledTimes(1);
    expect(historyBack).not.toHaveBeenCalled();
    expect(result.current.state.selectedId).toBe("a");
    expect(result.current.state.mobilePane).toBe("context");
  });

  it("still answers a deliberate Back with a pane step after a crossing", () => {
    const mediaQuery = installMatchMedia(true);
    vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    const onSelectConversation = vi.fn();
    const { result } = renderHook(() => useInboxWorkspaceState({
      initialConversationId: null,
      initialDateStr: "2026-08-02",
      onSelectConversation,
    }));

    act(() => result.current.actions.selectConversation("a"));
    act(() => mediaQuery.setMatches(false));
    act(() => mediaQuery.setMatches(true));
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));

    expect(result.current.state.mobilePane).toBe("list");
    expect(result.current.state.selectedId).toBeNull();
    expect(onSelectConversation).toHaveBeenLastCalledWith(null);
  });

  it("leaves a Back press the hook did not push to the router", () => {
    // No sentinel of ours on the stack means the press belongs to whatever
    // navigated here. Swallowing it would strand staff on /inbox.
    installMatchMedia(false);
    const onSelectConversation = vi.fn();
    const { result } = renderHook(() => useInboxWorkspaceState({
      initialConversationId: null,
      initialDateStr: "2026-08-02",
      onSelectConversation,
    }));

    act(() => result.current.actions.selectConversation("a"));
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));

    expect(result.current.state.selectedId).toBe("a");
    expect(result.current.state.mobilePane).toBe("thread");
    expect(onSelectConversation).not.toHaveBeenCalledWith(null);
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
