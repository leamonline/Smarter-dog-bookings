import { useState, useEffect } from "react";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import { supabase } from "../../supabase/client.js";
import { SIZE_THEME, SIZE_FALLBACK, SERVICES } from "../../constants/index.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";

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
  sizeTheme,
  onClose,
  onRemove,
  onCloseParent,
}) {
  const toast = useToast();
  const [chainBookings, setChainBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCancelAll, setShowCancelAll] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!supabase || !chainId) return;

    async function fetchChain() {
      setLoading(true);
      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_date, slot, service, size, status")
        .eq("group_id", chainId)
        .order("booking_date")
        .order("slot");

      if (!error && data) {
        setChainBookings(data);
      }
      setLoading(false);
    }

    fetchChain();
  }, [chainId]);

  const today = new Date().toISOString().slice(0, 10);
  const futureBookings = chainBookings.filter(
    (b) => b.booking_date >= today && b.id !== currentBookingId,
  );

  const handleCancelFuture = async () => {
    setCancelling(true);
    const ids = futureBookings.map((b) => b.id);

    if (supabase && ids.length > 0) {
      const { error } = await supabase
        .from("bookings")
        .delete()
        .in("id", ids);

      if (error) {
        toast.show("Failed to cancel series", "error");
        setCancelling(false);
        return;
      }
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

  const theme = sizeTheme || SIZE_FALLBACK;

  return (
    <AccessibleModal
      onClose={onClose}
      titleId="recurring-booking-title"
      className="bg-white rounded-2xl w-[min(440px,95vw)] max-h-[85vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
    >
      <div className="px-6 py-5">
        <h2
          id="recurring-booking-title"
          className="text-lg font-extrabold text-slate-800 mb-1"
        >
          Recurring Series — {dogName}
        </h2>
        <p className="text-[13px] text-slate-500 mb-5">
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

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-[10px] border-[1.5px] border-slate-200 bg-white text-slate-800 text-[13px] font-bold cursor-pointer font-inherit"
          >
            Close
          </button>
          {futureBookings.length > 0 && (
            <button
              onClick={() => setShowCancelAll(true)}
              disabled={cancelling}
              className="px-5 py-2.5 rounded-[10px] border-none bg-brand-coral text-white text-[13px] font-bold cursor-pointer font-inherit disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              Cancel Future ({futureBookings.length})
            </button>
          )}
        </div>
      </div>

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
    </AccessibleModal>
  );
}
