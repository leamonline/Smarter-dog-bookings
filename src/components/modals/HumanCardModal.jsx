import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import {
  getHumanByIdOrName,
} from "../../engine/bookingRules.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { normalisePhoneDigits } from "./dog-card/helpers.js";
import {
  HumanBookingHistory,
  HumanHeader,
  ContactPanel,
  ChannelsPanel,
  NotesPanel,
  AtAGlanceStrip,
  DogsPanel,
  TrustedHumansPanel,
  RemindersPanel,
  MergeHumanDialog,
} from "./human-card/index.js";

const EMPTY_HUMAN = {
  id: "",
  fullName: "",
  name: "",
  surname: "",
  phone: "",
  sms: false,
  whatsapp: false,
  email: "",
  fb: "",
  insta: "",
  tiktok: "",
  address: "",
  notes: "",
  trustedIds: [],
  trustedContacts: [],
  historyFlag: "",
};

const DRAFT_KEYS = [
  "name",
  "surname",
  "phone",
  "email",
  "address",
  "fb",
  "insta",
  "tiktok",
  "notes",
  "sms",
  "whatsapp",
  "historyFlag",
];

function makeDraftFromHuman(h) {
  return {
    name: h.name || "",
    surname: h.surname || "",
    phone: h.phone || "",
    email: h.email || "",
    address: h.address || "",
    fb: h.fb || "",
    insta: h.insta || "",
    tiktok: h.tiktok || "",
    notes: h.notes || "",
    sms: !!h.sms,
    whatsapp: !!h.whatsapp,
    historyFlag: h.historyFlag || "",
  };
}

function draftsEqual(a, b) {
  if (a === b) return true;
  for (const k of DRAFT_KEYS) if (a[k] !== b[k]) return false;
  return true;
}

