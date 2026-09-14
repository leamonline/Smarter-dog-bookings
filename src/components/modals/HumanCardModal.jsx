import { useCallback, useEffect, useRef, useState } from "react";
import { ModalShell } from "./shell/index.js";
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
  SignupLinkDialogs,
  useHumanDraft,
  useHumanCardActions,
  useResolvedHuman,
  useTrustedOwnerLinks,
  usePendingSignupLink,
  useHumanRemoval,
  HumanCardConfirmDialogs,
  MobileNewBookingBar,
} from "./human-card/index.js";
import { AddDogModal } from "./AddDogModal.jsx";

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
  const [pendingExit, setPendingExit] = useState(false);

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

  // Incoming trusted-owner links + "link this human on a dog" — the
  // directional trust logic lives in useTrustedOwnerLinks (Debt 7).
  const { trustedOwnerIds, handleLinkTrustedOnDog } = useTrustedOwnerLinks({
    human,
    humanId,
    humans,
    humanFullName,
    onUpdateHuman,
    ensureDogsForHumans,
  });

  const [showAddDog, setShowAddDog] = useState(false);

  // A phone save lost to humans_phone_unique: link a pending portal signup
  // shell onto this record, or name the customer who holds the number.
  const signupLink = usePendingSignupLink({
    human,
    humanId,
    humanFullName,
    humans,
    fetchHumanById,
    findHumanByPhone,
    onLinkPendingSignup,
    onUpdateHuman,
    onOpenHuman,
  });
  const { linking, handlePhoneTaken } = signupLink;

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

  // Delete / archive confirm step: the parent call, the toast, and the
  // close-on-success live in useHumanRemoval (Debt 7).
  const {
    pendingDelete,
    requestDelete,
    cancelDelete,
    confirmDelete,
    cancelArchive,
    confirmArchive,
  } = useHumanRemoval({
    human,
    humanId,
    onClose,
    onDeleteHuman,
    onArchiveHuman,
    setPendingArchive,
  });

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
    shortcutPaused: pendingDelete || pendingExit || signupLink.dialogOpen,
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

  // Phone-only pinned CTA in view mode; edit mode swaps in HumanEditFooter.
  const mobileActionBar =
    !isEditing && onNewBookingForHuman ? (
      <MobileNewBookingBar onNewBooking={() => onNewBookingForHuman(human.id)} />
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
            signupBusy={signupBusy || linking}
            onApproveSignup={handleApproveSignup}
            onRejectSignup={() => setPendingReject(true)}
            claimedHuman={signupLink.claimedHuman}
            onLinkClaimedSignup={signupLink.openClaimLink}
          />
        }
        footer={
          isEditing ? (
            <HumanEditFooter
              dirty={dirty}
              saving={saving}
              onCancel={cancelEdit}
              onSave={saveHuman}
              onDelete={requestDelete}
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

      <HumanCardConfirmDialogs
        pendingExit={pendingExit}
        onDiscardEdits={() => {
          setPendingExit(false);
          cancelEdit();
          onClose?.();
        }}
        onKeepEditing={() => setPendingExit(false)}
        pendingDelete={pendingDelete}
        onConfirmDelete={confirmDelete}
        onCancelDelete={cancelDelete}
        pendingArchive={pendingArchive}
        onConfirmArchive={confirmArchive}
        onCancelArchive={cancelArchive}
      />

      <SignupLinkDialogs
        link={signupLink}
        humanFullName={humanFullName}
        phone={human.phone}
      />

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
