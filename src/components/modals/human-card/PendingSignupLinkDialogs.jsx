// The two confirm prompts behind usePendingSignupLink: "Link this signup?"
// after a phone collision, and "Link to <name>?" for a shell that claims an
// existing customer. Rendered by HumanCardModal alongside its other dialogs.
import { ConfirmDialog } from "../../shared/ConfirmDialog.jsx";

export function PendingSignupLinkDialogs({ link, humanFullName, phone }) {
  const {
    pendingLink,
    linking,
    handleConfirmLink,
    handleCancelLink,
    pendingClaimLink,
    claimedHuman,
    claimedName,
    handleConfirmClaimLink,
    closeClaimLink,
  } = link;

  return (
    <>
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

      {pendingClaimLink && claimedHuman && (
        <ConfirmDialog
          title={`Link this signup to ${claimedName}?`}
          message={`${phone || "This number"} was verified by this signup, and the customer says they're ${claimedName}. Linking moves the number, the portal login and any dogs they entered onto ${claimedName}'s record, approves them to book, and removes this placeholder.`}
          confirmLabel={linking ? "Linking…" : "Link and approve"}
          cancelLabel="Not now"
          variant="primary"
          pending={linking}
          onConfirm={handleConfirmClaimLink}
          onCancel={closeClaimLink}
        />
      )}
    </>
  );
}
