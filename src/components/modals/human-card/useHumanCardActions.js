// Card-level actions for the Human card: copy phone, open booking,
// the overflow menu, and "Join the Pack" signup approval. Optional
// callbacks the parent hasn't wired yet fall back to a logger.warn stub
// so unwired handlers stay grep-able ("TODO:").
import { useCallback, useMemo, useState } from "react";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { logger } from "../../../lib/logger";

export function useHumanCardActions({
  human,
  humanId,
  onClose,
  onOpenBooking,
  onNewBookingForHuman,
  onSendMessage,
  onMergeHumans,
  onArchiveHuman,
  onApproveSignup,
  onRejectSignup,
}) {
  const toast = useToast();
  const [showMerge, setShowMerge] = useState(false);
  const [pendingArchive, setPendingArchive] = useState(false);
  const [pendingReject, setPendingReject] = useState(false);
  const [signupBusy, setSignupBusy] = useState(false);

  const handleCopyPhone = () => {
    if (!human.phone) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(human.phone);
      toast.show(`Copied ${human.phone}`, "success");
    } else {
      toast.show("Clipboard not available", "error");
    }
  };

  const handleOpenBooking = useCallback(
    (bookingId) => {
      if (onOpenBooking) {
        onOpenBooking(bookingId);
        return;
      }
      logger.warn("[HumanCardModal] TODO: onOpenBooking", {
        tags: { component: "HumanCardModal", op: "onOpenBooking" },
        extra: { bookingId },
      });
    },
    [onOpenBooking],
  );

  const overflowItems = useMemo(() => {
    const call = (handler, name) => () => {
      if (handler) {
        handler(human.id || humanId);
      } else {
        logger.warn(`[HumanCardModal] TODO: ${name}`, {
          tags: { component: "HumanCardModal", op: name },
          extra: { humanId: human.id || humanId },
        });
      }
    };
    const items = [
      {
        label: "New booking for this human",
        onClick: call(onNewBookingForHuman, "onNewBookingForHuman"),
      },
      {
        label: "Send message",
        onClick: call(onSendMessage, "onSendMessage"),
      },
    ];
    if (onMergeHumans) {
      items.push({ label: "Merge duplicate", onClick: () => setShowMerge(true) });
    }
    if (onArchiveHuman) {
      items.push({ label: "Archive", onClick: () => setPendingArchive(true) });
    }
    return items;
  }, [
    human.id,
    humanId,
    onNewBookingForHuman,
    onSendMessage,
    onMergeHumans,
    onArchiveHuman,
  ]);

  // Pending self-signup: clears once approved (approvedAt set) or rejected
  // (the row is archived + dropped from the maps, closing the modal).
  const isPendingSignup =
    !!onApproveSignup && !human.approvedAt && !!human.signupSubmittedAt;

  const handleApproveSignup = useCallback(async () => {
    if (!onApproveSignup || signupBusy) return;
    setSignupBusy(true);
    try {
      const result = await onApproveSignup(human.id || humanId);
      if (result?.ok) {
        toast.show("Customer approved — they can book now", "success");
      } else {
        toast.show(result?.error || "Couldn't approve — please try again", "error");
      }
    } finally {
      setSignupBusy(false);
    }
  }, [onApproveSignup, signupBusy, human.id, humanId, toast]);

  const handleRejectSignup = useCallback(
    async (reason) => {
      if (!onRejectSignup || signupBusy) return;
      setSignupBusy(true);
      try {
        const result = await onRejectSignup(human.id || humanId, reason);
        setPendingReject(false);
        if (result?.ok) {
          toast.show("Signup rejected", "success");
          onClose?.();
        } else {
          toast.show(result?.error || "Couldn't reject — please try again", "error");
        }
      } finally {
        setSignupBusy(false);
      }
    },
    [onRejectSignup, signupBusy, human.id, humanId, toast, onClose],
  );

  return {
    handleCopyPhone,
    handleOpenBooking,
    overflowItems,
    showMerge,
    setShowMerge,
    pendingArchive,
    setPendingArchive,
    pendingReject,
    setPendingReject,
    signupBusy,
    isPendingSignup,
    handleApproveSignup,
    handleRejectSignup,
  };
}
