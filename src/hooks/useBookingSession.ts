/**
 * useBookingSession — the staff "new booking" drawer's session lifecycle,
 * extracted from App.jsx (Debt 11).
 *
 * Owns three related pieces of pure client-side UI state:
 *  - the live calendar link (a plain date/slot pick while the drawer is
 *    open updates the draft instead of re-opening the wizard);
 *  - the session key that remounts the drawer when a request carries
 *    identity (book again, WhatsApp hand-off, parked-draft resume);
 *  - park & resume: stepping out of the wizard to create a dog/human
 *    mid-flow without losing the staff member's date/slot/dog choices.
 *
 * None of this touches the write path — the capacity trigger, the three
 * BEFORE INSERT gates, RLS and the staff-direct-INSERT path are untouched.
 */
import { useCallback, useRef, useState } from "react";
import type {
  BookingEntryDraft,
  NewBookingData,
  PendingBooking,
} from "./useModalState";

/** What callers pass to `requestNewBooking` — the drawer's prefill minus the
 *  session key (assigned here). */
export type NewBookingRequest = Omit<NewBookingData, "sessionKey">;

/** A calendar pick forwarded to an already-open drawer. */
export interface DraftPick {
  dateStr: string;
  slot: string;
  /** Monotonic so an identical re-pick still re-runs the drawer's effect. */
  nonce: number;
}

/** The drawer's current date/slot target, mirrored back so the calendar can
 *  highlight it. Shape is owned by NewBookingModal; the shell only relays it. */
export type DraftTarget = { dateStr: string; slot: string } | null;

/** A freshly created dog handed back by AddDogModal (its stored record). */
export type ParkedDog = Record<string, unknown> & {
  id?: string;
  humanId?: string;
  _humanId?: string;
};

export interface UseBookingSessionOptions {
  showNewBooking: NewBookingData | null;
  setShowNewBooking: (data: NewBookingData | null) => void;
  pendingBooking: PendingBooking | null;
  setPendingBooking: (data: PendingBooking | null) => void;
  setShowAddDogModal: (show: boolean) => void;
  /** useDogs' clearSearch — the drawer's dog search is reset on close. */
  clearDogSearch: () => void;
  currentDateStr: string;
}

