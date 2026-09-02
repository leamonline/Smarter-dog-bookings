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
import { useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export interface UseProfileRoutingOptions {
  selectedDogId: string | null;
  setSelectedDogId: (id: string | null) => void;
  selectedHumanId: string | null;
  setSelectedHumanId: (id: string | null) => void;
}

const DOG_PROFILE_PATH = /^\/dogs\/([^/]+)$/;
const HUMAN_PROFILE_PATH = /^\/humans\/([^/]+)$/;

export function useProfileRouting({
  selectedDogId,
  setSelectedDogId,
  selectedHumanId,
  setSelectedHumanId,
}: UseProfileRoutingOptions) {
  const location = useLocation();
  const navigate = useNavigate();

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

  const openDog = useCallback(
    (id: string | null | undefined) => {
      if (!id) return;
      if (location.pathname === "/today") {
        setSelectedDogId(id);
        return;
      }
      // Profile pages get a URL — call sites still pass through here so
      // direct navigation (e.g. /dogs/abc123 from a Slack share) and
      // in-app clicks land on the same modal.
      navigate(`/dogs/${id}`);
    },
    [location.pathname, navigate, setSelectedDogId],
  );
  const openHuman = useCallback(
    (id: string | null | undefined) => {
      if (!id) return;
      if (location.pathname === "/today") {
        setSelectedHumanId(id);
        return;
      }
      navigate(`/humans/${id}`);
    },
    [location.pathname, navigate, setSelectedHumanId],
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
