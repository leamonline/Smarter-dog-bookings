import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { appendSlotOffer } from "./inboxWorkspaceModel.js";

const MOBILE_QUERY = "(max-width: 767px)";
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
  const isMobileRef = useRef(isMobile);
  const onSelectConversationRef = useRef(onSelectConversation);
  const liveSentinelRef = useRef(false);

  stateRef.current = state;
  isMobileRef.current = isMobile;
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

  const removeLiveSentinel = useCallback(() => {
    if (!liveSentinelRef.current || typeof window === "undefined") return;
    liveSentinelRef.current = false;
    window.history.back();
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

  useEffect(() => {
    if (!isMobile || typeof window === "undefined") return undefined;
    const handlePopState = () => {
      const currentState = stateRef.current;
      const depth = mobileDepth(currentState);
      if (depth === 0) return;
      liveSentinelRef.current = false;
      moveBackOnePane(currentState);
      if (depth > 1) installSentinel();
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      removeLiveSentinel();
    };
  }, [installSentinel, isMobile, moveBackOnePane, removeLiveSentinel]);

  useEffect(() => {
    if (isMobile && mobileDepth(state) > 0) installSentinel();
  }, [installSentinel, isMobile, state]);

  const actions = useMemo(() => ({
    selectConversation(conversationId) {
      if (!conversationId && isMobileRef.current) removeLiveSentinel();
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
      if (isMobileRef.current && liveSentinelRef.current) {
        window.history.back();
        return;
      }
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
      if (!conversationId && isMobileRef.current) removeLiveSentinel();
      dispatch({ type: "sync-selected-conversation", conversationId });
    },
  }), [moveBackOnePane, removeLiveSentinel]);

  return { state, actions };
}
