// src/components/modals/ChainBookingModal.jsx
import { useState, useMemo, useCallback } from "react";
import { BRAND, SERVICES, SALON_SLOTS, PRICING } from "../../constants/index.js";
import { useSalon } from "../../contexts/SalonContext.jsx";
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
    onClose();
  };

  const price = PRICING[linkService]?.[linkSize] || "";

  // -- Styles --
  const overlayStyle = {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.35)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000,
  };
  const modalStyle = {
    background: BRAND.white, borderRadius: 16, width: 460,
    maxHeight: "85vh", overflow: "auto",
    padding: "24px 28px", boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
  };
  const selectStyle = {
    padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${BRAND.greyLight}`,
    fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: BRAND.white,
    color: BRAND.text, cursor: "pointer",
  };
  const inputStyle = {
    ...selectStyle, width: 60, textAlign: "center",
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.text, marginBottom: 4 }}>
          Recurring Bookings — {dog?.name || "Dog"}
        </div>
        <div style={{ fontSize: 13, color: BRAND.textLight, marginBottom: 20 }}>
          Build a chain of future appointments. Each one counts from the last.
        </div>

        {/* Template row */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <select value={linkService} onChange={(e) => setLinkService(e.target.value)} style={selectStyle}>
            {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={linkSlot} onChange={(e) => setLinkSlot(e.target.value)} style={selectStyle}>
            {SALON_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={linkSize} onChange={(e) => setLinkSize(e.target.value)} style={selectStyle}>
            {SIZES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          {price && (
            <span style={{ fontSize: 14, fontWeight: 800, color: "#1E6B5C" }}>{price}</span>
          )}
        </div>

        {/* Weeks input */}
        {chain.length < MAX_CHAIN && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            marginBottom: 8, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>Book in</span>
            <input
              type="number"
              min="1"
              max="52"
              value={weeksGap}
              onChange={(e) => setWeeksGap(e.target.value)}
              placeholder="—"
              style={inputStyle}
            />
            <span style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>weeks' time</span>
            {calculatedDate && (
              <span style={{ fontSize: 13, fontWeight: 700, color: BRAND.blue }}>
                → {formatDate(calculatedDate)}
              </span>
            )}
          </div>
        )}

        {/* Availability warning */}
        {availabilityWarning && (
          <div style={{
            padding: "8px 12px", borderRadius: 8, marginBottom: 8,
            background: "#FFF8E0", color: "#92400E",
            fontSize: 12, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ fontSize: 16 }}>⚠</span> {availabilityWarning}
          </div>
        )}

        {/* Add button */}
        {calculatedDate && chain.length < MAX_CHAIN && (
          <button
            onClick={addLink}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: BRAND.blue, color: BRAND.white,
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit", marginBottom: 16,
            }}
          >
            Add to chain
          </button>
        )}

        {/* Chain list */}
        {chain.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, marginBottom: 8 }}>
              Chain ({chain.length}/{MAX_CHAIN})
            </div>
            {chain.map((link, idx) => {
              const svc = SERVICES.find((s) => s.id === link.service);
              return (
                <div
                  key={idx}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px", borderRadius: 8, marginBottom: 4,
                    background: "#F8FAFB",
                    border: `1px solid ${BRAND.greyLight}`,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 800, color: BRAND.text, width: 20 }}>
                    {idx + 1}.
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text, flex: 1 }}>
                    {formatDate(link.date)} — {link.slot} — {svc?.name || link.service}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight }}>
                    {link.size}
                  </span>
                  <button
                    onClick={() => removeLink(idx)}
                    style={{
                      width: 24, height: 24, borderRadius: 6, border: "none",
                      background: "#FDE2E8", color: BRAND.coral,
                      fontSize: 14, fontWeight: 700, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "inherit",
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "10px 20px", borderRadius: 10, border: `1.5px solid ${BRAND.greyLight}`,
              background: BRAND.white, color: BRAND.text,
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          {chain.length > 0 && (
            <button
              onClick={handleConfirmAll}
              disabled={creating}
              style={{
                padding: "10px 20px", borderRadius: 10, border: "none",
                background: creating ? BRAND.textLight : BRAND.blue,
                color: BRAND.white,
                fontSize: 13, fontWeight: 700, cursor: creating ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {creating ? "Creating..." : `Confirm All (${chain.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
