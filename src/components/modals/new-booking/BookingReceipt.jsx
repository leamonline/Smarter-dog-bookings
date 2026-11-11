import { useBookingConfirmation } from "../../../supabase/hooks/useBookingConfirmation";
import { Button } from "../../ui";
import { useEffect, useRef } from "react";

const STATES = {
  pending: ["Confirmation pending", "Delivery has not been confirmed yet."],
  accepted: ["Confirmation sent — delivery unconfirmed", "The service accepted the message. This does not confirm that it reached the customer."],
  delivered: ["Confirmation delivered", "Delivery receipts confirm the message reached every selected recipient."],
  failed: ["Confirmation failed for one or more recipients", "The booking is saved. Check the contact details. A message-only retry is available once all send outcomes are known."],
  unknown: ["Confirmation outcome unknown", "The message may have arrived. Check the customer conversation before sending again."],
};

export function BookingReceipt({ receipt, onClose, onBookAnother }) {
  const headingRef = useRef(null);
  useEffect(() => { headingRef.current?.focus(); }, []);
  const status = useBookingConfirmation(receipt.bookingIds, receipt.humanIds, !receipt.suppressed && !receipt.awaitingDeposit);
  const unavailable = !receipt.bookingIds.length;
  const [title, detail] = receipt.suppressed
    ? ["Confirmation not requested", "You chose to create this booking without messaging the customer."]
    : receipt.awaitingDeposit
      ? ["Confirmation held for deposit", "The standard confirmation is not sent while the booking awaits its deposit."]
      : status.sample
        ? ["Sample data — no message sent", "Message delivery is not simulated. No customer has been contacted."]
        : unavailable
          ? ["Confirmation status unavailable", "The saved booking IDs were not returned. Check the booking before sending a message."]
          : STATES[status.state];
  return (
    <>
      <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0 space-y-4">
        <section className="rounded-card border border-brand-paper-line bg-white p-4" aria-labelledby="booking-created-title">
          <h2 ref={headingRef} id="booking-created-title" className="text-lg font-extrabold text-brand-teal-text m-0" tabIndex={-1}>Booking created</h2>
          <p className="mt-2 mb-0 text-sm font-semibold text-brand-ink">{receipt.summary}</p>
          <p className="mt-1 mb-0 text-sm text-slate-600">{receipt.count > 1 ? `${receipt.count} bookings saved.` : "Your booking is saved."}</p>
        </section>
        <section role="status" aria-live="polite" className="rounded-card border border-brand-paper-line bg-white p-4">
          <h3 className="m-0 text-sm font-bold text-brand-ink">{title}</h3>
          <p className="mt-2 mb-0 text-sm text-slate-600">{detail}</p>
          {status.error && <p role="alert" className="mt-2 text-sm text-brand-coral-text">{status.error}</p>}
        </section>
        {!receipt.suppressed && !receipt.awaitingDeposit && !status.sample && !unavailable && (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => { void status.refresh(); }}>Refresh message status</Button>
            {status.retryBookingIds.length > 0 && !status.error && (
              <Button variant="ghost" disabled={status.retrying} onClick={() => { void status.retry(); }}>
                {status.retrying ? "Retrying confirmation…" : "Retry confirmation only"}
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0 px-6 pt-3 pb-5 border-t border-brand-paper-line flex flex-wrap gap-2 bg-[var(--color-brand-paper)] max-sm:pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <Button variant="primary" onClick={onClose}>Done</Button>
        {onBookAnother && receipt.ownerId && <Button variant="ghost" onClick={() => { onClose(); onBookAnother(receipt.ownerId); }}>Book another for {receipt.ownerName}</Button>}
      </div>
    </>
  );
}
