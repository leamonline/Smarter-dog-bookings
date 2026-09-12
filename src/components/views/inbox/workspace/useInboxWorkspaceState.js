import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { appendSlotOffer } from "./inboxWorkspaceModel.js";

// Below this width the three panes stack, so opening a conversation or the
// context sheet is a "screen" the hardware Back button should step out of.
const MOBILE_QUERY = "(max-width: 767px)";
// Marks the one extra history entry this hook pushes so a Back press can be
// answered with a pane step instead of leaving /inbox. It carries the current
// URL and the router's own state, so consuming it is a no-op for the router.
const HISTORY_SENTINEL = "__inboxWorkspacePane";

const initialState = ({ initialConversationId, initialDateStr }) => ({
  selectedId: initialConversationId ?? null,
  mobilePane: initialConversationId ? "thread" : "list",
  contextSection: "customer",
  contextOpen: false,
  workByConversation: {},
  dismissedSuggestionIds: {},
  initialDateStr,
});

function workFor(state, conversationId) {
  return state.workByConversation[conversationId] ?? {
    draft: "",
    dateStr: state.initialDateStr,
    slots: [],
  };
}

function updateWork(state, conversationId, update) {
  if (!conversationId) return state;
  const current = workFor(state, conversationId);
  return {
    ...state,
    workByConversation: {
      ...state.workByConversation,
      [conversationId]: update(current),
    },
  };
}

function reducer(state, action) {
  switch (action.type) {
    case "select-conversation":
    case "sync-selected-conversation":
      return {
        ...state,
        selectedId: action.conversationId ?? null,
        mobilePane: action.conversationId ? "thread" : "list",
        contextOpen: false,
      };
    case "open-context":
      return {
        ...state,
        contextSection: action.section,
        contextOpen: true,
        mobilePane: "context",
      };
    case "close-context":
      return {
        ...state,
        contextOpen: false,
        mobilePane: state.selectedId ? "thread" : "list",
      };
    case "pane-back":
      if (state.mobilePane === "context") {
        return {
          ...state,
          contextOpen: false,
          mobilePane: state.selectedId ? "thread" : "list",
        };
      }
      if (state.mobilePane === "thread") {
        return {
          ...state,
          selectedId: null,
          contextOpen: false,
          mobilePane: "list",
        };
      }
      return state;
    case "set-draft":
      return updateWork(state, action.conversationId, (work) => ({
        ...work,
        draft: action.draft,
      }));
    case "set-date":
      return updateWork(state, action.conversationId, (work) => ({
        ...work,
        dateStr: action.dateStr,
      }));
    case "set-slots":
      return updateWork(state, action.conversationId, (work) => ({
        ...work,
        slots: [...action.slots],
      }));
    case "clear-draft":
      return updateWork(state, action.conversationId, (work) => ({
        ...work,
        draft: "",
      }));
    case "insert-slots":
      return updateWork(state, action.conversationId, (work) => ({
        ...work,
        draft: appendSlotOffer(work.draft, work.slots),
      }));
    case "dismiss-suggestion":
      if (!action.conversationId) return state;
      return {
        ...state,
        dismissedSuggestionIds: {
          ...state.dismissedSuggestionIds,
          [action.conversationId]: true,
        },
      };
    default:
      return state;
  }
}

function mobileDepth(state) {
  if (state.mobilePane === "context") return 2;
  if (state.mobilePane === "thread") return 1;
  return 0;
}

function isMobileViewport() {
  return typeof window !== "undefined" && window.matchMedia?.(MOBILE_QUERY).matches === true;
}

