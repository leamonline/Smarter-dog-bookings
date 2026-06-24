import { useState } from "react";
import { X } from "lucide-react";
import { ModalShell, HeaderIconButton } from "./shell/index.js";
import { SIZE_THEME, SIZE_FALLBACK, SERVICES } from "../../constants/index";
import { useToast } from "../../contexts/ToastContext.jsx";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { useGroupBookings } from "../../supabase/hooks/useGroupBookings.js";

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function RecurringBookingModal({
  chainId,
  currentBookingId,
  dogName,
  onClose,
  onCloseParent,
}) {
  const toast = useToast();
  const { chainBookings, loading, cancelBookings } = useGroupBookings(chainId);
  const [showCancelAll, setShowCancelAll] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const futureBookings = chainBookings.filter(
    (b) => b.booking_date >= today && b.id !== currentBookingId,
  );

  // Accent the shell with the current booking's size colour (loads with the
  // chain; falls back to neutral until then) — same idiom as the cards.
  const currentBooking = chainBookings.find((b) => b.id === currentBookingId);
  const accentColour = (SIZE_THEME[currentBooking?.size] || SIZE_FALLBACK).primary;

  const handleCancelFuture = async () => {
    setCancelling(true);
    const ids = futureBookings.map((b) => b.id);

    const result = await cancelBookings(ids);
    if (!result.success) {
      toast.show("Failed to cancel series", "error");
      setCancelling(false);
      return;
    }

    toast.show(
      `${ids.length} future booking${ids.length === 1 ? "" : "s"} cancelled`,
      "success",
    );
    setCancelling(false);
    setShowCancelAll(false);
    onClose();
    if (onCloseParent) onCloseParent();
  };

  return (
    <>
    <ModalShell
      onClose={onClose}
      titleId="recurring-booking-title"
      accent={accentColour}
      widthClass="w-[min(440px,95vw)]"
      maxHeightClass="max-h-[85vh]"
      bodyClassName="px-6 pt-4 pb-3"
      header={
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 bg-[var(--color-brand-paper)]">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Recurring series
            </span>
            <h2
              id="recurring-booking-title"
              className="text-xl md:text-2xl font-bold font-display text-brand-purple leading-tight mt-1 truncate"
            >
              {dogName}
            </h2>
          </div>
          <HeaderIconButton label="Close" onClick={onClose}>
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        </header>
      }
      footer={
        <div className="border-t border-slate-100 bg-white px-5 py-3 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 max-sm:min-h-[44px] rounded-control border-[1.5px] border-slate-200 bg-white text-slate-600 text-sm font-bold cursor-pointer font-inherit transition-colors hover:bg-slate-50 inline-flex items-center justify-center"
          >
            Close
          </button>
          {futureBookings.length > 0 && (
            <button
              type="button"
              onClick={() => setShowCancelAll(true)}
              disabled={cancelling}
              className="ml-auto px-5 py-2 max-sm:min-h-[44px] rounded-full border-none bg-brand-coral text-white text-sm font-bold cursor-pointer font-inherit transition-colors hover:bg-[#d14468] disabled:cursor-not-allowed disabled:bg-slate-400 inline-flex items-center justify-center"
            >
              Cancel future ({futureBookings.length})
            </button>
          )}
        </div>
      }
    >
        <p className="text-[13px] text-slate-500 mb-4">
          All bookings in this recurring chain.
        </p>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400 font-semibold">
            Loading series...
          </div>
        ) : chainBookings.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400 font-semibold">
            No bookings found in this series.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 mb-5">
            {chainBookings.map((b) => {
              const svc = SERVICES.find((s) => s.id === b.service);
              const isCurrent = b.id === currentBookingId;
              const isPast = b.booking_date < today;
              const bTheme = SIZE_THEME[b.size] || SIZE_FALLBACK;

              return (
                <div
                  key={b.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                    isCurrent
                      ? "border-2 bg-slate-50"
                      : isPast
                        ? "border-slate-100 bg-slate-50/50 opacity-60"
                        : "border-slate-200 bg-white"
                  }`}
                  style={
                    isCurrent
                      ? { borderColor: bTheme.primary }
                      : undefined
                  }
                >
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: bTheme.primary }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-slate-800">
                      {formatDate(b.booking_date)}
                    </div>
                    <div className="text-[12px] text-slate-500">
                      {b.slot} — {svc?.name || b.service}
                    </div>
                  </div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase shrink-0">
                    {isCurrent
                      ? "Current"
                      : isPast
                        ? b.status
                        : b.status}
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </ModalShell>

      {showCancelAll && (
        <ConfirmDialog
          title="Cancel all future bookings?"
          message={`This will remove ${futureBookings.length} upcoming booking${futureBookings.length === 1 ? "" : "s"} from the series.`}
          confirmLabel="Cancel all future"
          variant="danger"
          onConfirm={handleCancelFuture}
          onCancel={() => setShowCancelAll(false)}
        />
      )}
    </>
  );
}
