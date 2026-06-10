import { useState, useEffect, useMemo } from "react";
import { getHumanByIdOrName } from "../../../engine/bookingRules";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { logger } from "../../../lib/logger";

/**
 * Trusted-humans state for the dog card: search (local map + debounced
 * server fallback), the new-human mini form, and the reciprocal
 * link/unlink handlers. Trusted links are stored on BOTH humans, so
 * every add/remove updates the owner and the contact.
 */
export function useTrustedHumans({
  owner,
  humans,
  onUpdateHuman,
  onAddHuman,
  findHumanByFullName,
  searchHumansByTerm,
}) {
  const toast = useToast();

  const [showTrustedSearch, setShowTrustedSearch] = useState(false);
  const [trustedSearchQuery, setTrustedSearchQuery] = useState("");
  const [showNewTrustedForm, setShowNewTrustedForm] = useState(false);
  const [newTrustedName, setNewTrustedName] = useState("");
  const [newTrustedSurname, setNewTrustedSurname] = useState("");
  const [newTrustedPhone, setNewTrustedPhone] = useState("");
  const [newTrustedRelationship, setNewTrustedRelationship] = useState("");
  const [trustedToRemove, setTrustedToRemove] = useState(null);

  const trustedContacts = useMemo(
    () => owner?.trustedContacts || [],
    [owner?.trustedContacts],
  );

  // Server-side fallback: humans past the paginated page boundary (50)
  // aren't in the local map, so a name/phone the user knows about may
  // not surface in the dropdown. We hit the DB whenever the query
  // changes, debounced, and let the helper fold matches into the local
  // humans state — the memo below then includes them naturally.
  useEffect(() => {
    const query = trustedSearchQuery.trim();
    if (!query || !searchHumansByTerm) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      if (cancelled) return;
      searchHumansByTerm(query).catch((err) => {
        logger.error("trusted-human server search failed", err, {
          tags: { component: "DogCardModal", op: "trusted-search" },
        });
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [trustedSearchQuery, searchHumansByTerm]);

  const trustedSearchResults = useMemo(() => {
    if (!trustedSearchQuery.trim()) return [];
    const query = trustedSearchQuery.toLowerCase().trim();
    const linkedIds = new Set(trustedContacts.map((c) => c.id).filter(Boolean));
    const linkedNames = new Set(trustedContacts.map((c) => c.fullName).filter(Boolean));
    return Object.values(humans)
      .filter((h) => {
        if (!h || h.id === owner?.id) return false;
        if (linkedIds.has(h.id) || linkedNames.has(h.fullName)) return false;
        const fullName = (h.fullName || `${h.name || ""} ${h.surname || ""}`).toLowerCase();
        const phone = (h.phone || "").toLowerCase();
        return fullName.includes(query) || phone.includes(query);
      })
      .slice(0, 5);
  }, [trustedSearchQuery, humans, owner?.id, trustedContacts]);

  const handleAddTrusted = async (selectedHumanId) => {
    if (!owner || !onUpdateHuman) return;
    const currentContacts = owner.trustedContacts || [];
    const ownerKey = owner.fullName || owner.id;

    await onUpdateHuman(ownerKey, {
      trustedContacts: [...currentContacts, { id: selectedHumanId, relationship: "" }],
    });

    const selectedHuman = getHumanByIdOrName(humans, selectedHumanId);
    if (selectedHuman) {
      const theirContacts = selectedHuman.trustedContacts || [];
      const myId = owner.id || ownerKey;
      if (!theirContacts.some((c) => c.id === myId || c.fullName === owner.fullName)) {
        const theirKey = selectedHuman.fullName || selectedHuman.id;
        await onUpdateHuman(theirKey, {
          trustedContacts: [...theirContacts, { id: myId, relationship: "" }],
        });
      }
    }

    setTrustedSearchQuery("");
    setShowTrustedSearch(false);
    toast.show("Trusted human added", "success");
  };

  const handleAddNewTrusted = async () => {
    if (!onAddHuman || !onUpdateHuman) return;
    if (!owner) {
      toast.show("Set an owner on this dog before adding a trusted human.", "error");
      return;
    }
    const name = newTrustedName.trim();
    const surname = newTrustedSurname.trim();
    const phone = newTrustedPhone.trim();
    const relationship = (newTrustedRelationship || "").trim();
    if (!name || !surname || !phone) return;

    const linkAsTrusted = async (trustedHuman, successMessage) => {
      const currentContacts = owner.trustedContacts || [];
      const ownerKey = owner.fullName || owner.id;
      await onUpdateHuman(ownerKey, {
        trustedContacts: [
          ...currentContacts,
          { id: trustedHuman.id, relationship },
        ],
      });

      const theirContacts = trustedHuman.trustedContacts || [];
      const ownerId = owner.id || ownerKey;
      if (!theirContacts.some((c) => c.id === ownerId || c.fullName === owner.fullName)) {
        const theirKey = trustedHuman.fullName || trustedHuman.id;
        await onUpdateHuman(theirKey, {
          trustedContacts: [
            ...theirContacts,
            { id: ownerId, relationship: "" },
          ],
        });
      }

      setNewTrustedName("");
      setNewTrustedSurname("");
      setNewTrustedPhone("");
      setNewTrustedRelationship("");
      setShowNewTrustedForm(false);
      setShowTrustedSearch(false);
      toast.show(successMessage, "success");
    };

    try {
      // Reuse an existing customer with this name rather than creating a
      // duplicate. The humans directory no longer enforces a unique
      // (name, surname), so onAddHuman would otherwise insert a second
      // record; and the existing row may be paginated out of the local
      // map, so the search above never offered it. A direct lookup links
      // the real person instead.
      const existing = findHumanByFullName
        ? await findHumanByFullName(name, surname)
        : null;
      if (existing) {
        await linkAsTrusted(
          existing,
          `Linked existing ${existing.fullName} as trusted human`,
        );
        return;
      }
      const newHuman = await onAddHuman({ name, surname, phone });
      if (!newHuman) return;
      await linkAsTrusted(newHuman, "Trusted human added");
    } catch (err) {
      logger.error("Failed to add trusted human", err, {
        tags: { component: "DogCardModal", op: "add-trusted" },
      });
      toast.show(err?.message || "Could not add trusted human.", "error");
    }
  };

  const handleUpdateTrustedRelationship = async (trustedIdOrName, relationship) => {
    if (!owner || !onUpdateHuman) return;
    const currentContacts = owner.trustedContacts || [];
    const nextContacts = currentContacts.map((c) =>
      c.id === trustedIdOrName || c.fullName === trustedIdOrName
        ? { ...c, relationship }
        : c,
    );
    const ownerKey = owner.fullName || owner.id;
    await onUpdateHuman(ownerKey, { trustedContacts: nextContacts });
  };

  const doRemoveTrusted = async (trustedIdToRemove) => {
    if (!owner || !onUpdateHuman) return;
    const currentContacts = owner.trustedContacts || [];
    const ownerKey = owner.fullName || owner.id;

    await onUpdateHuman(ownerKey, {
      trustedContacts: currentContacts.filter(
        (c) => c.id !== trustedIdToRemove && c.fullName !== trustedIdToRemove,
      ),
    });

    const removedHuman = getHumanByIdOrName(humans, trustedIdToRemove);
    if (removedHuman) {
      const theirContacts = removedHuman.trustedContacts || [];
      const myId = owner.id || ownerKey;
      if (theirContacts.some((c) => c.id === myId || c.fullName === owner.fullName)) {
        const theirKey = removedHuman.fullName || removedHuman.id;
        await onUpdateHuman(theirKey, {
          trustedContacts: theirContacts.filter(
            (c) => c.id !== myId && c.fullName !== owner.fullName,
          ),
        });
      }
    }
    toast.show("Trusted human removed", "success");
  };

  // Removal goes through a ConfirmDialog: handleRemoveTrusted stages the
  // id, confirm/cancel below resolve it.
  const handleRemoveTrusted = (trustedIdToRemove) => {
    setTrustedToRemove(trustedIdToRemove);
  };

  const confirmRemoveTrusted = async () => {
    const id = trustedToRemove;
    setTrustedToRemove(null);
    await doRemoveTrusted(id);
  };

  const cancelRemoveTrusted = () => setTrustedToRemove(null);

  return {
    trustedContacts,
    trustedSearchResults,
    showTrustedSearch,
    setShowTrustedSearch,
    trustedSearchQuery,
    setTrustedSearchQuery,
    showNewTrustedForm,
    setShowNewTrustedForm,
    newTrustedName,
    setNewTrustedName,
    newTrustedSurname,
    setNewTrustedSurname,
    newTrustedPhone,
    setNewTrustedPhone,
    newTrustedRelationship,
    setNewTrustedRelationship,
    handleAddTrusted,
    handleAddNewTrusted,
    handleUpdateTrustedRelationship,
    handleRemoveTrusted,
    trustedToRemove,
    confirmRemoveTrusted,
    cancelRemoveTrusted,
  };
}
