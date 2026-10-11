/**
 * useProfileRouting — profile-page routing for the staff app, extracted from
 * App.jsx (Debt 11; originally task 4 of the May 2026 review).
 *
 * /dogs/:id and /humans/:id are shareable URLs that open the dog or human
 * profile modal. The route is the source of truth; the modal state mirrors
 * it for backward compat with non-URL callers (the inbox customer context,
 * the booking detail modal, etc.). On /today the modals open in place
 * without a URL change so the live board keeps its position.
 */
import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export interface UseProfileRoutingOptions {
  selectedDogId: string | null;
  setSelectedDogId: (id: string | null) => void;
  selectedHumanId: string | null;
  setSelectedHumanId: (id: string | null) => void;
}

const DOG_PROFILE_PATH = /^\/dogs\/([^/]+)$/;
const HUMAN_PROFILE_PATH = /^\/humans\/([^/]+)$/;

type ProfileKind = "dog" | "human";

interface PendingFocusReturn {
  element: HTMLElement;
  id: string;
  kind: ProfileKind;
}

function findProfileTrigger({ element, id, kind }: PendingFocusReturn) {
  if (element.isConnected) return element;
  const attribute = kind === "dog" ? "data-profile-dog-id" : "data-profile-human-id";
  return Array.from(document.querySelectorAll<HTMLElement>(`[${attribute}]`)).find(
    (candidate) => candidate.getAttribute(attribute) === id,
  ) ?? null;
}

export function useProfileRouting({
  selectedDogId,
  setSelectedDogId,
  selectedHumanId,
  setSelectedHumanId,
}: UseProfileRoutingOptions) {
  const location = useLocation();
  const navigate = useNavigate();
  const pendingFocusReturnRef = useRef<PendingFocusReturn | null>(null);

  const rememberFocusReturn = useCallback((kind: ProfileKind, id: string) => {
    const element = document.activeElement;
    if (!(element instanceof HTMLElement) || element === document.body) return;
    pendingFocusReturnRef.current = { element, id, kind };
  }, []);

  // URL → modal state.
  useEffect(() => {
    const dogMatch = location.pathname.match(DOG_PROFILE_PATH);
    const humanMatch = location.pathname.match(HUMAN_PROFILE_PATH);
    if (dogMatch && selectedDogId !== dogMatch[1]) {
      setSelectedDogId(dogMatch[1]);
    } else if (!dogMatch && location.pathname.startsWith("/dogs") && selectedDogId) {
      // /dogs (index) — close any modal that was opened from a profile URL
      setSelectedDogId(null);
    }
    if (humanMatch && selectedHumanId !== humanMatch[1]) {
      setSelectedHumanId(humanMatch[1]);
    } else if (!humanMatch && location.pathname.startsWith("/humans") && selectedHumanId) {
      setSelectedHumanId(null);
    }
  }, [
    location.pathname,
    selectedDogId,
    selectedHumanId,
    setSelectedDogId,
    setSelectedHumanId,
  ]);

  // Profile URLs replace the directory route, so the trigger React Aria
  // remembers may no longer exist when the modal closes. Once the directory
  // has remounted, return focus to the matching semantic trigger. Two frames
  // place this after both the route commit and FocusScope's own cleanup.
  useEffect(() => {
    const pending = pendingFocusReturnRef.current;
    if (!pending || location.pathname !== `/${pending.kind}s`) return undefined;
    pendingFocusReturnRef.current = null;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        findProfileTrigger(pending)?.focus({ preventScroll: true });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [location.pathname]);

  const openDog = useCallback(
    (id: string | null | undefined) => {
      if (!id) return;
      if (location.pathname === "/today") {
        setSelectedDogId(id);
        return;
      }
      rememberFocusReturn("dog", id);
      // Profile pages get a URL — call sites still pass through here so
      // direct navigation (e.g. /dogs/abc123 from a Slack share) and
      // in-app clicks land on the same modal.
      navigate(`/dogs/${id}`);
    },
    [location.pathname, navigate, rememberFocusReturn, setSelectedDogId],
  );
  const openHuman = useCallback(
    (id: string | null | undefined) => {
      if (!id) return;
      if (location.pathname === "/today") {
        setSelectedHumanId(id);
        return;
      }
      rememberFocusReturn("human", id);
      navigate(`/humans/${id}`);
    },
    [location.pathname, navigate, rememberFocusReturn, setSelectedHumanId],
  );
  const closeDogProfile = useCallback(() => {
    setSelectedDogId(null);
    if (DOG_PROFILE_PATH.test(location.pathname)) navigate("/dogs");
  }, [navigate, location.pathname, setSelectedDogId]);
  const closeHumanProfile = useCallback(() => {
    setSelectedHumanId(null);
    if (HUMAN_PROFILE_PATH.test(location.pathname)) navigate("/humans");
  }, [navigate, location.pathname, setSelectedHumanId]);

  return { openDog, openHuman, closeDogProfile, closeHumanProfile };
}
