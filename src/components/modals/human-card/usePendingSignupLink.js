// Pending-signup linking for the Human card (Debt 7; extracted from
// HumanCardModal.jsx, where #774 introduced it).
//
// A phone save can be lost to humans_phone_unique. This hook works out who
// holds the number: an unapproved portal signup shell can be linked onto
// this record in one tap (the "existing customer signed up with a new
// number" case); anyone else is named so staff know where to look.
//
// handlePhoneTaken is useHumanDraft's `onPhoneTaken` hand-off. When the
// holder is a pending shell it returns a promise that stays open while the
// "Link this signup?" dialog is up; confirm resolves true (the draft's save
// finishes), cancel resolves false (the draft stays open, nothing typed is
// lost). The DB function link_pending_signup is the authority; this only
// asks, then re-runs the rest of the draft through onUpdateHuman.
import { useCallback, useState } from "react";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { titleCase } from "../../../utils/text";

export function usePendingSignupLink({
  human,
  humanId,
  humanFullName,
  findHumanByPhone,
  onLinkPendingSignup,
  onUpdateHuman,
}) {
  const toast = useToast();
  // { hit, phone, updates, resolve } while the "Link this signup?" prompt is
  // up; `resolve` hands the outcome back to useHumanDraft.saveHuman.
  const [pendingLink, setPendingLink] = useState(null);
  const [linking, setLinking] = useState(false);

  const handlePhoneTaken = useCallback(
    async (phone, updates) => {
      const hit = findHumanByPhone ? await findHumanByPhone(phone) : null;
      if (hit?.isPendingSignup && onLinkPendingSignup) {
        return new Promise((resolve) => {
          setPendingLink({ hit, phone, updates, resolve });
        });
      }
      const who = hit ? titleCase(`${hit.name || ""} ${hit.surname || ""}`.trim()) : "";
      toast.show(
        who
          ? `${phone} is already on ${who}'s record — open their profile to move it`
          : "That number is already on another customer's record",
        "error",
      );
      return false;
    },
    [findHumanByPhone, onLinkPendingSignup, toast],
  );

  const handleCancelLink = useCallback(() => {
    pendingLink?.resolve(false);
    setPendingLink(null);
  }, [pendingLink]);

  const handleConfirmLink = useCallback(async () => {
    if (!pendingLink || linking) return;
    const { hit, phone, updates, resolve } = pendingLink;
    const id = human.id || humanId;
    setLinking(true);
    try {
      const res = await onLinkPendingSignup(id, hit.id, phone);
      if (!res?.ok) {
        toast.show(res?.error || "Couldn't link that signup — give it another go", "error");
        resolve(false);
        return;
      }
      // The number is on this record now; re-run the save so the rest of
      // the draft (name, address, notes…) lands too.
      let restSaved = true;
      if (onUpdateHuman) {
        try {
          restSaved = (await onUpdateHuman(id, updates)) !== null;
        } catch {
          restSaved = false;
        }
      }
      toast.show(
        restSaved
          ? `Linked ${phone} to ${humanFullName} — they can book from the portal now`
          : `Linked ${phone} to ${humanFullName}, but the other edits didn't save — try again`,
        restSaved ? "success" : "error",
      );
      resolve(true);
    } finally {
      setLinking(false);
      setPendingLink(null);
    }
  }, [pendingLink, linking, human, humanId, onLinkPendingSignup, onUpdateHuman, humanFullName, toast]);

  return { pendingLink, linking, handlePhoneTaken, handleCancelLink, handleConfirmLink };
}