export function useInboxWorkspaceState({
  initialConversationId,
  initialDateStr,
  onSelectConversation,
}) {
  const [state, dispatch] = useReducer(
    reducer,
    { initialConversationId, initialDateStr },
    initialState,
  );
  const [isMobile, setIsMobile] = useState(isMobileViewport);
  const stateRef = useRef(state);
  const onSelectConversationRef = useRef(onSelectConversation);
  const liveSentinelRef = useRef(false);

  stateRef.current = state;
  onSelectConversationRef.current = onSelectConversation;

  const installSentinel = useCallback(() => {
    if (liveSentinelRef.current || typeof window === "undefined") return;
    window.history.pushState(
      { ...window.history.state, [HISTORY_SENTINEL]: true },
      "",
      window.location.href,
    );
    liveSentinelRef.current = true;
  }, []);

  // Pop the entry we pushed, leaving the flag for the popstate handler to
  // clear — it owns the resulting pane step. Only ever called for a
  // deliberate in-app Back: nothing that merely re-measures the layout may
  // move the browser through history (see the popstate effect below).
  const consumeSentinel = useCallback(() => {
    if (!liveSentinelRef.current || typeof window === "undefined") return false;
    window.history.back();
    return true;
  }, []);

  const moveBackOnePane = useCallback((currentState) => {
    if (currentState.mobilePane === "list") return;
    if (currentState.mobilePane === "thread") {
      onSelectConversationRef.current?.(null);
    }
    dispatch({ type: "pane-back" });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const handleChange = (event) => setIsMobile(event.matches);
    mediaQuery.addEventListener("change", handleChange);
    setIsMobile(mediaQuery.matches);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Registered for the life of the hook rather than for the life of the mobile
  // breakpoint, and it acts only on the entry we pushed. Two reasons, both
  // about continuity:
  //
  //   - Tearing the listener down when the viewport crosses 767px used to pop
  //     the sentinel from the cleanup. `history.back()` is asynchronous, so a
  //     burst of crossings (a foldable opening, a dragged desktop window, an
  //     iPhone rotating from 390 to 844) could land that pop after the next
  //     crossing had re-registered the listener and pushed a fresh sentinel —
  //     closing the conversation mid-reply, with nothing the user did to
  //     explain it.
  //   - The same cleanup ran on unmount, so tapping another nav item on a
  //     phone with a thread open bounced staff straight back into the inbox.
  //     That one did lose the reply: the drafts live in this hook, and going
  //     back into /inbox remounted it.
  //
  // Keeping one listener and never traversing history on our own account
  // leaves the conversation, its draft and the URL exactly as they were; a
  // deliberate Back press still steps one pane, at any width.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handlePopState = () => {
      // Not our entry: let the router answer the Back press.
      if (!liveSentinelRef.current) return;
      liveSentinelRef.current = false;
      const currentState = stateRef.current;
      const depth = mobileDepth(currentState);
      if (depth === 0) return;
      moveBackOnePane(currentState);
      if (depth > 1) installSentinel();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [installSentinel, moveBackOnePane]);

  // Only the stacked layout gets an entry: at md+ the list and thread are
  // side by side, so picking a conversation is not a screen change and must
  // not push history. Crossing into the stacked layout with a pane already
  // open installs one, and crossing out simply leaves it — a Back press then
  // steps the pane it was pushed for, which is what it still means.
  useEffect(() => {
    if (isMobile && mobileDepth(state) > 0) installSentinel();
  }, [installSentinel, isMobile, state]);

  const actions = useMemo(() => ({
    selectConversation(conversationId) {
      if (!conversationId) consumeSentinel();
      dispatch({ type: "select-conversation", conversationId });
      onSelectConversationRef.current?.(conversationId ?? null);
    },
    openContext(section) {
      dispatch({ type: "open-context", section });
    },
    closeContext() {
      dispatch({ type: "close-context" });
    },
    paneBack() {
      // Route an in-app Back through the browser when we own an entry, so the
      // pane step and the history entry stay in lockstep whatever the width.
      if (consumeSentinel()) return;
      moveBackOnePane(stateRef.current);
    },
    setDraft(conversationId, draft) {
      dispatch({ type: "set-draft", conversationId, draft });
    },
    setDate(conversationId, dateStr) {
      dispatch({ type: "set-date", conversationId, dateStr });
    },
    setSlots(conversationId, slots) {
      dispatch({ type: "set-slots", conversationId, slots });
    },
    clearDraft(conversationId) {
      dispatch({ type: "clear-draft", conversationId });
    },
    insertSlots(conversationId) {
      dispatch({ type: "insert-slots", conversationId });
    },
    dismissSuggestion(conversationId) {
      dispatch({ type: "dismiss-suggestion", conversationId });
    },
    syncSelectedConversation(conversationId) {
      if (!conversationId) consumeSentinel();
      dispatch({ type: "sync-selected-conversation", conversationId });
    },
  }), [consumeSentinel, moveBackOnePane]);

  return { state, actions };
}
