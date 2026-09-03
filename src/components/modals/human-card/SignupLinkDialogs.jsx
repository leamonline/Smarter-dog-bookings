// The two confirms that end in link_pending_signup(), rendered by
// HumanCardModal from usePendingSignupLink's state. Sibling of
// RejectSignupDialog; the hook holds the flow, these hold the copy.
//
//  • PhoneLinkSignupDialog — staff put a number on THIS record and it
//    collided with an unapproved portal signup shell that holds it.
//  • ClaimSignupDialog — THIS record IS the shell, and the customer's typed
//    name matched an existing customer (humans.claims_human_id).
//
// Either way the DB function moves the verified number, the portal login and
// any dogs entered at signup onto the kept record and deletes the shell.
import { ConfirmDialog } from "../../shared/ConfirmDialog.jsx";

/**
 * Renders whichever of the two prompts usePendingSignupLink currently wants
 * (at most one is ever open), so the card body stays a layout shell.
 */
export function SignupLinkDialogs({ link, humanFullName, phone }) {
  if (link.pendingLink) {
    return (
      <PhoneLinkSignupDialog
        humanFullName={humanFullName}
        phone={link.pendingLink.phone}
        pending={link.linking}
        onConfirm={link.handleConfirmLink}
        onCancel={link.handleCancelLink}
      />
    );
  }
  if (link.pendingClaimLink && link.claimedHuman) {
    return (
      <ClaimSignupDialog
        claimedName={link.claimedName}
        phone={phone}
        pending={link.linking}
        onConfirm={link.handleConfirmClaimLink}
        onCancel={link.closeClaimLink}
      />
    );
  }
  return null;
}

export function PhoneLinkSignupDialog({ humanFullName, phone, pending, onConfirm, onCancel }) {
  return (
    <ConfirmDialog
      title={`Link this signup to ${humanFullName}?`}
      message={`${phone} was verified through a portal signup that isn't linked to anyone yet. Linking puts that number and login on ${humanFullName}'s record, approves them to book, and removes the placeholder.`}
      confirmLabel={pending ? "Linking…" : "Link and update number"}
      cancelLabel="Not now"
      variant="primary"
      pending={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export function ClaimSignupDialog({ claimedName, phone, pending, onConfirm, onCancel }) {
  return (
    <ConfirmDialog
      title={`Link this signup to ${claimedName}?`}
      message={`${phone || "This number"} was verified by this signup, and the customer says they're ${claimedName}. Linking moves the number, the portal login and any dogs they entered onto ${claimedName}'s record, approves them to book, and removes this placeholder.`}
      confirmLabel={pending ? "Linking…" : "Link and approve"}
      cancelLabel="Not now"
      variant="primary"
      pending={pending}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
