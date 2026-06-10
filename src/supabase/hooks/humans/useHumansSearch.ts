// useHumansSearch — the debounced search-term state machine for the humans
// directory. Extracted from useHumans (Debt #5).
//
// searchQuery mirrors the input immediately so the box never feels laggy;
// effectiveSearch is the debounced term that actually drives the directory
// fetch (useHumansData re-runs its fetch effect when it changes).
// isSearching is true from the first keystroke until the fetch lands —
// useHumansData calls finishSearching() once the RPC resolves.
import { useState, useCallback, useRef } from "react";

export function useHumansSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [effectiveSearch, setEffectiveSearch] = useState("");

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update the search box immediately, but debounce the term that actually
  // drives the fetch so typing doesn't fire a request per keystroke.
  const searchHumans = useCallback((query: string) => {
    setSearchQuery(query);
    setIsSearching(true);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setEffectiveSearch(query.trim());
    }, 300);
  }, []);

  // Called by the directory fetch at the point the RPC settles (success or
  // error) — exactly where the monolithic hook called setIsSearching(false).
  const finishSearching = useCallback(() => {
    setIsSearching(false);
  }, []);

  return {
    searchQuery,
    isSearching,
    effectiveSearch,
    searchHumans,
    finishSearching,
  };
}
