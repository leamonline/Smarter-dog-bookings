// ============================================================
// src/components/views/inbox/customer-context/BookAppointmentModal.jsx
//
// Staff "Book appointment" form, launched from the customer context
// panel. Pick a dog (from this customer's dogs), date, slot, service and
// size; the live capacity preview shows whether the slot fits before you
// commit. "Add to diary" routes through createStaffBooking →
// create_staff_booking_from_conversation RPC, which applies it through
// the same guarded path as an AI proposal (capacity trigger + booking
// <-> conversation link + inline "Booking created" thread card).
//
// The capacity preview is informational — physical-capacity rejections
// still come from the DB trigger at write time and surface as an error
// here. Staff are the approver, so the large-dog approval gate is
// bypassed; a genuinely full slot is still refused.
// ============================================================

import { useId, useState } from "react";
import { AccessibleModal } from "../../../shared/AccessibleModal.tsx";
import { SALON_SLOTS, SERVICES } from "../../../../constants/salon";
import { BookingCapacityPreview } from "../thread/BookingCapacityPreview.jsx";
import { displayName } from "../helpers.js";

const SIZE_OPTIONS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function BookAppointmentModal({ conversation, dogs = [], onClose, onBook }) {
  const titleId = useId();
  const today = todayStr();

  const [dogId, setDogId] = useState(dogs[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [slot, setSlot] = useState("");
  const [service, setService] = useState(SERVICES[0]?.id ?? "");
  const [size, setSize] = useState(dogs[0]?.size || "small");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const selectedDog = dogs.find((d) => d.id === dogId) ?? null;
  const canSubmit = Boolean(dogId && date && slot && service && size) && !submitting;

  function handleDogChange(nextId) {
    setDogId(nextId);
    // Size follows the dog's recorded size — the server takes dogs.size as
    // authoritative (so a slot can't be under-filled by mis-sizing), so we
    // mirror it here and show it read-only rather than as an editable input
    // that would be silently ignored.
    const dog = dogs.find((d) => d.id === nextId);
    setSize(dog?.size || "small");
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const res = await onBook({
      dog_id: dogId,
      booking_date: date,
      slot,
      service,
      size,
    });
    if (res?.ok) {
      onClose();
    } else {
      setError(res?.reason ?? "Could not create the booking.");
      setSubmitting(false);
    }
  }

  return (
    <AccessibleModal
      onClose={onClose}
      titleId={titleId}
      zIndex={1100}
      className="w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-brand-paper">
        <div className="min-w-0">
          <h2 id={titleId} className="text-[15px] font-bold font-display text-brand-purple m-0">
            Book appointment
          </h2>
          <p className="text-[11px] text-slate-600 truncate">
            for {displayName(conversation)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-9 h-9 rounded-full text-slate-500 hover:bg-slate-100 hover:text-brand-purple transition-colors text-[18px] leading-none cursor-pointer"
        >
          ×
        </button>
      </div>

      <div className="p-4 overflow-y-auto flex flex-col gap-3">
        {dogs.length === 0 ? (
          <p className="text-[13px] text-slate-600">
            This customer has no dogs on file yet. Add a dog to their profile first, then book.
          </p>
        ) : (
          <>
            <Field label="Dog" htmlFor="qb-dog">
              <select
                id="qb-dog"
                value={dogId}
                onChange={(e) => handleDogChange(e.target.value)}
                className={selectClass}
              >
                {dogs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.breed ? ` · ${d.breed}` : ""}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" htmlFor="qb-date">
                <input
                  id="qb-date"
                  type="date"
                  min={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={selectClass}
                />
              </Field>
              <Field label="Time" htmlFor="qb-slot">
                <select
                  id="qb-slot"
                  value={slot}
                  onChange={(e) => setSlot(e.target.value)}
                  className={selectClass}
                >
                  <option value="">Slot…</option>
                  {SALON_SLOTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Service" htmlFor="qb-service">
                <select
                  id="qb-service"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  className={selectClass}
                >
                  {SERVICES.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Size" htmlFor="qb-size">
                {/* Read-only: the server uses the dog's recorded size so a
                    slot can't be under-filled by mis-sizing. Change it on
                    the dog's profile if it's wrong. */}
                <select
                  id="qb-size"
                  value={size}
                  disabled
                  aria-describedby="qb-size-hint"
                  className={`${selectClass} disabled:bg-slate-50 disabled:text-slate-600 disabled:cursor-not-allowed`}
                >
                  {SIZE_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
                <p id="qb-size-hint" className="text-[10px] text-slate-500 mt-0.5">
                  From the dog&apos;s profile
                </p>
              </Field>
            </div>

            {selectedDog?.alerts?.length > 0 && (
              <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
                <span className="font-bold">Alerts:</span> {selectedDog.alerts.join(", ")}
              </div>
            )}

            <BookingCapacityPreview date={date} slot={slot} size={size} />

            {error && (
              <div
                role="alert"
                className="text-[12px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2"
              >
                {error}
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-100 bg-white">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center h-9 px-4 rounded-full bg-white border border-slate-300 text-slate-700 text-[13px] font-semibold cursor-pointer hover:border-slate-400 font-[inherit]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="inline-flex items-center h-9 px-4 rounded-full bg-brand-yellow text-brand-purple text-[13px] font-bold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-yellow-dark transition-colors font-[inherit]"
        >
          {submitting ? "Adding…" : "Add to diary"}
        </button>
      </div>
    </AccessibleModal>
  );
}

const selectClass =
  "w-full text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-brand-yellow";

function Field({ label, htmlFor, children }) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
