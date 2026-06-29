// src/components/modals/ChainBookingModal.jsx
import { useState, useMemo, useCallback } from "react";
import {
  SERVICES,
  SALON_SLOTS,
  SIZE_THEME,
  SIZE_FALLBACK,
} from "../../constants/index";
import { X } from "lucide-react";
import { ModalShell, HeaderIconButton } from "./shell/index.js";
import { useSalon } from "../../contexts/SalonContext";
import { useToast } from "../../contexts/ToastContext.jsx";
import { canBookSlot, isCapacityRejection } from "../../engine/capacity";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { toDateStr } from "../../supabase/transforms";
import {
  getNumericPrice,
  getServicePriceLabel,
  getAllowedServicesForSize,
} from "../../engine/bookingRules";
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

      const available = [];
      const overrideable = new Set();
      for (const slot of activeSlots) {
        const result = canBookSlot(dayBookings, slot, dogSize, activeSlots, {
          overrides: settings.overrides?.[slot] || {},
          dogId: dog?.id,
          staffOverride: true,
        });
        if (result.allowed) {
          available.push(slot);
        } else if (isCapacityRejection(result.reason)) {
          overrideable.add(slot);
        }
      }
      return { available, overrideable };
    },
    [bookingsByDate, daySettings, dogSize, dog?.id],
  );

  const firstDateSlots = useMemo(
    () => getAvailableSlots(firstDateStr),
    [firstDateStr, getAvailableSlots],
  );

  // pendingOverride lifts an "are you sure?" ConfirmDialog over the chain UI
  // when the user picks (or auto-rolls into) an over-capacity slot. It
  // captures everything needed to commit the link once they confirm.
  const [pendingOverride, setPendingOverride] = useState(null);
  // shape: { date, dateStr, slot, reason }

  // ── Actions ──
  const addFirstAppointment = useCallback(() => {
    if (!firstSlot || !firstDateStr) return;
    const date = new Date(firstDateStr + "T00:00:00");
    const isOverride = firstDateSlots.overrideable.has(firstSlot);
    if (isOverride) {
      setPendingOverride({
        date,
        dateStr: firstDateStr,
        slot: firstSlot,
        reason: "This time is fully booked",
        // First appointment is rendered separately from chain.push — flag
        // so the confirm handler knows whether to push to chain or replace.
        isFirst: true,
      });
      return;
    }
    setChain([
      {
        date,
        dateStr: firstDateStr,
        service,
        slot: firstSlot,
        size: dogSize,
        staffCapacityOverride: false,
      },
    ]);
  }, [firstSlot, firstDateStr, firstDateSlots, service, dogSize]);

  const addNextAppointment = useCallback(() => {
    const weeksNum = parseInt(weeksGap, 10);
    if (!weeksNum || weeksNum < 1 || chain.length >= MAX_CHAIN) return;

    const lastLink = chain[chain.length - 1];
    const nextDate = addWeeks(lastLink.date, weeksNum);
    const nextDateStr = toDateStr(nextDate);
    const { available, overrideable } = getAvailableSlots(nextDateStr);

    if (available.includes(lastLink.slot)) {
      setChain((prev) => [
        ...prev,
        {
          date: nextDate,
          dateStr: nextDateStr,
          service,
          slot: lastLink.slot,
          size: dogSize,
          staffCapacityOverride: false,
        },
      ]);
      toast.show(
        `${formatDate(nextDate)} at ${lastLink.slot} — all set`,
        "success",
      );
    } else if (overrideable.has(lastLink.slot)) {
      // Preferred slot is full but overridable — surface the popup so
      // staff confirms instead of silently overriding.
      setPendingOverride({
        date: nextDate,
        dateStr: nextDateStr,
        slot: lastLink.slot,
        reason: "This time is fully booked",
        isFirst: false,
      });
    } else if (available.length > 0 || overrideable.size > 0) {
      setSlotPickerFor({
        date: nextDate,
        dateStr: nextDateStr,
        availableSlots: available,
        overrideSlots: Array.from(overrideable),
      });
    } else {
      toast.show(
        `Nothing available on ${formatDate(nextDate)}`,
        "error",
      );
    }
  }, [weeksGap, chain, service, dogSize, getAvailableSlots, toast]);

  const pickAlternativeSlot = useCallback(
    (slot, isOverride) => {
      if (!slotPickerFor) return;
      if (isOverride) {
        setPendingOverride({
          date: slotPickerFor.date,
          dateStr: slotPickerFor.dateStr,
          slot,
          reason: "This time is fully booked",
          isFirst: false,
        });
        setSlotPickerFor(null);
        return;
      }
      setChain((prev) => [
        ...prev,
        {
          date: slotPickerFor.date,
          dateStr: slotPickerFor.dateStr,
          service,
          slot,
          size: dogSize,
          staffCapacityOverride: false,
        },
      ]);
      toast.show(
        `${formatDate(slotPickerFor.date)} at ${slot} — all set`,
        "success",
      );
      setSlotPickerFor(null);
    },
    [slotPickerFor, service, dogSize, toast],
  );

  const confirmPendingOverride = useCallback(() => {
    if (!pendingOverride) return;
    const { date, dateStr, slot, isFirst } = pendingOverride;
    const link = {
      date,
      dateStr,
      service,
      slot,
      size: dogSize,
      staffCapacityOverride: true,
    };
    if (isFirst) {
      setChain([link]);
    } else {
      setChain((prev) => [...prev, link]);
    }
    toast.show(`Booked ${formatDate(date)} at ${slot} (override)`, "success");
    setPendingOverride(null);
  }, [pendingOverride, service, dogSize, toast]);

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
      `Created ${chain.length} booking${chain.length === 1 ? "" : "s"} — nice one`,
      "success",
    );
    onClose();
  };

  const inputCls =
    "px-3 py-2 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-semibold font-inherit bg-white text-slate-800";

  return (
    <>
    <ModalShell
      onClose={onClose}
      titleId="chain-booking-title"
      accent={sizeTheme.primary}
      widthClass="w-[min(440px,95vw)]"
      maxHeightClass="max-h-[90vh]"
      header={
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 bg-[var(--color-brand-paper)]">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Recurring bookings
            </span>
            <h2
              id="chain-booking-title"
              className="text-xl md:text-2xl font-bold font-display text-brand-purple leading-tight mt-1 truncate"
            >
              {dog?.name || "Dog"}
            </h2>
          </div>
          <HeaderIconButton label="Close recurring bookings" onClick={onClose}>
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        </header>
      }
      footer={
        chain.length > 0 ? (
          <div className="border-t border-slate-100 bg-white px-5 py-3 flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 max-sm:min-h-[44px] rounded-control border-[1.5px] border-slate-200 bg-white text-slate-600 text-sm font-bold cursor-pointer font-inherit transition-colors hover:bg-slate-50 inline-flex items-center justify-center"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDone}
              disabled={creating}
              className="ml-auto px-5 py-2 max-sm:min-h-[44px] rounded-full border-none bg-action text-on-action text-sm font-bold cursor-pointer font-inherit transition-colors hover:bg-brand-yellow-dark disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed inline-flex items-center justify-center"
            >
              {creating ? "Creating…" : `Confirm all (${chain.length})`}
            </button>
          </div>
        ) : null
      }
    >
      <div className="px-4 pt-4 pb-2">
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
                  const available = firstDateSlots.available.includes(slot);
                  const isOverride =
                    !available && firstDateSlots.overrideable.has(slot);
                  const isClickable = available || isOverride;
                  const selected = firstSlot === slot;
                  return (
                    <button
                      key={slot}
                      onClick={() => isClickable && setFirstSlot(slot)}
                      disabled={!isClickable}
                      title={
                        isOverride ? "Over capacity. Click to override." : undefined
                      }
                      aria-label={
                        isOverride
                          ? `${slot} — over capacity, click to override`
                          : slot
                      }
                      className="py-2 rounded-lg text-[13px] font-semibold text-center border-[1.5px] transition-colors"
                      style={{
                        cursor: isClickable ? "pointer" : "not-allowed",
                        background: selected
                          ? sizeTheme.primary
                          : isOverride
                            ? "#FFFBEB"
                            : "#FFFFFF",
                        color: selected
                          ? sizeTheme.headerText
                          : available
                            ? "#1F2937"
                            : isOverride
                              ? "#92400E"
                              : "#9CA3AF",
                        borderColor: selected
                          ? sizeTheme.primary
                          : isOverride
                            ? "#F59E0B"
                            : "#E5E7EB",
                        opacity: isClickable ? 1 : 0.5,
                      }}
                    >
                      {slot}
                      {isOverride && !selected && (
                        <div className="text-[9px] font-bold mt-0.5 leading-none">
                          over
                        </div>
                      )}
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
                    className="tap-target w-7 h-7 rounded-lg border-none bg-brand-coral-light text-brand-coral text-sm font-bold cursor-pointer flex items-center justify-center shrink-0"
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
                  onClick={() => pickAlternativeSlot(slot, false)}
                  className="py-2 rounded-lg text-[13px] font-semibold text-center border-[1.5px] cursor-pointer transition-colors bg-white"
                  style={{
                    color: sizeTheme.primary,
                    borderColor: sizeTheme.primary,
                  }}
                >
                  {slot}
                </button>
              ))}
              {(slotPickerFor.overrideSlots || []).map((slot) => (
                <button
                  key={slot}
                  onClick={() => pickAlternativeSlot(slot, true)}
                  title="Over capacity. Click to override."
                  aria-label={`${slot} — over capacity, click to override`}
                  className="py-2 rounded-lg text-[13px] font-semibold text-center border-[1.5px] cursor-pointer transition-colors"
                  style={{
                    background: "#FFFBEB",
                    color: "#92400E",
                    borderColor: "#F59E0B",
                  }}
                >
                  {slot}
                  <div className="text-[9px] font-bold mt-0.5 leading-none">over</div>
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
    </ModalShell>

      {pendingOverride && (
        <ConfirmDialog
          title="This time is fully booked"
          message={`Add ${formatDate(pendingOverride.date)} at ${pendingOverride.slot} anyway?`}
          confirmLabel="Override and add"
          cancelLabel="Pick another time"
          variant="primary"
          onConfirm={confirmPendingOverride}
          onCancel={() => setPendingOverride(null)}
        />
      )}
    </>
  );
}