export function useBookingSession({
  showNewBooking,
  setShowNewBooking,
  pendingBooking,
  setPendingBooking,
  setShowAddDogModal,
  clearDogSearch,
  currentDateStr,
}: UseBookingSessionOptions) {
  // Live calendar link: while the booking drawer is open, plain calendar
  // picks (a dateStr/slot with no identity prefills) update the open draft
  // instead of re-opening the wizard. Anything carrying identity — book
  // again, WhatsApp, parked-draft resume — starts a FRESH session: the
  // sessionKey remounts the drawer so its one-shot prefill refs run again
  // (they'd otherwise silently ignore the new prefill).
  const [draftPick, setDraftPick] = useState<DraftPick | null>(null);
  const [draftTarget, setDraftTarget] = useState<DraftTarget>(null);
  const draftNonceRef = useRef(0);
  const bookingSessionRef = useRef(0);

  const requestNewBooking = useCallback(
    (req: NewBookingRequest) => {
      const isCalendarPick =
        !!req?.dateStr &&
        !req.initialHumanId &&
        !req.initialDogId &&
        !req.initialEntries &&
        !req.sourceMessageText;
      if (showNewBooking && isCalendarPick) {
        draftNonceRef.current += 1;
        setDraftPick({
          dateStr: req.dateStr,
          slot: req.slot || "",
          nonce: draftNonceRef.current,
        });
        return;
      }
      bookingSessionRef.current += 1;
      setDraftPick(null);
      setDraftTarget(null);
      setShowNewBooking({ ...req, sessionKey: bookingSessionRef.current });
    },
    [showNewBooking, setShowNewBooking],
  );

  // Close the drawer and reset everything that belongs to its session.
  const closeNewBooking = useCallback(() => {
    setShowNewBooking(null);
    setDraftPick(null);
    setDraftTarget(null);
    clearDogSearch();
  }, [setShowNewBooking, clearDogSearch]);

  // A booking-in-progress that staff parked to create a new dog/human mid-flow
  // (see parkBooking/resumeParkedBooking below). Mirrored in a ref so resume can
  // read the latest value synchronously even when called twice in one tick
  // (success path: onAdd resumes, then the modal's onClose fires too).
  const pendingBookingRef = useRef<PendingBooking | null>(null);

  // ── New-customer cold start: park & resume the in-progress booking ──────
  // The booking wizard is dog-first, so onboarding a walk-in means stepping
  // out to create the dog/human. Rather than tearing the wizard down and
  // losing the staff member's date/slot/dog choices, we PARK the in-progress
  // booking, open the create modal, then RE-OPEN the wizard with their work
  // restored and the newly-created dog pre-selected.
  const parkBooking = useCallback(
    (draft: PendingBooking | null | undefined) => {
      pendingBookingRef.current = draft || null;
      setPendingBooking(draft || null);
      closeNewBooking();
      setShowAddDogModal(true);
    },
    [setPendingBooking, closeNewBooking, setShowAddDogModal],
  );

  // Re-open the parked booking, restoring its date/slot and dog entries and —
  // when a record was just created — selecting it. Guarded by the ref so the
  // double call on the success path (onAdd resume + the modal's onClose resume)
  // only re-opens once. A no-op when nothing was parked (e.g. the modal was
  // opened outside the booking flow), preserving the old standalone behaviour.
  const resumeParkedBooking = useCallback(
    ({ newDog = null }: { newDog?: ParkedDog | null } = {}) => {
      const draft = pendingBookingRef.current;
      pendingBookingRef.current = null;
      setPendingBooking(null);
      // Close the add-dog modal and re-open the wizard in the SAME update so the
      // two never mount together (stacked focus-trapped dialogs would fight).
      setShowAddDogModal(false);
      if (!draft) return;
      const entries: BookingEntryDraft[] = [...(draft.entries || [])];
      if (newDog) {
        entries.push({
          dog: newDog,
          humanKey: newDog.humanId || draft.owner?.label || "",
          service: "full-groom",
          addons: [],
        });
      }
      const hasEntries = entries.length > 0;
      requestNewBooking({
        dateStr: draft.dateStr || currentDateStr,
        slot: draft.slot || "",
        initialEntries: hasEntries ? entries : undefined,
        initialHumanId:
          (newDog && (newDog._humanId || draft.owner?.id)) ||
          draft.owner?.id ||
          undefined,
      });
    },
    [setPendingBooking, setShowAddDogModal, requestNewBooking, currentDateStr],
  );

  // "Save & add another dog": append a just-created dog to the PARKED booking
  // without re-opening the wizard, so staff can register several dogs for one
  // customer in a single AddDogModal session. The final dog goes through the
  // normal onAdd -> resumeParkedBooking path, which appends it on top of these.
  const appendDogToParked = useCallback(
    (newDog: ParkedDog | null | undefined) => {
      const draft = pendingBookingRef.current;
      if (!draft || !newDog) return;
      const humanKey = newDog.humanId || draft.owner?.label || "";
      const owner =
        draft.owner ||
        (newDog._humanId ? { id: newDog._humanId, label: humanKey, phone: "" } : null);
      const next: PendingBooking = {
        ...draft,
        owner,
        entries: [
          ...(draft.entries || []),
          { dog: newDog, humanKey, service: "full-groom", addons: [] },
        ],
      };
      pendingBookingRef.current = next;
      setPendingBooking(next);
    },
    [setPendingBooking],
  );

  // Owner to pre-lock in the add-dog modal when the parked booking already had
  // an owner (e.g. "+ New dog for <owner>"); null on a true cold start so the
  // modal shows its owner search + inline create instead.
  const pendingPresetOwner = pendingBooking?.owner || null;

  return {
    draftPick,
    draftTarget,
    setDraftTarget,
    requestNewBooking,
    closeNewBooking,
    parkBooking,
    resumeParkedBooking,
    appendDogToParked,
    pendingPresetOwner,
  };
}

export type BookingSession = ReturnType<typeof useBookingSession>;
