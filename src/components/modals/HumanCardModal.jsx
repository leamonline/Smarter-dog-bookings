import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { ModalShell } from "./shell/index.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import {
  getHumanByIdOrName,
} from "../../engine/bookingRules";
import { useToast } from "../../contexts/ToastContext.jsx";
import { titleCase } from "../../utils/text";
import {
  HumanBookingHistory,
  HumanEventTimeline,
  HumanHeader,
  ContactPanel,
  ChannelsPanel,
  NotesPanel,
  AtAGlanceStrip,
  DogsPanel,
  LinkDogActions,
  TrustedHumansPanel,
  RemindersPanel,
  AiMessagingPanel,
  BookingRulesPanel,
  MergeHumanDialog,
  HumanEditFooter,
  RejectSignupDialog,
  useHumanDraft,
  useHumanCardActions,
  useResolvedHuman,
} from "./human-card/index.js";
import { AddDogModal } from "./AddDogModal.jsx";
import {
  fetchTrustedContactsForHuman,
  fetchTrustedOwnerIdsForHuman,
} from "../../supabase/hooks/humans/useTrustedContacts";

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
  onAddDog,
  onDeleteHuman,
  bookingsByDate,
  fetchHumanById,
  findHumanByFullName,
  findHumanByPhone,
  searchHumansByTerm,
  // Optional callbacks the parent can wire later. When omitted,
  // useHumanCardActions stubs each one with a logger.warn so they can
  // be grepped.
  onOpenBooking,
  onBookAgain,
  onNewBookingForHuman,
  onSendMessage,
  onMergeHumans,
  onArchiveHuman,
  // "Join the Pack" self-signup approval. Pending = approved_at NULL +
  // signup_submitted_at set; the header surfaces the badge + buttons.
  onApproveSignup,
  onRejectSignup,
  // A number save that collides with an unapproved portal signup's shell:
  // link_pending_signup moves the verified number + login here instead.
  onLinkPendingSignup,
}) {
  const toast = useToast();
  const [pendingDelete, setPendingDelete] = useState(false);
  const [pendingExit, setPendingExit] = useState(false);
  // { hit, phone, updates, resolve } while the "Link this signup?" prompt is
  // up; `resolve` hands the outcome back to useHumanDraft.saveHuman.
  const [pendingLink, setPendingLink] = useState(null);
  const [linking, setLinking] = useState(false);

  // Resolve the human: the live map entry when present (so edits flow
  // straight through), otherwise an on-demand fetch held in LOCAL state so
  // a deep-link / refresh to a human past the pagination boundary hydrates
  // the card instead of leaving it on "Unnamed human / No phone". See
  // useResolvedHuman for the full rationale — it mirrors useResolvedDog.
  const { resolvedHuman } = useResolvedHuman(humanId, humans, fetchHumanById);

  // Same pattern for dogs: useDogs paginates by name, so a customer's
  // dogs may sit past the first page (one missing, all missing depending
  // on the alphabetical cut-off). ensureDogsForHumans populates
  // dogsByHumanId for the panels below.
  useEffect(() => {
    if (!humanId || !ensureDogsForHumans) return;
    ensureDogsForHumans([humanId]);
  }, [humanId, ensureDogsForHumans]);

  const human = resolvedHuman;

  const humanFullName =
    human.fullName || `${human.name || ""} ${human.surname || ""}`.trim();

  // Trust is one-way in the database: { human_id: owner, trusted_id: person }.
  // Load the incoming owner ids separately from human.trustedContacts, which
  // is the outgoing set ("people this human trusts"). Keeping both directions
  // distinct lets the Dogs panel show dogs this person may drop off / collect
  // without inventing a reciprocal trust row.
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

  const [showAddDog, setShowAddDog] = useState(false);

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

  // A phone save lost to humans_phone_unique. Work out who holds the number:
  // an unapproved portal signup shell can be linked onto this record in one
  // tap (that is the whole "existing customer signed up with a new number"
  // case); anyone else is named so staff know where to look.
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

  const handleCancelLink = () => {
    pendingLink?.resolve(false);
    setPendingLink(null);
  };

  const handleConfirmLink = async () => {
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
  };

  // Edit-mode lifecycle: draft fields, dirty tracking, save + validation,
  // input focus, "E" shortcut. Paused while a confirm dialog is open.
  const {
    isEditing,
    draft,
    setDraftField,
    dirty,
    saving,
    notesExpanded,
    setNotesExpanded,
    startEdit,
    cancelEdit,
    saveHuman,
    nameInputRef,
    addressInputRef,
    emailInputRef,
    notesInputRef,
  } = useHumanDraft({
    human,
    humanId,
    onUpdateHuman,
    onPhoneTaken: handlePhoneTaken,
    shortcutPaused: pendingDelete || pendingExit || !!pendingLink,
  });

  // Card-level actions: copy phone, open booking, overflow menu, and
  // signup approve/reject — plus the merge/archive/reject dialog flags.
  const {
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
  } = useHumanCardActions({
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
  });

  // Close request — if we're mid-edit with unsaved changes, ask first.
  const requestClose = useCallback(() => {
    if (isEditing && dirty) {
      setPendingExit(true);
      return;
    }
    onClose?.();
  }, [isEditing, dirty, onClose]);

  // Scroll the booking-history section into view. Used by the at-a-glance
  // "Bookings" tile, which has no separate list view to open.
  const historyRef = useRef(null);
  const handleShowHistory = useCallback(() => {
    historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Pinned phone-only action bar: the primary CTA stays in thumb reach
  // while the profile scrolls. Desktop gets the same CTA in the booking
  // history panel header instead.
  const mobileActionBar =
    !isEditing && onNewBookingForHuman ? (
      <div className="sm:hidden border-t border-slate-100 bg-white px-4 py-2.5">
        <button
          type="button"
          onClick={() => onNewBookingForHuman(human.id)}
          className="w-full inline-flex items-center justify-center gap-1.5 py-3 min-h-[44px] rounded-full border-none text-sm font-bold font-inherit cursor-pointer transition-colors bg-action text-on-action hover:bg-brand-yellow-dark"
        >
          <Plus size={15} strokeWidth={2.6} aria-hidden="true" />
          New booking
        </button>
      </div>
    ) : null;

  return (
    <>
      <ModalShell
        onClose={requestClose}
        titleId="human-card-title"
        accent="var(--color-brand-teal)"
        widthClass="w-[min(1040px,95vw)]"
        bodyClassName="px-5 pb-4"
        header={
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
            isPendingSignup={isPendingSignup}
            signupBusy={signupBusy}
            onApproveSignup={handleApproveSignup}
            onRejectSignup={() => setPendingReject(true)}
          />
        }
        footer={
          isEditing ? (
            <HumanEditFooter
              dirty={dirty}
              saving={saving}
              onCancel={cancelEdit}
              onSave={saveHuman}
              onDelete={onDeleteHuman ? () => setPendingDelete(true) : undefined}
            />
          ) : (
            mobileActionBar
          )
        }
      >
        {/* At-a-glance leads the card full-width: the numbers staff
            check first, directly under the name. */}
        <div className="mb-3 md:mb-4">
          <AtAGlanceStrip
            human={human}
            dogs={dogs}
            dogsByHumanId={dogsByHumanId}
            bookingsByDate={bookingsByDate}
            onShowHistory={handleShowHistory}
            onOpenBooking={handleOpenBooking}
            onNewBookingForHuman={onNewBookingForHuman}
          />
        </div>

        {/* One locked section order — Dogs, Contact, Channels, Trusted,
            Reminders, Notes — in every layout. The @container splits it into
            two balanced columns once the modal itself is wide enough (≈iPad
            landscape up), NOT the viewport: the modal width is capped/decoupled
            from the viewport above sm, so a container query is the honest test.
            Reading down the left column then the right == the single-column
            stack, so no `order-*` hack and visual order == DOM == tab order. */}
        <div className="@container">
          <div className="grid grid-cols-1 @3xl:grid-cols-2 gap-3 @3xl:gap-4 items-start">
            {/* Column 1 — Dogs, Contact, Channels */}
            <div className="flex flex-col gap-3 min-h-0">
              <DogsPanel
                human={human}
                dogs={dogs}
                dogsByHumanId={dogsByHumanId}
                trustedOwnerIds={trustedOwnerIds}
                bookingsByDate={bookingsByDate}
                onClose={onClose}
                onOpenDog={onOpenDog}
                actions={
                  human.id ? (
                    <LinkDogActions
                      human={human}
                      humans={humans}
                      dogs={dogs}
                      onAddOwnedDog={onAddDog ? () => setShowAddDog(true) : undefined}
                      onLinkTrustedOnDog={onUpdateHuman ? handleLinkTrustedOnDog : undefined}
                    />
                  ) : null
                }
              />
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
            </div>

            {/* Column 2 — Trusted, Reminders, Notes. Notes keeps its flex-1
                grow so it absorbs the leftover height at the column bottom. */}
            <div className="flex flex-col gap-3 min-h-0">
              <TrustedHumansPanel
                human={human}
                humans={humans}
                onClose={onClose}
                onOpenHuman={onOpenHuman}
                onUpdateHuman={onUpdateHuman}
                onAddHuman={onAddHuman}
                findHumanByFullName={findHumanByFullName}
                searchHumansByTerm={searchHumansByTerm}
              />
              <RemindersPanel human={human} onUpdateHuman={onUpdateHuman} />
              <AiMessagingPanel human={human} onUpdateHuman={onUpdateHuman} />
              <BookingRulesPanel human={human} onUpdateHuman={onUpdateHuman} />
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
            onBookAgain={onBookAgain}
            onNewBookingForHuman={onNewBookingForHuman}
          />
        </div>

        {/* Read-only timeline of cancellations / reschedules / completions
            etc. for this owner's dogs. Actions stay in the booking detail. */}
        <div className="mt-3 md:mt-4">
          <HumanEventTimeline
            human={human}
            dogs={dogs}
            dogsByHumanId={dogsByHumanId}
          />
        </div>
      </ModalShell>

      {pendingExit && (
        <ConfirmDialog
          title="Throw away changes?"
          message="Your edits haven't been saved yet."
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
          message="They'll be removed from the directory — dogs, bookings, photos all go too. WhatsApp chats stay, but you'll lose the link. This can't be undone."
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
          message="They'll vanish from the directory and search — but their dogs, bookings, and history stay. You can pull them back anytime via the archive view."
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
              toast.show("Couldn't archive that one — give it another go", "error");
            }
          }}
          onCancel={() => setPendingArchive(false)}
        />
      )}

      {pendingLink && (
        <ConfirmDialog
          title={`Link this signup to ${humanFullName}?`}
          message={`${pendingLink.phone} was verified through a portal signup that isn't linked to anyone yet. Linking puts that number and login on ${humanFullName}'s record, approves them to book, and removes the placeholder.`}
          confirmLabel={linking ? "Linking…" : "Link and update number"}
          cancelLabel="Not now"
          variant="primary"
          pending={linking}
          onConfirm={handleConfirmLink}
          onCancel={handleCancelLink}
        />
      )}

      {pendingReject && (
        <RejectSignupDialog
          busy={signupBusy}
          onCancel={() => setPendingReject(false)}
          onConfirm={handleRejectSignup}
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

      {showAddDog && onAddDog && (
        <AddDogModal
          onClose={() => setShowAddDog(false)}
          onAdd={onAddDog}
          onAddHuman={onAddHuman}
          humans={humans}
          presetOwner={{ id: human.id, label: humanFullName, phone: human.phone }}
        />
      )}
    </>
  );
}
