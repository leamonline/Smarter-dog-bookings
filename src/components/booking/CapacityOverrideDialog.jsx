import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";

// Both staff booking entry points require the same explicit capacity decision.
export function CapacityOverrideDialog({ reason, onConfirm, onCancel }) {
  return (
    <ConfirmDialog
      title="This booking breaks the capacity rule"
      message={`${reason || "This time is fully booked"}. Override the capacity rule and book anyway?`}
      confirmLabel="Override and book"
      cancelLabel="Pick another time"
      variant="primary"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
