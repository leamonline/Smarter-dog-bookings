// Every write the board can make, in one place.
//
// The board is a new way to LOOK at the day; it is deliberately not a new way
// to change it. Each action here goes down the same `onUpdateBooking` path the
// booking detail modal uses, so the three BEFORE-INSERT/UPDATE database gates,
// the ready-for-collection prompt and the optimistic rollback in `useBookings`
// all behave exactly as they did before — there is no second mutation system
// to keep in step.
//
// What is new is repair. Ordinary workflow moves (check in, start groom, ready,
// collected) now carry Undo in their success toast, which is a better bargain
// than a confirmation dialog on every press: the common case costs one tap, and
// the mistake costs two. Genuinely destructive work keeps its confirmation —
// "Didn't show" cancels a booking, and skipping a care step still asks.
import { useCallback, useEffect, useRef, useState } from "react";
import { BOOKING_STATUS, NO_SHOW_REASON } from "../../../constants/index";
import { buildMarkPaidPatch } from "../../../engine/bookingRules";
import type { BookingPricingInput } from "../../../engine/bookingRules";
import { requiresCareSkipConfirmation } from "../../../engine/dailyBrief";
import {
  BOARD_ZONE_META,
  reverseStatusFor,
  zoneForStatus,
  type BoardToken,
  type TokenAction,
  type TokenActionId,
} from "../../../engine/salonBoard";
import type { Booking } from "../../../types/index";

/** How long a token keeps its "this just landed" ring. */
const LAND_FLASH_MS = 900;

type UpdateBooking = (
  booking: Booking,
  fromDate: string,
  toDate: string,
) => Promise<Booking | null | false>;

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  show: (message: string, variant?: string, action?: ToastAction | (() => void)) => unknown;
}

export interface PendingCareSkip {
  booking: Booking;
  status: string;
  skippedText: string;
  successMessage: string;
  failureMessage: string;
  options: { skipCollectionPrompt?: boolean };
}

export interface UseBookingActionsInput {
  dateStr: string;
  toast: Toast;
  onUpdateBooking: UpdateBooking;
  onSendCollection: (booking: Booking) => void;
  onOpenBooking?: (id: string) => void;
  onOpenDog?: (id: string | null) => void;
  onOpenHuman?: (id: string | null) => void;
  onMessageOwner: (booking: Booking) => void;
  /** Amount still owed on a booking, for the unpaid-collection safeguard. */
  amountDueFor: (booking: Booking) => number | null;
}

interface PatchOptions {
  showFailureToast?: boolean;
  successAction?: ToastAction | null;
}

