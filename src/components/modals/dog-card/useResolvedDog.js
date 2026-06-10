import { useState, useEffect, useMemo } from "react";
import { getDogByIdOrName } from "../../../engine/bookingRules";

/**
 * Resolves the dog behind the card: the pre-loaded page first, then an
 * on-demand fetch for deep-links to dogs beyond the pagination boundary.
 */
export function useResolvedDog(dogId, dogs, fetchDogById) {
  // Placeholder used while fetchDogById is in flight. `name: ""` instead
  // of the UUID so the header never briefly shows the raw id on a cold
  // deep-link.
  const placeholder = useMemo(() => ({
    id: dogId,
    name: "",
    breed: "",
    age: "",
    humanId: "",
    _humanId: null,
    alerts: [],
    groomNotes: "",
  }), [dogId]);

  const initialDog = getDogByIdOrName(dogs, dogId);
  const [resolvedDog, setResolvedDog] = useState(initialDog || placeholder);
  const [isLoadingDog, setIsLoadingDog] = useState(!initialDog);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const found = getDogByIdOrName(dogs, dogId);
    if (found) {
      setResolvedDog(found);
      setIsLoadingDog(false);
      setNotFound(false);
      return;
    }
    // Dog not in the pre-loaded page — fetch on demand
    if (!fetchDogById) {
      setIsLoadingDog(false);
      setNotFound(true);
      return;
    }
    setIsLoadingDog(true);
    fetchDogById(dogId).then((dog) => {
      if (dog) {
        setResolvedDog(dog);
        setNotFound(false);
      } else {
        setNotFound(true);
      }
      setIsLoadingDog(false);
    });
  }, [dogId, dogs, fetchDogById]);

  return { resolvedDog, isLoadingDog, notFound };
}