export function HumanCardModal({
  humanId,
  onClose,
  onOpenHuman,
  onOpenDog,
  humans,
  dogs,
  dogsByHumanId,
  ensureDogsForHumans,
  onUpdateHuman,
  onAddHuman,
  onDeleteHuman,
  bookingsByDate,
  fetchHumanById,
  findHumanByFullName,
  searchHumansByTerm,
  // Optional callbacks the parent can wire later. When omitted we stub
  // each one with a console.warn so they can be grepped.
  onOpenBooking,
  onNewBookingForHuman,
  onSendMessage,
  onMergeHumans,
  onArchiveHuman,
}) {
  const toast = useToast();
  const [pendingDelete, setPendingDelete] = useState(false);
  const [pendingExit, setPendingExit] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [pendingArchive, setPendingArchive] = useState(false);

  // If the requested human isn't in the local map (e.g. their row sits
  // past the initial PAGE_SIZE pagination boundary), fetch them on demand
  // so the card doesn't fall back to showing the raw UUID.
  useEffect(() => {
    if (!humanId || !fetchHumanById) return;
    if (humans?.[humanId]) return;
    fetchHumanById(humanId);
  }, [humanId, humans, fetchHumanById]);

  // Same pattern for dogs: useDogs paginates by name, so a customer's
  // dogs may sit past the first page (one missing, all missing depending
  // on the alphabetical cut-off). ensureDogsForHumans populates
  // dogsByHumanId for the panels below.
  useEffect(() => {
    if (!humanId || !ensureDogsForHumans) return;
    ensureDogsForHumans([humanId]);
  }, [humanId, ensureDogsForHumans]);

  const human = useMemo(
    () =>
      getHumanByIdOrName(humans, humanId) || { ...EMPTY_HUMAN, id: humanId },
    [humans, humanId],
  );

  const humanFullName =
    human.fullName || `${human.name || ""} ${human.surname || ""}`.trim();

  // --- Edit state ---
  const [mode, setMode] = useState("view");
  const [draft, setDraft] = useState(() => makeDraftFromHuman(human));
  const [saving, setSaving] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [editFocusKey, setEditFocusKey] = useState(null);

  const nameInputRef = useRef(null);
  const addressInputRef = useRef(null);
  const emailInputRef = useRef(null);
  const notesInputRef = useRef(null);
  const historyRef = useRef(null);

  // Reseed when a different human is selected. Live edits and edit-mode
  // transitions never overwrite the user's typing — so we deliberately
  // depend on `human.id` rather than the whole `human` reference.
  useEffect(() => {
    setDraft(makeDraftFromHuman(human));
    setMode("view");
    setNotesExpanded(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [human.id]);

  // Focus the right input when the modal enters edit mode.
  useEffect(() => {
    if (mode !== "edit") return;
    const ref =
      editFocusKey === "address"
        ? addressInputRef
        : editFocusKey === "email"
          ? emailInputRef
          : editFocusKey === "notes"
            ? notesInputRef
            : nameInputRef;
    const t = setTimeout(() => {
      ref.current?.focus();
      if (ref.current?.select) {
        try {
          ref.current.select();
        } catch {
          /* not all input types support select() */
        }
      }
    }, 0);
    return () => clearTimeout(t);
  }, [mode, editFocusKey]);

  const setDraftField = useCallback((key, value) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  const dirty = useMemo(
    () => !draftsEqual(draft, makeDraftFromHuman(human)),
    [draft, human],
  );

  const startEdit = useCallback(
    (focusKey = "name") => {
      setEditFocusKey(focusKey);
      setMode("edit");
    },
    [],
  );

  const cancelEdit = useCallback(() => {
    setDraft(makeDraftFromHuman(human));
    setMode("view");
    setEditFocusKey(null);
  }, [human]);

  const handleSaveHuman = async () => {
    if (!dirty || saving) return;
    const trimmedPhone = draft.phone.trim();
    if (trimmedPhone && normalisePhoneDigits(trimmedPhone).length < 10) {
      toast.show(
        "Please enter a valid phone number (at least 10 digits).",
        "error",
      );
      return;
    }
    setSaving(true);
    try {
      const updates = {
        name: draft.name.trim(),
        surname: draft.surname.trim(),
        fullName: `${draft.name.trim()} ${draft.surname.trim()}`.trim(),
        phone: trimmedPhone,
        email: draft.email.trim(),
        address: draft.address.trim(),
        fb: draft.fb.trim(),
        insta: draft.insta.trim(),
        tiktok: draft.tiktok.trim(),
        notes: draft.notes.trim(),
        sms: draft.sms,
        whatsapp: draft.whatsapp,
        historyFlag: draft.historyFlag.trim(),
      };
      await onUpdateHuman(human.id || humanId, updates);
      setMode("view");
      setEditFocusKey(null);
      toast.show("Profile saved", "success");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyPhone = () => {
    if (!human.phone) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(human.phone);
      toast.show(`Copied ${human.phone}`, "success");
    } else {
      toast.show("Clipboard not available", "error");
    }
  };

  // Close request — if we're mid-edit with unsaved changes, ask first.
  const requestClose = useCallback(() => {
    if (mode === "edit" && dirty) {
      setPendingExit(true);
      return;
    }
    onClose?.();
  }, [mode, dirty, onClose]);

  // "E" toggles edit mode when no input is focused. Skipped while the
  // overflow / confirm dialogs are open so it doesn't clash.
  useEffect(() => {
    if (!onUpdateHuman) return;
    const handler = (e) => {
      if (e.key !== "e" && e.key !== "E") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (pendingDelete || pendingExit) return;
      e.preventDefault();
      if (mode === "view") startEdit("name");
      else if (!dirty) cancelEdit();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [mode, dirty, onUpdateHuman, pendingDelete, pendingExit, startEdit, cancelEdit]);

  // Scroll the booking-history section into view. Used by the at-a-glance
  // "Bookings" tile, which has no separate list view to open.
  const handleShowHistory = useCallback(() => {
    historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Stubbed callbacks: keep the surface area visible in the modal and
  // emit a console.warn so unwired handlers are grep-able.
  const handleOpenBooking = useCallback(
    (bookingId) => {
      if (onOpenBooking) {
        onOpenBooking(bookingId);
        return;
      }
      console.warn("[HumanCardModal] TODO: onOpenBooking", { bookingId });
    },
    [onOpenBooking],
  );

  const overflowItems = useMemo(() => {
    const call = (handler, name) => () => {
      if (handler) {
        handler(human.id || humanId);
      } else {
        console.warn(`[HumanCardModal] TODO: ${name}`, {
          humanId: human.id || humanId,
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

  const isEditing = mode === "edit";

  return (
    <>
      <AccessibleModal
        onClose={requestClose}
        titleId="human-card-title"
        backdropClass="bg-[rgba(45,0,75,0.45)] animate-overlay-fade"
        className="bg-[var(--color-brand-paper)] rounded-[20px] w-[min(820px,95vw)] max-h-[min(90vh,760px)] flex flex-col overflow-hidden shadow-[0_18px_50px_-12px_rgba(45,0,75,0.28)] animate-human-modal-in"
      >
        <HumanHeader
          human={human}
          humanFullName={humanFullName}
          isEditing={isEditing}
          editName={draft.name}
          setEditName={(v) => setDraftField("name", v)}
          editSurname={draft.surname}
          setEditSurname={(v) => setDraftField("surname", v)}
          editPhone={draft.phone}
          setEditPhone={(v) => setDraftField("phone", v)}
          onStartEdit={() => startEdit("name")}
          onClose={requestClose}
          canEdit={!!onUpdateHuman}
          onCopyPhone={handleCopyPhone}
          overflowItems={overflowItems}
          nameInputRef={nameInputRef}
        />

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4">
            {/* Left column — Contact, Channels, Notes */}
            <div className="md:col-span-5 flex flex-col gap-3 min-h-0">
              <ContactPanel
                isEditing={isEditing}
                human={human}
                editAddress={draft.address}
                setEditAddress={(v) => setDraftField("address", v)}
                editEmail={draft.email}
                setEditEmail={(v) => setDraftField("email", v)}
                onStartEdit={() => startEdit("address")}
                addressInputRef={addressInputRef}
                emailInputRef={emailInputRef}
              />
              <ChannelsPanel
                isEditing={isEditing}
                human={human}
                onUpdateHuman={onUpdateHuman}
                editSms={draft.sms}
                setEditSms={(v) => setDraftField("sms", v)}
                editWhatsapp={draft.whatsapp}
                setEditWhatsapp={(v) => setDraftField("whatsapp", v)}
                editFb={draft.fb}
                setEditFb={(v) => setDraftField("fb", v)}
                editInsta={draft.insta}
                setEditInsta={(v) => setDraftField("insta", v)}
                editTiktok={draft.tiktok}
                setEditTiktok={(v) => setDraftField("tiktok", v)}
              />
              <NotesPanel
                isEditing={isEditing}
                human={human}
                editNotes={draft.notes}
                setEditNotes={(v) => setDraftField("notes", v)}
                editHistoryFlag={draft.historyFlag}
                setEditHistoryFlag={(v) => setDraftField("historyFlag", v)}
                expanded={notesExpanded}
                onToggleExpanded={() => setNotesExpanded((v) => !v)}
                onStartEdit={onUpdateHuman ? () => startEdit("notes") : undefined}
                notesInputRef={notesInputRef}
              />
            </div>

            {/* Right column — At a glance, Dogs, Trusted, Reminders.
                On mobile (single column) it floats above the left column so
                Dogs + the at-a-glance stats — the day-to-day stuff — lead,
                ahead of Channels/Notes. Reset to DOM order at md. */}
            <div className="order-first md:order-none md:col-span-7 flex flex-col gap-3 min-h-0">
              <AtAGlanceStrip
                human={human}
                humanFullName={humanFullName}
                dogs={dogs}
                dogsByHumanId={dogsByHumanId}
                bookingsByDate={bookingsByDate}
                onShowHistory={handleShowHistory}
                onOpenBooking={handleOpenBooking}
                onNewBookingForHuman={onNewBookingForHuman}
              />
              <DogsPanel
                human={human}
                humanFullName={humanFullName}
                dogs={dogs}
                dogsByHumanId={dogsByHumanId}
                onClose={onClose}
                onOpenDog={onOpenDog}
              />
              <TrustedHumansPanel
                human={human}
                humanFullName={humanFullName}
                humans={humans}
                onClose={onClose}
                onOpenHuman={onOpenHuman}
                onUpdateHuman={onUpdateHuman}
                onAddHuman={onAddHuman}
                findHumanByFullName={findHumanByFullName}
                searchHumansByTerm={searchHumansByTerm}
              />
              <RemindersPanel human={human} onUpdateHuman={onUpdateHuman} />
            </div>
          </div>

          {/* Booking history spans both columns underneath the grid. */}
          <div ref={historyRef} className="mt-3 md:mt-4 scroll-mt-2">
            <HumanBookingHistory
              human={human}
              dogs={dogs}
              dogsByHumanId={dogsByHumanId}
              bookingsByDate={bookingsByDate}
              onOpenBooking={handleOpenBooking}
            />
          </div>
        </div>

        {isEditing && (
          <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-3 flex items-center gap-2.5">
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className="px-4 py-2 rounded-control border-[1.5px] border-slate-200 bg-white text-slate-600 text-sm font-bold cursor-pointer font-inherit transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveHuman}
              disabled={!dirty || saving}
              className="ml-auto py-2 px-5 rounded-full border-none text-sm font-bold font-inherit cursor-pointer transition-colors bg-action text-on-action hover:bg-brand-yellow-dark disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            >
              <Check size={14} strokeWidth={2.4} aria-hidden="true" />{" "}
              {saving ? "Saving…" : "Save changes"}
            </button>
            {onDeleteHuman && (
              <button
                type="button"
                onClick={() => setPendingDelete(true)}
                disabled={saving}
                className="text-xs font-bold text-brand-coral underline cursor-pointer bg-transparent border-none p-0 font-[inherit] hover:text-brand-coral-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete…
              </button>
            )}
          </div>
        )}
      </AccessibleModal>

      {pendingExit && (
        <ConfirmDialog
          title="Discard changes?"
          message="Your unsaved edits will be lost."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          variant="danger"
          onConfirm={() => {
            setPendingExit(false);
            cancelEdit();
            onClose?.();
          }}
          onCancel={() => setPendingExit(false)}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this person?"
          message="They will be removed from the directory. Any dogs registered to them, their booking history, and groom photos will be deleted. WhatsApp threads stay but lose their link to this person. Cannot be undone."
          confirmLabel="Delete person"
          variant="danger"
          onConfirm={async () => {
            const result = await onDeleteHuman?.(humanId);
            setPendingDelete(false);
            if (result?.ok) {
              toast.show("Deleted", "success");
              onClose?.();
            } else if (result?.error) {
              toast.show(result.error, "error");
            }
          }}
          onCancel={() => setPendingDelete(false)}
        />
      )}

      {pendingArchive && (
        <ConfirmDialog
          title="Archive this person?"
          message="They'll be hidden from the directory and left out of new-booking and trusted-contact search. Their dogs and booking history are kept — you can unarchive them later from the directory's “Show archived” view."
          confirmLabel="Archive"
          cancelLabel="Cancel"
          variant="primary"
          onConfirm={async () => {
            const result = await onArchiveHuman?.(human.id || humanId);
            setPendingArchive(false);
            if (result) {
              toast.show("Archived", "success");
              onClose?.();
            } else {
              toast.show("Couldn't archive — please try again", "error");
            }
          }}
          onCancel={() => setPendingArchive(false)}
        />
      )}

      {showMerge && onMergeHumans && (
        <MergeHumanDialog
          human={human}
          humans={humans}
          dogs={dogs}
          dogsByHumanId={dogsByHumanId}
          bookingsByDate={bookingsByDate}
          ensureDogsForHumans={ensureDogsForHumans}
          searchHumansByTerm={searchHumansByTerm}
          onMerge={onMergeHumans}
          onMerged={(winnerId) => {
            setShowMerge(false);
            // If the kept record is the other one (user swapped), jump to it;
            // otherwise the current modal is the winner and just refreshes.
            if (winnerId && winnerId !== (human.id || humanId)) {
              onOpenHuman?.(winnerId);
            }
          }}
          onClose={() => setShowMerge(false)}
        />
      )}
    </>
  );
}
