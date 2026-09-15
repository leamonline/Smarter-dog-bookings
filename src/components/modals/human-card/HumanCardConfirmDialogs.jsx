// The three "are you sure?" dialogs of the Human card (Debt 7; pure move
// out of HumanCardModal.jsx): discard unsaved edits, delete, archive. The
// flags and handlers stay with their owning hooks (useHumanDraft /
// useHumanRemoval / useHumanCardActions); this only renders whichever
// dialog is pending. At most one is open at a time in practice, but the
// component makes no such assumption.
import { ConfirmDialog } from "../../shared/ConfirmDialog.jsx";

export function HumanCardConfirmDialogs({
  pendingExit,
  onDiscardEdits,
  onKeepEditing,
  pendingDelete,
  onConfirmDelete,
  onCancelDelete,
  pendingArchive,
  onConfirmArchive,
  onCancelArchive,
}) {
  return (
    <>
      {pendingExit && (
        <ConfirmDialog
          title="Throw away changes?"
          message="Your edits haven't been saved yet."
          confirmLabel="Discard"
          cancelLabel="Keep editing"
          variant="danger"
          onConfirm={onDiscardEdits}
          onCancel={onKeepEditing}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this person?"
          message="They'll be removed from the directory — dogs, bookings, photos all go too. WhatsApp chats stay, but you'll lose the link. This can't be undone."
          confirmLabel="Delete person"
          variant="danger"
          onConfirm={onConfirmDelete}
          onCancel={onCancelDelete}
        />
      )}

      {pendingArchive && (
        <ConfirmDialog
          title="Archive this person?"
          message="They'll vanish from the directory and search — but their dogs, bookings, and history stay. You can pull them back anytime via the archive view."
          confirmLabel="Archive"
          cancelLabel="Cancel"
          variant="primary"
          onConfirm={onConfirmArchive}
          onCancel={onCancelArchive}
        />
      )}
    </>
  );
}
