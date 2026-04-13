// src/components/modals/ChainBookingModal.jsx
import { useState, useMemo, useCallback } from "react";
import { SERVICES, SALON_SLOTS, PRICING } from "../../constants/index.js";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import { useSalon } from "../../contexts/SalonContext.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { canBookSlot } from "../../engine/capacity.js";
import { toDateStr } from "../../supabase/transforms.js";

const SIZES = ["small", "medium", "large"];
const MAX_CHAIN = 10;

function addWeeks(date, weeks) {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

function formatDate(date) {
  return date.toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

export function ChainBookingModal({ dog, lastBooking, onClose, onCreateChain }) {
  const toast = useToast();

  const { bookingsByDate, daySettings } = useSalon();

  // Template defaults from last booking
  const [service, setService] = useState(lastBooking?.service || "full-groom");
  const [slot, setSlot] = useState(lastBooking?.slot || "09:00");
  const [size, setSize] = useState(lastBooking?.size || dog?.size || "medium");

  // Chain links already added
  const [chain, setChain] = useState([]);

  // Current input
  const [weeksGap, setWeeksGap] = useState("");

  // Per-link overrides
  const [linkService, setLinkService] = useState(service);
  const [linkSlot, setLinkSlot] = useState(slot);
  const [linkSize, setLinkSize] = useState(size);

  const [creating, setCreating] = useState(false);

  // Anchor date: last chain link's date, or today
  const anchorDate = chain.length > 0 ? chain[chain.length - 1].date : new Date();

  // Calculated date for current input
  const weeksNum = parseInt(weeksGap, 10);
  const calculatedDate = weeksNum > 0 ? addWeeks(anchorDate, weeksNum) : null;

  // Check slot availability for calculated date
  const availabilityWarning = useMemo(() => {
    if (!calculatedDate) return null;
    const dateStr = toDateStr(calculatedDate);
    const dayBookings = bookingsByDate[dateStr] || [];
    if (dayBookings.length === 0) return null; // No data loaded = assume fine
    const settings = daySettings?.[dateStr] || { overrides: {}, extraSlots: [] };
    const activeSlots = [...SALON_SLOTS, ...(settings.extraSlots || [])];
    const result = canBookSlot(dayBookings, linkSlot, linkSize, activeSlots, {
      overrides: settings.overrides?.[linkSlot] || {},
    });
    return result.allowed ? null : `This slot may be full on ${formatDate(calculatedDate)}`;
  }, [calculatedDate, linkSlot, linkSize, bookingsByDate, daySettings]);

  const addLink = useCallback(() => {
    if (!calculatedDate || chain.length >= MAX_CHAIN) return;
    setChain((prev) => [
      ...prev,
      {
        date: calculatedDate,
        dateStr: toDateStr(calculatedDate),
        service: linkService,
        slot: linkSlot,
        size: linkSize,
      },
    ]);
    setWeeksGap("");
    // Carry forward current template for next link
  }, [calculatedDate, linkService, linkSlot, linkSize, chain.length]);

  const removeLink = useCallback((idx) => {
    setChain((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleConfirmAll = async () => {
    if (chain.length === 0) return;
    setCreating(true);
    await onCreateChain(chain);
    setCreating(false);
    toast.show(`${chain.length} booking${chain.length === 1 ? "" : "s"} created`, "success");
    onClose();
  };

  const price = PRICING[linkService]?.[linkSize] || "";

  const selectCls = "px-2.5 py-2 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-semibold font-inherit bg-white text-slate-800 cursor-pointer";

  return (
    <AccessibleModal
      onClose={onClose}
      titleId="chain-booking-title"
      className="bg-white rounded-2xl w-[min(460px,95vw)] max-h-[85vh] overflow-auto px-7 py-6 shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
    >
        {/* Header */}
        <div id="chain-booking-title" className="text-lg font-extrabold text-slate-800 mb-1">
          Recurring Bookings — {dog?.name || "Dog"}
        </div>
        <div className="text-[13px] text-slate-500 mb-5">
          Build a chain of future appointments. Each one counts from the last.
        </div>

        {/* Template row */}
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          <select value={linkService} onChange={(e) => setLinkService(e.target.value)} className={selectCls}>
            {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={linkSlot} onChange={(e) => setLinkSlot(e.target.value)} className={selectCls}>
            {SALON_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={linkSize} onChange={(e) => setLinkSize(e.target.value)} className={selectCls}>
            {SIZES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          {price && (
            <span className="text-sm font-extrabold text-brand-teal">{price}</span>
          )}
        </div>

        {/* Weeks input */}
        {chain.length < MAX_CHAIN && (
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-sm font-semibold text-slate-800">Book in</span>
            <input
              type="number"
              min="1"
              max="52"
              value={weeksGap}
              onChange={(e) => setWeeksGap(e.target.value)}
              placeholder="—"
              className={`${selectCls} w-[60px] text-center`}
            />
            <span className="text-sm font-semibold text-slate-800">weeks' time</span>
            {calculatedDate && (
              <span className="text-[13px] font-bold text-brand-blue">
                → {formatDate(calculatedDate)}
              </span>
            )}
          </div>
        )}

        {/* Availability warning */}
        {availabilityWarning && (
          <div className="px-3 py-2 rounded-lg mb-2 bg-amber-50 text-amber-800 text-xs font-bold flex items-center gap-1.5">
            <span className="text-base">⚠</span> {availabilityWarning}
          </div>
        )}

        {/* Add button */}
        {calculatedDate && chain.length < MAX_CHAIN && (
          <button
            onClick={addLink}
            className="px-4 py-2 rounded-lg border-none bg-brand-blue text-white text-[13px] font-bold cursor-pointer font-inherit mb-4"
          >
            Add to chain
          </button>
        )}

        {/* Chain list */}
        {chain.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-bold text-slate-500 mb-2">
              Chain ({chain.length}/{MAX_CHAIN})
            </div>
            {chain.map((link, idx) => {
              const svc = SERVICES.find((s) => s.id === link.service);
              return (
                <div
                  key={idx}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-lg mb-1 bg-slate-50 border border-slate-200"
                >
                  <span className="text-[13px] font-extrabold text-slate-800 w-5">
                    {idx + 1}.
                  </span>
                  <span className="text-[13px] font-semibold text-slate-800 flex-1">
                    {formatDate(link.date)} — {link.slot} — {svc?.name || link.service}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    {link.size}
                  </span>
                  <button
                    onClick={() => removeLink(idx)}
                    className="w-6 h-6 rounded-md border-none bg-brand-coral-light text-brand-coral text-sm font-bold cursor-pointer flex items-center justify-center font-inherit"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-[10px] border-[1.5px] border-slate-200 bg-white text-slate-800 text-[13px] font-bold cursor-pointer font-inherit"
          >
            Cancel
          </button>
          {chain.length > 0 && (
            <button
              onClick={handleConfirmAll}
              disabled={creating}
              className={`px-5 py-2.5 rounded-[10px] border-none text-white text-[13px] font-bold cursor-pointer font-inherit disabled:cursor-not-allowed ${creating ? "bg-slate-500" : "bg-brand-blue"}`}
            >
              {creating ? "Creating..." : `Confirm All (${chain.length})`}
            </button>
          )}
        </div>
    </AccessibleModal>
  );
}
