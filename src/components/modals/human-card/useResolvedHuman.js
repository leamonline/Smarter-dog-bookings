import { useState, useEffect, useMemo } from "react";
import { getHumanByIdOrName } from "../../../engine/bookingRules";

// Shape used while no human is resolved yet. Mirrors the shared-map entry
// fields so every panel can read them without guards. name / fullName stay
// empty (not the UUID) so the header never flashes the raw id on a cold
// deep-link.
export const EMPTY_HUMAN = {
  id: "",
  fullName: "",
  name: "",
  surname: "",
  phone: "",
  sms: false,
  whatsapp: false,
  email: "",
  fb: "",
  insta: "",
  tiktok: "",
  address: "",
  notes: "",
  trustedIds: [],
  trustedContacts: [],
  historyFlag: "",
};

/**
 * Resolves the human behind the card — the same job useResolvedDog does for
 * the dog card, and for the same reason.
 *
 * The shared `humans` map is paginated (PAGE_SIZE = 50 in useHumansData) AND
 * filled in asynchronously during boot, so a deep-link or refresh to a human
 * whose row sits past the first page simply isn't in the map when the modal
 * first renders. The old code read the human straight out of that map and
 * threw away fetchHumanById's return value, so the card sat on "Unnamed human
 * / No phone" for the whole window until the async fold happened to land — and
 * on a quiet boot (no further map churn to re-trigger the effect) it could stay
 * that way. Clicking from the directory worked only because that path had
 * already loaded the row into the map.
 *
 * Fix: prefer the live map entry (so edits flow straight through), otherwise
 * fetch on demand and keep the result in LOCAL state, immune to the shared-map
 * race. fetchHumanById still folds the row into the shared map as a side
 * effect, so other surfaces keep benefiting.
 */
export function useResolvedHuman(humanId, humans, fetchHumanById) {
  const placeholder = useMemo(
    () => ({ ...EMPTY_HUMAN, id: humanId }),
    [humanId],
  );

  const initial = getHumanByIdOrName(humans, humanId);
  const [resolvedHuman, setResolvedHuman] = useState(initial || placeholder);
  const [isLoadingHuman, setIsLoadingHuman] = useState(!initial);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const found = getHumanByIdOrName(humans, humanId);
    if (found) {
      setResolvedHuman(found);
      setIsLoadingHuman(false);
      setNotFound(false);
      return;
    }
    if (!humanId || !fetchHumanById) {
      setIsLoadingHuman(false);
      return;
    }
    // Not in the (paginated, still-loading) map. Drop any human left over
    // from a previous id so the card never shows the wrong person, then fetch
    // on demand and hold the result locally — a later map rebuild can't blank
    // it back out.
    setResolvedHuman((prev) => (prev?.id === humanId ? prev : placeholder));
    setIsLoadingHuman(true);
    let cancelled = false;
    Promise.resolve(fetchHumanById(humanId)).then((human) => {
      if (cancelled) return;
      if (human) {
        setResolvedHuman(human);
        setNotFound(false);
      } else {
        setNotFound(true);
      }
      setIsLoadingHuman(false);
    });
    return () => {
      cancelled = true;
    };
  }, [humanId, humans, fetchHumanById, placeholder]);

  return { resolvedHuman, isLoadingHuman, notFound };
}
