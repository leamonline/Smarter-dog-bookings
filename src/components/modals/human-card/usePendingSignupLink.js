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
//
// The same hook owns the mirror-image case: when THIS record is the shell
// and the customer's typed name matched an existing customer, the signup
// stored that record as humans.claims_human_id. We resolve it so the header
// can offer "Link to <name>" instead of Approve — approving would keep a
// record still called "New member / Pending 07…". Confirming runs the same
// link_pending_signup, then opens the record that now carries the login.
import { useCallback, useEffect, useState } from "react";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { getHumanByIdOrName } from "../../../engine/bookingRules";
import { titleCase } from "../../../utils/text";

function nameOf(h) {
  return h ? titleCase(h.fullName || `${h.name || ""} ${h.surname || ""}`.trim()) : "";
}

export function usePendingSignupLink({
  human,
  humanId,
  humanFullName,
  humans,
  fetchHumanById,
  findHumanByPhone,
  onLinkPendingSignup,
  onUpdateHuman,
  onOpenHuman,
}) {
  const toast = useToast();
  // { hit, phone, updates, resolve } while the "Link this signup?" prompt is
  // up; `resolve` hands the outcome back to useHumanDraft.saveHuman.
  const [pendingLink, setPendingLink] = useState(null);
  const [linking, setLinking] = useState(false);
  const [claimedHuman, setClaimedHuman] = useState(null);
  const [pendingClaimLink, setPendingClaimLink] = useState(false);

  const handlePhoneTaken = useCallback(
    async (phone, updates) => {
      const hit = findHumanByPhone ? await findHumanByPhone(phone) : null;
      if (hit?.isPendingSignup && onLinkPendingSignup) {
        return new Promise((resolve) => {
          setPendingLink({ hit, phone, updates, resolve });
        });
      }
      const who = nameOf(hit);
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

  // ── The claim path: this record IS the shell ────────────────
  const claimsHumanId = human?.claimsHumanId || null;
  useEffect(() => {
    let cancelled = false;
    setClaimedHuman(null);
    if (!claimsHumanId) return () => {
      cancelled = true;
    };
    const cached = getHumanByIdOrName(humans, claimsHumanId);
    if (cached?.id) {
      setClaimedHuman(cached);
    } else if (fetchHumanById) {
      fetchHumanById(claimsHumanId)
        .then((entry) => {
          if (!cancelled && entry?.id) setClaimedHuman(entry);
        })
        .catch(() => {
          /* header falls back to the plain Approve / Reject pair */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [claimsHumanId, humans, fetchHumanById]);

  const claimedName = nameOf(claimedHuman);

  const handleConfirmClaimLink = useCallback(async () => {
    if (!claimedHuman?.id || !onLinkPendingSignup || linking) return;
    const shellId = human.id || humanId;
    setLinking(true);
    try {
      const res = await onLinkPendingSignup(claimedHuman.id, shellId, human.phone || "");
      if (!res?.ok) {
        toast.show(res?.error || "Couldn't link that signup — give it another go", "error");
        return;
      }
      toast.show(
        `Linked ${human.phone || "this signup"} to ${claimedName} — they can book from the portal now`,
        "success",
      );
      // The shell is gone; show the record that now carries the login.
      onOpenHuman?.(claimedHuman.id);
    } finally {
      setLinking(false);
      setPendingClaimLink(false);
    }
  }, [claimedHuman, onLinkPendingSignup, linking, human, humanId, claimedName, onOpenHuman, toast]);

  return {
    pendingLink,
    linking,
    handlePhoneTaken,
    handleCancelLink,
    handleConfirmLink,
    // Only offer the claim link when the parent wired the RPC.
    claimedHuman: onLinkPendingSignup ? claimedHuman : null,
    claimedName,
    pendingClaimLink,
    openClaimLink: useCallback(() => setPendingClaimLink(true), []),
    closeClaimLink: useCallback(() => setPendingClaimLink(false), []),
    handleConfirmClaimLink,
    // True while either prompt owns the keyboard (pauses the "E" shortcut).
    dialogOpen: !!pendingLink || pendingClaimLink,
  };
}
