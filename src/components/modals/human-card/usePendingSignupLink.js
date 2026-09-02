// The two ways a portal self-signup shell gets joined onto an existing
// customer from the Human card — both end in link_pending_signup():
//
//  1. Phone path: staff put a number on THIS record and it collides with an
//     unapproved signup shell (humans_phone_unique). useHumanDraft hands the
//     collision to `handlePhoneTaken`; if the holder is a pending shell we
//     ask "Link this signup?", link, then re-run the save so the rest of the
//     draft lands. Anyone else holding the number is named instead.
//
//  2. Claim path: THIS record is the shell, and the customer typed a name
//     that matched an existing record (humans.claims_human_id, set by
//     submit_customer_signup). We resolve that record so the header can
//     offer "Link to <name>"; confirming links and then opens the record
//     that now carries the login (the shell is deleted server-side).
//
// Extracted from HumanCardModal so the orchestrator stays a layout shell
// (Debt 7 size ratchet).
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

  // ── Phone path ──────────────────────────────────────────────
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
  }, [pendingLink, linking, human.id, humanId, onLinkPendingSignup, onUpdateHuman, humanFullName, toast]);

  // ── Claim path ──────────────────────────────────────────────
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
  }, [claimedHuman, onLinkPendingSignup, linking, human.id, human.phone, humanId, claimedName, onOpenHuman, toast]);

  return {
    handlePhoneTaken,
    pendingLink,
    linking,
    handleCancelLink,
    handleConfirmLink,
    // Only offer the claim link when the parent wired the RPC.
    claimedHuman: onLinkPendingSignup ? claimedHuman : null,
    claimedName,
    pendingClaimLink,
    openClaimLink: useCallback(() => setPendingClaimLink(true), []),
    closeClaimLink: useCallback(() => setPendingClaimLink(false), []),
    handleConfirmClaimLink,
    dialogOpen: !!pendingLink || pendingClaimLink,
  };
}
