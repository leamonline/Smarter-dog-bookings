// Pinned phone-only action bar for the Human card (Debt 7; pure move out
// of HumanCardModal.jsx): the primary CTA stays in thumb reach while the
// profile scrolls. Desktop gets the same CTA in the booking history panel
// header instead, so this is `sm:hidden`. Rendered as the modal footer in
// view mode only; edit mode swaps in HumanEditFooter.
import { Plus } from "lucide-react";

export function MobileNewBookingBar({ onNewBooking }) {
  return (
    <div className="sm:hidden border-t border-slate-100 bg-white px-4 py-2.5">
      <button
        type="button"
        onClick={onNewBooking}
        className="w-full inline-flex items-center justify-center gap-1.5 py-3 min-h-[44px] rounded-full border-none text-sm font-bold font-inherit cursor-pointer transition-colors bg-action text-on-action hover:bg-brand-yellow-dark"
      >
        <Plus size={15} strokeWidth={2.6} aria-hidden="true" />
        New booking
      </button>
    </div>
  );
}
