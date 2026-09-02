// Incoming trust for the Human card: which owners have named THIS person as a
// trusted contact (so the Dogs panel can show dogs they may drop off /
// collect), and the "link me as trusted on that dog" action that adds one.
//
// Trust is one-way in the database: { human_id: owner, trusted_id: person }.
// The incoming owner ids are loaded separately from human.trustedContacts,
// which is the OUTGOING set ("people this human trusts"). Keeping the two
// directions distinct avoids inventing a reciprocal trust row.
//
// Extracted from HumanCardModal so the orchestrator stays a layout shell
// (Debt 7 size ratchet). Behaviour is unchanged.
import { useCallback, useEffect, useState } from "react";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { getHumanByIdOrName } from "../../../engine/bookingRules";
import {
  fetchTrustedContactsForHuman,
  fetchTrustedOwnerIdsForHuman,
} from "../../../supabase/hooks/humans/useTrustedContacts";

export function useTrustedOwnerLinks({
  human,
  humanId,
  humanFullName,
  humans,
  ensureDogsForHumans,
  onUpdateHuman,
}) {
  const toast = useToast();
  const [trustedOwnerIds, setTrustedOwnerIds] = useState([]);
  const trustedHumanId = human.id || humanId;

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
