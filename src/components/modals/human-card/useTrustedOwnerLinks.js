// Trusted-owner links for the Human card (Debt 7; extracted from
// HumanCardModal.jsx).
//
// Trust is one-way in the database: { human_id: owner, trusted_id: person }.
// This hook owns the INCOMING direction — the owners who trust this human —
// which is what lets the Dogs panel show dogs this person may drop off or
// collect. It is kept separate from human.trustedContacts (the outgoing set,
// "people this human trusts") so neither direction invents a reciprocal row.
//
// It also owns "link this human as a trusted contact on an existing dog",
// which updates the DOG'S OWNER only, through the same onUpdateHuman path
// the rest of the card uses. Nothing here talks to the database directly
// except the two read helpers from useTrustedContacts.
import { useCallback, useEffect, useState } from "react";
import { getHumanByIdOrName } from "../../../engine/bookingRules";
import { useToast } from "../../../contexts/ToastContext.jsx";
import {
  fetchTrustedContactsForHuman,
  fetchTrustedOwnerIdsForHuman,
} from "../../../supabase/hooks/humans/useTrustedContacts";

export function useTrustedOwnerLinks({
  human,
  humanId,
  humans,
  humanFullName,
  onUpdateHuman,
  ensureDogsForHumans,
}) {
  const toast = useToast();

  // Load the incoming owner ids for the resolved human (falls back to the
  // route id while the record is still hydrating).
  const [trustedOwnerIds, setTrustedOwnerIds] = useState([]);
  const trustedHumanId = human?.id || humanId;
  useEffect(() => {
    let cancelled = false;
    setTrustedOwnerIds([]);
    if (!trustedHumanId) return () => {
      cancelled = true;
    };

    fetchTrustedOwnerIdsForHuman(trustedHumanId)
      .then((ownerIds) => {
        if (!cancelled) setTrustedOwnerIds(ownerIds);
      })
      .catch(() => {
        if (!cancelled) setTrustedOwnerIds([]);
      });

    return () => {
      cancelled = true;
    };
  }, [trustedHumanId]);

  // Owner ids are joined into a primitive dependency so this effect does not
  // re-run on equivalent array identities. ensureDogsForHumans already
  // deduplicates ids that are cached or in flight.
  const trustedOwnerIdsKey = trustedOwnerIds.join(",");
  useEffect(() => {
    if (!ensureDogsForHumans || !trustedOwnerIdsKey) return;
    ensureDogsForHumans(trustedOwnerIdsKey.split(","));
  }, [ensureDogsForHumans, trustedOwnerIdsKey]);

  // Hydrate a person's current trusted links from the DB before a replace, so
  // we never overwrite their set with a stale/empty in-memory copy (the
  // replace_trusted_contacts RPC rewrites the whole set).
  const loadTrusted = useCallback(async (h) => {
    const inMemory = h?.trustedContacts || [];
    if (!h?.id) return inMemory;
    try {
      const { trustedContacts } = await fetchTrustedContactsForHuman(h.id);
      return trustedContacts.length ? trustedContacts : inMemory;
    } catch {
      return inMemory;
    }
  }, []);

  // Link THIS human as a trusted contact on an existing dog by updating the
  // dog's owner only. Trust is directional; adding a reverse row would mean
  // the trusted person also chose the owner as their own trusted human.
  const handleLinkTrustedOnDog = useCallback(
    async (dog) => {
      if (!onUpdateHuman || !human?.id) return;
      const owner = getHumanByIdOrName(humans, dog._humanId || dog.humanId);
      if (!owner?.id) {
        toast.show("Hmm, we can't find who owns that dog — try again?", "error");
        return;
      }
      if (owner.id === human.id) {
        toast.show("They already own that dog.", "error");
        return;
      }
      const ownerContacts = await loadTrusted(owner);
      if (ownerContacts.some((c) => c.id === human.id || c.fullName === humanFullName)) {
        setTrustedOwnerIds((current) =>
          current.includes(owner.id) ? current : [...current, owner.id],
        );
        toast.show(`${humanFullName} is already linked to ${dog.name}.`, "success");
        return;
      }
      const ownerKey = owner.fullName || owner.id;
      const saved = await onUpdateHuman(ownerKey, {
        trustedContacts: [...ownerContacts, { id: human.id, relationship: "" }],
      });
      if (!saved) {
        toast.show("Couldn't link that person to the dog — let's try again.", "error");
        return;
      }
      setTrustedOwnerIds((current) =>
        current.includes(owner.id) ? current : [...current, owner.id],
      );
      toast.show(`Linked ${humanFullName} to ${dog.name}`, "success");
    },
    [onUpdateHuman, human, humans, humanFullName, toast, loadTrusted],
  );

  return { trustedOwnerIds, handleLinkTrustedOnDog };
}
