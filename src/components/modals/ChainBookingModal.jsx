// src/components/modals/ChainBookingModal.jsx
import { useState, useMemo, useCallback } from "react";
import {
  SERVICES,
  SALON_SLOTS,
  SIZE_THEME,
  SIZE_FALLBACK,
} from "../../constants/index.js";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import { useSalon } from "../../contexts/SalonContext.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { canBookSlot } from "../../engine/capacity.js";
import { toDateStr } from "../../supabase/transforms.js";
import {
  getNumericPrice,
  getServicePriceLabel,
  getAllowedServicesForSize,
} from "../../engine/bookingRules.js";
import { SectionCard } from "./booking-detail/shared.jsx";

const MAX_CHAIN = 10;

function addWeeks(date, weeks) {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

function formatDate(date) {
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ChainBookingModal({
  dog,
  lastBooking,
  onClose,
  onCreateChain,
  onUpdateDog,
}) {
  const toast = useToast();
  const { bookingsByDate, daySettings } = useSalon();

  const dogSize = dog?.size || lastBooking?.size || "medium";
  const sizeTheme = SIZE_THEME[dogSize] || SIZE_FALLBACK;
  const allowedServices = useMemo(
    () => getAllowedServicesForSize(dogSize),
    [dogSize],
  );

  // ── Service & price ──
  const [service, setService] = useState(
    lastBooking?.service || "full-groom",
  );
  const defaultPrice =
    dog?.customPrice ??
    getNumericPrice(getServicePriceLabel(service, dogSize));
  const [customPrice, setCustomPrice] = useState(defaultPrice);

  // ── Chain of booked appointments ──
  const [chain, setChain] = useState([]);
  const [creating, setCreating] = useState(false);

  // ── First appointment: date + slot ──
  const preferredSlot = lastBooking?.slot || "09:00";
  const [firstDateStr, setFirstDateStr] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return toDateStr(d);
  });
  const [firstSlot, setFirstSlot] = useState(preferredSlot);

  // ── "Add another" state ──
  const [weeksGap, setWeeksGap] = useState("6");

  // When preferred slot isn't available, show alternatives
  const [slotPickerFor, setSlotPickerFor] = useState(null);

  // ── Helpers ──
  const getAvailableSlots = useCallback(
    (dateStr) => {
      const dayBookings = bookingsByDate[dateStr] || [];
      const settings = daySettings?.[dateStr] || {
        overrides: {},
        extraSlots: [],
      };
      const activeSlots = [
        ...SALON_SLOTS,
        ...(settings.extraSlots || []),
      ];

      return activeSlots.filter((slot) => {
        const result = canBookSlot(dayBookings, slot, dogSize, activeSlots, {
          overrides: settings.overrides?.[slot] || {},
        });
        return result.allowed;
      });
    },
    [bookingsByDate, daySettings, dogSize],
  );

  const firstDateSlots = useMemo(
    () => getAvailableSlots(firstDateStr),
    [firstDateStr, getAvailableSlots],
  );

  // ── Actions ──
  const addFirstAppointment = useCallback(() => {
    if (!firstSlot || !firstDateStr) return;
    const date = new Date(firstDateStr + "T00:00:00");
    setChain([
      {
        date,
        dateStr: firstDateStr,
        service,
        slot: firstSlot,
        size: dogSize,
      },
    ]);
  }, [firstSlot, firstDateStr, service, dogSize]);

  const addNextAppointment = useCallback(() => {
    const weeksNum = parseInt(weeksGap, 10);
    if (!weeksNum || weeksNum < 1 || chain.length >= MAX_CHAIN) return;

    const lastLink = chain[chain.length - 1];
    const nextDate = addWeeks(lastLink.date, weeksNum);
    const nextDateStr = toDateStr(nextDate);
    const available = getAvailableSlots(nextDateStr);

    if (available.includes(lastLink.slot)) {
      setChain((prev) => [
        ...prev,
        {
          date: nextDate,
          dateStr: nextDateStr,
          service,
          slot: lastLink.slot,
          size: dogSize,
        },
      ]);
      toast.show(
        `Booked ${formatDate(nextDate)} at ${lastLink.slot}`,
        "success",
      );
    } else if (available.length > 0) {
      setSlotPickerFor({
        date: nextDate,
        dateStr: nextDateStr,
        availableSlots: available,
      });
    } else {
      toast.show(
        `No slots available on ${formatDate(nextDate)}`,
        "error",
      );
    }
  }, [weeksGap, chain, service, dogSize, getAvailableSlots, toast]);

  const pickAlternativeSlot = useCallback(
    (slot) => {
      if (!slotPickerFor) return;
      setChain((prev) => [
        ...prev,
        {
          date: slotPickerFor.date,
          dateStr: slotPickerFor.dateStr,
          service,
          slot,
          size: dogSize,
        },
      ]);
      toast.show(
        `Booked ${formatDate(slotPickerFor.date)} at ${slot}`,
        "success",
      );
      setSlotPickerFor(null);
    },
    [slotPickerFor, service, dogSize, toast],
  );

  const removeLink = useCallback((idx) => {
    // Remove this item and everything after it (chain is sequential)
    setChain((prev) => prev.slice(0, idx));
    setSlotPickerFor(null);
  }, []);

  const handleDone = async () => {
    if (chain.length === 0) return;
    setCreating(true);

    if (onUpdateDog && customPrice !== defaultPrice) {
      await onUpdateDog(dog.id || dog.name, { customPrice });
    }

    await onCreateChain(chain);
    setCreating(false);
    toast.show(
      `${chain.length} booking${chain.length === 1 ? "" : "s"} created`,
      "success",
    );
    onClose();
  };

  const serviceObj = SERVICES.find((s) => s.id === service);
  const inputCls =
    "px-3 py-2 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-semibold font-inherit bg-white text-slate-800";

  return (
    <AccessibleModal
      onClose={onClose}
      titleId="chain-booking-title"
      className="bg-white rounded-2xl w-[min(420px,95vw)] max-h-[90vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
    >
      {/* ── Gradient header ── */}
      <div
        className="px-6 py-5 rounded-t-2xl"
        style={{
          background: `linear-gradient(135deg, ${sizeTheme.gradient[0]}, ${sizeTheme.gradient[1]})`,
        }}
      >
        <div className="flex justify-between items-start">
          <div>
            <div
              id="chain-booking-title"
              className="text-[22px] font-extrabold leading-tight"
              style={{ color: sizeTheme.headerText }}
            >
              Recurring Bookings
            </div>
            <div
              className="text-[14px] font-medium mt-0.5"
              style={{ color: sizeTheme.headerTextSub }}
            >
              {dog?.name || "Dog"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="bg-white/20 border-none rounded-lg w-9 h-9 flex items-center justify-center cursor-pointer text-base font-bold shrink-0"
            style={{ color: sizeTheme.headerText }}
          >
            {"\u00D7"}
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="px-4 pt-4 pb-2" style={{ background: sizeTheme.light }}>
        {/* Service & Price */}
        <SectionCard title="Service & Price">
          <div className="flex items-center gap-3 py-1">
            <select
              value={service}
              onChange={(e) => {
                setService(e.target.value);
                const newDefault =
                  dog?.customPrice ??
                  getNumericPrice(
                    getServicePriceLabel(e.target.value, dogSize),
                  );
                setCustomPrice(newDefault);
              }}
              className={`${inputCls} flex-1 cursor-pointer`}
            >
              {allowedServices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <span className="text-[14px] font-bold text-slate-500">
                {"\u00A3"}
              </span>
              <input
                type="number"
                min="0"
                value={customPrice}
                onChange={(e) => setCustomPrice(Number(e.target.value))}
                className={`${inputCls} w-[70px] text-center`}
              />
            </div>
          </div>
        </SectionCard>

        {/* ── First appointment (only when chain is empty) ── */}
        {chain.length === 0 && (
          <SectionCard title="First Appointment">
            <div className="py-2">
              <div className="text-[12px] font-extrabold text-slate-500 uppercase tracking-wide mb-1.5">
                Date
              </div>
              <input
                type="date"
                value={firstDateStr}
                onChange={(e) => {
                  setFirstDateStr(e.target.value);
                  setFirstSlot("");
                }}
                min={toDateStr(new Date())}
                className={`${inputCls} w-full cursor-pointer`}
              />
            </div>
            <div className="py-2">
              <div className="text-[12px] font-extrabold text-slate-500 uppercase tracking-wide mb-1.5">
                Time
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(70px,1fr))] gap-1.5">
                {SALON_SLOTS.map((slot) => {
                  const available = firstDateSlots.includes(slot);
                  const selected = firstSlot === slot;
                  return (
                    <button
                      key={slot}
                      onClick={() => available && setFirstSlot(slot)}
                      disabled={!available}
                      className="py-2 rounded-lg text-[13px] font-semibold text-center border-[1.5px] transition-colors"
                      style={{
                        cursor: available ? "pointer" : "not-allowed",
                        background: selected
                          ? sizeTheme.primary
                          : "#FFFFFF",
                        color: selected
                          ? sizeTheme.headerText
                          : available
                            ? "#1F2937"
                            : "#9CA3AF",
                        borderColor: selected
                          ? sizeTheme.primary
                          : "#E5E7EB",
                        opacity: available ? 1 : 0.5,
                      }}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </div>
            <button
              onClick={addFirstAppointment}
              disabled={!firstSlot}
              className="w-full mt-2 py-3 rounded-xl border-none text-[13px] font-bold cursor-pointer font-inherit transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: firstSlot
                  ? sizeTheme.gradient[0]
                  : "#E5E7EB",
                color: firstSlot ? sizeTheme.headerText : "#6B7280",
              }}
            >
              Book First Appointment
            </button>
          </SectionCard>
        )}

        {/* ── Upcoming Appointments ── */}
        {chain.length > 0 && (
          <SectionCard
            title={`Upcoming Appointments (${chain.length})`}
          >
            {chain.map((link, idx) => {
              const svc = SERVICES.find((s) => s.id === link.service);
              return (
                <div
                  key={idx}
                  className={`flex items-center gap-2 py-2.5 ${
                    idx < chain.length - 1
                      ? "border-b border-slate-100"
                      : ""
                  }`}
                >
                  <span className="text-[13px] font-extrabold text-slate-300 w-5">
                    {idx + 1}.
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-slate-800">
                      {formatDate(link.date)}
                    </div>
                    <div className="text-[12px] text-slate-500">
                      {link.slot} — {svc?.name || link.service}
                    </div>
                  </div>
                  <button
                    onClick={() => removeLink(idx)}
                    className="w-7 h-7 rounded-lg border-none bg-brand-coral-light text-brand-coral text-sm font-bold cursor-pointer flex items-center justify-center shrink-0"
                    title="Remove this and later bookings"
                  >
                    {"\u00D7"}
                  </button>
                </div>
              );
            })}
          </SectionCard>
        )}

        {/* ── Slot picker (when preferred time is unavailable) ── */}
        {slotPickerFor && (
          <SectionCard
            title={`Pick a time — ${formatDate(slotPickerFor.date)}`}
          >
            <div className="text-[12px] text-slate-500 mb-2">
              Preferred time isn't available. Choose from:
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(70px,1fr))] gap-1.5">
              {slotPickerFor.availableSlots.map((slot) => (
                <button
                  key={slot}
                  onClick={() => pickAlternativeSlot(slot)}
                  className="py-2 rounded-lg text-[13px] font-semibold text-center border-[1.5px] cursor-pointer transition-colors bg-white"
                  style={{
                    color: sizeTheme.primary,
                    borderColor: sizeTheme.primary,
                  }}
                >
                  {slot}
                </button>
              ))}
            </div>
            <button
              onClick={() => setSlotPickerFor(null)}
              className="w-full mt-2 py-2 rounded-lg border border-slate-200 bg-white text-slate-500 text-[12px] font-bold cursor-pointer font-inherit"
            >
              Skip this date
            </button>
          </SectionCard>
        )}

        {/* ── Add another appointment ── */}
        {chain.length > 0 &&
          chain.length < MAX_CHAIN &&
          !slotPickerFor && (
            <div className="bg-white rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.06)] mb-3 px-4 py-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-semibold text-slate-600">
                  Add another in
                </span>
                <input
                  type="number"
                  min="1"
                  max="52"
                  value={weeksGap}
                  onChange={(e) => setWeeksGap(e.target.value)}
                  className={`${inputCls} w-[56px] text-center`}
                />
                <span className="text-[13px] font-semibold text-slate-600">
                  weeks
                </span>
              </div>
              {weeksGap &&
                parseInt(weeksGap, 10) > 0 &&
                chain.length > 0 && (
                  <div className="text-[12px] text-slate-400 mt-1">
                    {"\u2192"}{" "}
                    {formatDate(
                      addWeeks(
                        chain[chain.length - 1].date,
                        parseInt(weeksGap, 10),
                      ),
                    )}
                  </div>
                )}
              <button
                onClick={addNextAppointment}
                disabled={!weeksGap || parseInt(weeksGap, 10) < 1}
                className="w-full mt-2.5 py-2.5 rounded-xl border-none text-[13px] font-bold cursor-pointer font-inherit transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background:
                    weeksGap && parseInt(weeksGap, 10) > 0
                      ? sizeTheme.gradient[0]
                      : "#E5E7EB",
                  color:
                    weeksGap && parseInt(weeksGap, 10) > 0
                      ? sizeTheme.headerText
                      : "#6B7280",
                }}
              >
                Add Appointment
              </button>
            </div>
          )}
      </div>

      {/* ── Bottom actions ── */}
      {chain.length > 0 && (
        <div
          className="px-4 pt-1 pb-5 flex gap-2.5"
          style={{ background: sizeTheme.light }}
        >
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border-2 border-slate-200 bg-white text-slate-500 text-[13px] font-bold cursor-pointer font-inherit"
          >
            Cancel
          </button>
          <button
            onClick={handleDone}
            disabled={creating}
            className="flex-1 py-3 rounded-xl border-none text-[13px] font-bold cursor-pointer font-inherit disabled:opacity-50"
            style={{
              background: sizeTheme.gradient[0],
              color: sizeTheme.headerText,
            }}
          >
            {creating
              ? "Creating..."
              : `Confirm All (${chain.length})`}
          </button>
        </div>
      )}
    </AccessibleModal>
  );
}