export function useBookingActions({
  dateStr,
  toast,
  onUpdateBooking,
  onSendCollection,
  onOpenBooking,
  onOpenDog,
  onOpenHuman,
  onMessageOwner,
  amountDueFor,
}: UseBookingActionsInput) {
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [landedId, setLandedId] = useState<string | null>(null);
  const [invoiceBooking, setInvoiceBooking] = useState<Booking | null>(null);
  const [collectionDueBooking, setCollectionDueBooking] = useState<Booking | null>(null);
  const [pendingCareSkip, setPendingCareSkip] = useState<PendingCareSkip | null>(null);
  const landTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Zone changes this session caused itself. The view announces only the moves
  // it did NOT cause, so a colleague's check-in on the other till is spoken
  // while your own is not announced twice.
  const localMoves = useRef<Set<string>>(new Set());

  useEffect(() => () => clearTimeout(landTimer.current), []);

  const flashLanding = useCallback((bookingId: string) => {
    clearTimeout(landTimer.current);
    setLandedId(bookingId);
    landTimer.current = setTimeout(() => setLandedId(null), LAND_FLASH_MS);
  }, []);

  /**
   * The one write. Marks the booking busy, sends the change, and on failure
   * leaves the board exactly as it was with an action-specific Retry — a dog
   * must never appear to have moved zone when the save did not land.
   */
  const patch = useCallback(async (
    booking: Booking,
    changes: Partial<Booking>,
    successMessage: string | null,
    failureMessage = "Booking update could not be saved.",
    { showFailureToast = true, successAction = null }: PatchOptions = {},
  ): Promise<Booking | null> => {
    const bookingId = String(booking.id);
    const date = booking._bookingDate || dateStr;
    const movesZone = !!changes.status
      && zoneForStatus(changes.status) !== zoneForStatus(booking.status);
    if (movesZone) localMoves.current.add(bookingId);
    setBusyIds((previous) => new Set(previous).add(bookingId));

    let result: Booking | null | false;
    try {
      result = await onUpdateBooking({ ...booking, ...changes } as Booking, date, date);
    } catch {
      result = null;
    } finally {
      setBusyIds((previous) => {
        const next = new Set(previous);
        next.delete(bookingId);
        return next;
      });
    }

    if (result !== null && result !== false) {
      if (successMessage) toast.show(successMessage, "success", successAction ?? undefined);
      if (movesZone) flashLanding(bookingId);
      return result;
    }

    if (movesZone) localMoves.current.delete(bookingId);
    if (showFailureToast) {
      toast.show(failureMessage, "error", {
        label: "Retry",
        onClick: () => {
          void patch(booking, changes, successMessage, failureMessage, { showFailureToast });
        },
      });
    }
    return null;
  }, [dateStr, flashLanding, onUpdateBooking, toast]);

  /** Put a dog back where it was. Same path, no collection prompt on the way back. */
  const undoStatus = useCallback((persisted: Booking, previousStatus: string, dogName: string) => {
    const zone = zoneForStatus(previousStatus);
    const where = zone ? BOARD_ZONE_META[zone].title.toLowerCase() : "its previous status";
    void patch(
      persisted,
      { status: previousStatus, _skipCollectionPrompt: true } as Partial<Booking>,
      `${dogName} moved back to ${where}`,
      "That change could not be undone.",
    );
  }, [patch]);

  const applyStatus = useCallback(async (
    booking: Booking,
    status: string,
    successMessage: string,
    failureMessage: string,
    options: { skipCollectionPrompt?: boolean; undoFor?: TokenActionId } = {},
  ) => {
    const dogName = booking.dogName || "This dog";
    const previousStatus = booking.status;
    const reversible = options.undoFor ? reverseStatusFor(options.undoFor, previousStatus) : null;

    // The undo closes over the PERSISTED row, so it reverts precisely what the
    // server stored rather than the optimistic copy we sent.
    const saved: { row: Booking | null } = { row: null };
    const successAction: ToastAction | null = reversible
      ? {
        label: "Undo",
        onClick: () => undoStatus(
          saved.row ?? ({ ...booking, status } as Booking),
          reversible,
          dogName,
        ),
      }
      : null;

    const persisted = await patch(
      booking,
      {
        status,
        ...(options.skipCollectionPrompt ? { _skipCollectionPrompt: true } : {}),
      } as Partial<Booking>,
      successMessage,
      failureMessage,
      { successAction },
    );
    saved.row = persisted;
    return persisted;
  }, [patch, undoStatus]);

  /**
   * Care steps run in order. Jumping one (checking a dog straight out as
   * collected, say) is legal but leaves the skipped step unrecorded, so it
   * asks first — through the in-product dialog, never `window.confirm`.
   */
  const changeStatus = useCallback(async (
    booking: Booking,
    status: string,
    successMessage: string,
    failureMessage: string,
    options: { skipCollectionPrompt?: boolean; undoFor?: TokenActionId; skipConfirmation?: boolean } = {},
  ) => {
    const skipped = requiresCareSkipConfirmation(booking.status, status);
    if (skipped && !options.skipConfirmation) {
      setPendingCareSkip({
        booking,
        status,
        skippedText: skipped,
        successMessage,
        failureMessage,
        options: { skipCollectionPrompt: options.skipCollectionPrompt },
      });
      return null;
    }
    return applyStatus(booking, status, successMessage, failureMessage, options);
  }, [applyStatus]);

  const confirmCareSkip = useCallback(async () => {
    const pending = pendingCareSkip;
    setPendingCareSkip(null);
    if (!pending) return;
    await applyStatus(
      pending.booking,
      pending.status,
      pending.successMessage,
      pending.failureMessage,
      pending.options,
    );
  }, [applyStatus, pendingCareSkip]);

  const markCollected = useCallback((booking: Booking) => changeStatus(
    booking,
    BOOKING_STATUS.COMPLETED,
    `${booking.dogName} collected — home today`,
    "Collection could not be saved.",
    { undoFor: "collected" },
  ), [changeStatus]);

  /**
   * Collection with money still owed goes through the existing safeguard
   * modal, which offers to take the payment first. The check lives here rather
   * than in the board so a drag-drop collection is gated exactly like a
   * pressed one.
   */
  const requestCollected = useCallback((booking: Booking) => {
    const amountDue = amountDueFor(booking);
    if (amountDue != null && amountDue > 0) {
      setCollectionDueBooking(booking);
      return;
    }
    void markCollected(booking);
  }, [amountDueFor, markCollected]);

  const markReady = useCallback(async (booking: Booking) => {
    // Skip the automatic prompt and fire it explicitly after the save lands:
    // a failed write must never open a "tell the owner it's ready" modal.
    const saved = await changeStatus(
      booking,
      BOOKING_STATUS.READY_FOR_COLLECTION,
      `${booking.dogName} is ready to go home`,
      "Ready for collection could not be saved.",
      { skipCollectionPrompt: true, skipConfirmation: true, undoFor: "ready" },
    );
    if (saved) {
      onSendCollection({ ...booking, ...saved, status: BOOKING_STATUS.READY_FOR_COLLECTION });
    }
    return saved;
  }, [changeStatus, onSendCollection]);

  const unconfirmArrival = useCallback(async (booking: Booking) => {
    // The write is filtered on reminder_confirmed_source='staff', so a
    // customer confirmation that raced in matches nothing and their word
    // stands. The quiet info toast covers that case and a save failure alike —
    // there is nothing to retry either way.
    const revertState = booking.reminderState === "confirmed"
      ? booking._preConfirmReminderState ?? (booking.reminderSentAt ? "sent" : "none")
      : booking.reminderState ?? "none";
    const result = await patch(
      booking,
      {
        _unconfirmArrival: true,
        reminderConfirmedAt: null,
        reminderConfirmedBy: null,
        reminderState: revertState,
      } as Partial<Booking>,
      `${booking.dogName}'s booking is unconfirmed again`,
      undefined,
      { showFailureToast: false },
    );
    if (!result) {
      toast.show(
        "Couldn't undo — if the customer has just confirmed themselves, their confirmation stands.",
        "info",
      );
    }
    return result;
  }, [patch, toast]);

  const confirmArrival = useCallback((booking: Booking) => {
    // Staff reached the owner off-channel (phone, in person). `_confirmArrival`
    // makes the write path stamp reminder_confirmed_at/_source='staff'; a later
    // real customer confirmation overwrites it server-side, never the reverse.
    // The Undo closes over the PRE-confirm booking, so it reverts exactly.
    return patch(
      booking,
      {
        _confirmArrival: true,
        reminderConfirmedAt: new Date().toISOString(),
        reminderConfirmedBy: "staff",
        reminderState: "confirmed",
        _preConfirmReminderState: booking.reminderState ?? "none",
      } as Partial<Booking>,
      `${booking.dogName}'s booking confirmed`,
      "Confirming this booking could not be saved.",
      { successAction: { label: "Undo", onClick: () => { void unconfirmArrival(booking); } } },
    );
  }, [patch, unconfirmArrival]);

  /**
   * The stack's check-out chain, as ONE write.
   *
   * Taking the money and handing the dog back are a single action to the person
   * doing them, and splitting them across two saves opens a window where a dog
   * is collected but unpaid — which is exactly the state the day's takings then
   * under-report. Both facts go in one patch, down the same path as every other
   * write, so the gates, the rollback and the Undo all behave identically.
   *
   * `paidAmount` is the amount actually handed over, not the appointment's gross
   * value. On a deposit-paid visit those differ, and the till only saw the
   * balance. (The existing mini-invoice writes the gross; that is issue #874 and
   * is deliberately not changed here.)
   *
   * WHEN NO MONEY CHANGES HANDS, NO PAYMENT FIELD IS WRITTEN. A dog that paid in
   * advance reaches the two-step chain, which hands back no method and a zero
   * amount — and `buildMarkPaidPatch` treats a zero override as a real figure,
   * so applying it unconditionally overwrote a settled £42 card payment with
   * `paidAmount: 0, paymentMethod: null` and quietly removed the money from the
   * day's takings (#878). The guard lives HERE rather than in the card because
   * every caller of this function needs it, including the ones not written yet.
   *
   * Undo reverts exactly what was written and nothing else. Where a payment was
   * taken it is reversed — clearing `payment` also makes the database trigger
   * drop paid_at, the method and the amount. Where none was taken the payment
   * fields are left untouched, because undoing a handover must not un-take a
   * payment made hours earlier through another route.
   */
  const collectWithPayment = useCallback(async (
    booking: Booking,
    pricingInput: BookingPricingInput,
    method: string | null,
    amountTaken: number | null,
  ) => {
    const dogName = booking.dogName || "This dog";
    const previousStatus = booking.status;
    const previousPayment = booking.payment;

    // Money is only being taken if a method was chosen AND a positive amount
    // came with it. Either one missing means this is a bare handover.
    const takingPayment = !!method && Number(amountTaken) > 0;

    const paymentPatch = takingPayment
      ? buildMarkPaidPatch(pricingInput, method, amountTaken)
      : null;
    const undoPayment = takingPayment
      ? { payment: previousPayment, paymentMethod: null, paidAmount: null }
      : null;

    const saved: { row: Booking | null } = { row: null };
    const persisted = await patch(
      booking,
      {
        ...(paymentPatch ?? {}),
        status: BOOKING_STATUS.COMPLETED,
        _skipCollectionPrompt: true,
      } as Partial<Booking>,
      `${dogName} collected — home today`,
      "Collection could not be saved.",
      {
        successAction: {
          label: "Undo",
          onClick: () => {
            void patch(
              saved.row ?? booking,
              {
                status: previousStatus,
                ...(undoPayment ?? {}),
                _skipCollectionPrompt: true,
              } as Partial<Booking>,
              takingPayment
                ? `${dogName} is back on the list, payment undone`
                : `${dogName} is back on the list`,
              "That change could not be undone.",
            );
          },
        },
      },
    );
    saved.row = persisted;
    return persisted;
  }, [patch]);

  /**
   * A one-off agreed price for THIS visit.
   *
   * Written in POUNDS, because that is what `bookings.price_override` holds and
   * what computeBookingPricing expects back. The column's only constraint is
   * `> 0`, so a figure in pence would pass validation and overcharge by a
   * hundred times; the guard below is the one that actually protects it.
   *
   * It is the BASE price, before add-ons. Writing a subtotal here would add the
   * add-ons again on the next read.
   */
  const setPrice = useCallback((booking: Booking, pounds: number) => {
    if (!Number.isFinite(pounds) || pounds <= 0) {
      toast.show("Enter a price above £0", "info");
      return Promise.resolve(null);
    }
    return patch(
      booking,
      { priceOverride: Math.round(pounds * 100) / 100 } as Partial<Booking>,
      "Price updated",
      "The price could not be saved.",
    );
  }, [patch, toast]);

  const saveInvoice = useCallback(
    (booking: Booking, invoicePatch: Partial<Booking>) => patch(
      booking,
      invoicePatch,
      "Payment recorded",
      "Payment could not be saved.",
      { showFailureToast: false },
    ),
    [patch],
  );

  /**
   * The board's single entry point. Whatever fired it — a menu item, a sheet
   * row, or a dog dragged into the next zone — the same function runs, so the
   * three input methods can never diverge in what they actually do.
   */
  const runTokenAction = useCallback((token: BoardToken, action: Pick<TokenAction, "id">) => {
    const booking = token.booking;
    switch (action.id) {
      case "checkIn":
        return changeStatus(
          booking,
          BOOKING_STATUS.ARRIVED,
          `${booking.dogName} checked in — with us now`,
          "Check-in could not be saved.",
          { undoFor: "checkIn" },
        );
      case "reconfirm":
        return changeStatus(
          booking,
          BOOKING_STATUS.RECONFIRMED,
          `${booking.dogName}'s booking reconfirmed`,
          "Reconfirming this booking could not be saved.",
          { undoFor: "reconfirm" },
        );
      case "ready":
        return markReady(booking);
      case "collected":
        requestCollected(booking);
        return null;
      case "payment":
        setInvoiceBooking(booking);
        return null;
      case "confirm":
        return confirmArrival(booking);
      case "unconfirm":
        return unconfirmArrival(booking);
      case "message":
        onMessageOwner(booking);
        return null;
      case "didntShow":
        // A no-show is now a status of its own rather than a Cancelled row
        // carrying a reason. The reason text is still written, because staff
        // read it in the booking history and because it keeps pre-migration
        // and post-migration rows looking the same in that list. Nothing
        // auto-labels a no-show, and nothing is sent to the customer.
        return patch(
          booking,
          {
            status: BOOKING_STATUS.NO_SHOW,
            cancelReason: NO_SHOW_REASON,
          } as Partial<Booking>,
          `${booking.dogName} marked as a no-show`,
          "Marking this booking as a no-show could not be saved.",
        );
      case "booking":
        onOpenBooking?.(String(booking.id));
        return null;
      case "dogFile":
        onOpenDog?.(booking._dogId);
        return null;
      case "humanFile":
        onOpenHuman?.(booking._ownerId);
        return null;
      default:
        return null;
    }
  }, [
    changeStatus,
    confirmArrival,
    markReady,
    onMessageOwner,
    onOpenBooking,
    onOpenDog,
    onOpenHuman,
    patch,
    requestCollected,
    unconfirmArrival,
  ]);

  /** True when this session caused the zone change — used to skip announcing it. */
  const consumeLocalMove = useCallback((bookingId: string) => {
    if (!localMoves.current.has(bookingId)) return false;
    localMoves.current.delete(bookingId);
    return true;
  }, []);

  const resetLocalMoves = useCallback(() => localMoves.current.clear(), []);

  return {
    busyIds,
    landedId,
    invoiceBooking,
    setInvoiceBooking,
    collectionDueBooking,
    setCollectionDueBooking,
    pendingCareSkip,
    setPendingCareSkip,
    confirmCareSkip,
    runTokenAction,
    markCollected,
    collectWithPayment,
    setPrice,
    saveInvoice,
    consumeLocalMove,
    resetLocalMoves,
  };
}
