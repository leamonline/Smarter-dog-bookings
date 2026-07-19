// ============================================================
// src/components/modals/new-client/NewClientWizard.jsx
//
// Staff "Add client" wizard: customer → optional dog(s) → optional first booking.
// WRITE-AT-END — nothing is persisted until a terminal save action, so
// abandoning before then leaves no orphan records. Saving writes sequentially:
//   addHuman → addDog (per dog) → onAddBookings (per booked dog).
// Reuses the existing write functions + capacity widgets; never touches the
// capacity engine, the BEFORE-INSERT gates, RLS, or the booking RPCs.
// ============================================================

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { ModalShell, HeaderIconButton } from "../shell/index.js";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { validateContactPhone } from "../../../utils/phone";
import { toDateStr } from "../../../supabase/transforms";
import { SERVICES } from "../../../constants/index";
import { logger } from "../../../lib/logger";
import { StepCustomer } from "./StepCustomer.jsx";
import { StepDogs } from "./StepDogs.jsx";
import { StepFirstBooking } from "./StepFirstBooking.jsx";
import { commitNewClient } from "./commitNewClient.js";
import { canAdvanceCustomer, canConfirm } from "./wizardValidation.js";

const STEP_TITLES = ["Customer", "Their dogs (optional)", "First booking"];
const DEFAULT_SERVICE = SERVICES[0]?.id ?? "full-groom";
const emptyHuman = () => ({
  name: "", surname: "", phone: "", email: "", address: "", sms: false, whatsapp: false, notes: "",
});

export function NewClientWizard({
  onClose,
  addHuman,
  addDog,
  onAddBookings,
  findHumanByFullName,
  onBookAnother,
  bookingsByDate,
  dayOpenState,
  daySettings,
}) {
  const toast = useToast();
  const titleId = "new-client-wizard-title";

  const [step, setStep] = useState(1);
  const [human, setHuman] = useState(emptyHuman);
  const [duplicate, setDuplicate] = useState(null);
  const [dupAcknowledged, setDupAcknowledged] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const normalisedPhoneRef = useRef("");

  const [dogs, setDogs] = useState([]);
  const [selections, setSelections] = useState({});
  const [dateStr, setDateStr] = useState("");
  const [slot, setSlot] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  // Once the customer is written we never go back / re-create (idempotent retry).
  const committedRef = useRef({ humanId: null, keyToDogId: {}, bookedKeys: new Set() });
  const [customerCreated, setCustomerCreated] = useState(false);

  // ── Step 1 ──
  const onHumanChange = (key, value) => {
    setHuman((h) => ({ ...h, [key]: value }));
    if (key === "name" || key === "surname") { setDuplicate(null); setDupAcknowledged(false); }
  };

  // ── Step 2 ──
  const onAddDog = (dog) => {
    setDogs((d) => [...d, dog]);
    setSelections((s) => ({ ...s, [dog.clientKey]: { booked: true, service: DEFAULT_SERVICE, addons: [] } }));
  };
  const onRemoveDog = (clientKey) => {
    setDogs((d) => d.filter((x) => x.clientKey !== clientKey));
    setSelections((s) => { const next = { ...s }; delete next[clientKey]; return next; });
  };

  // ── Step 3 ──
  const patchSel = (clientKey, patch) =>
    setSelections((s) => ({ ...s, [clientKey]: { ...s[clientKey], ...patch } }));
  const onToggleBooked = (clientKey) =>
    setSelections((s) => ({ ...s, [clientKey]: { ...s[clientKey], booked: !s[clientKey]?.booked } }));
  const onServiceChange = (clientKey, service) => patchSel(clientKey, { service });
  const onAddonsChange = (clientKey, addon) =>
    setSelections((s) => {
      const cur = s[clientKey]?.addons ?? [];
      const addons = cur.includes(addon) ? cur.filter((a) => a !== addon) : [...cur, addon];
      return { ...s, [clientKey]: { ...s[clientKey], addons } };
    });
  // AvailabilityCalendar emits a Date object — normalise to a yyyy-mm-dd string
  // (the slot picker + booking payload expect the string form).
  const onSelectDate = (date) => { setDateStr(toDateStr(date)); setSlot(""); };

  // ── Navigation ──
  const canNext = step === 1 ? canAdvanceCustomer(human) : false;

  async function handleNext() {
    if (step === 1) {
      const { value, error: pErr } = validateContactPhone(human.phone);
      if (pErr) { setPhoneError(pErr); return; }
      setPhoneError("");
      normalisedPhoneRef.current = value;
      // Soft, non-blocking duplicate check: warn once, then allow "Next anyway".
      if (!dupAcknowledged && findHumanByFullName) {
        try {
          const existing = await findHumanByFullName(human.name.trim(), human.surname.trim());
          if (existing) {
            setDuplicate(`${human.name} ${human.surname}`.trim());
            setDupAcknowledged(true);
            return;
          }
        } catch (err) {
          logger.error("NewClientWizard duplicate lookup failed", err);
        }
      }
      setStep(2);
    }
  }

  // ── Save (write-at-end; idempotent retry via committedRef) ──
  async function handleCommit({ includeBooking }) {
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const commitSelections = includeBooking
        ? selections
        : Object.fromEntries(
            dogs.map((dog) => [
              dog.clientKey,
              { ...selections[dog.clientKey], booked: false },
            ]),
          );
      const { humanId } = await commitNewClient({
        addHuman,
        addDog,
        onAddBookings,
        human,
        phone: normalisedPhoneRef.current || human.phone.trim(),
        dogs,
        selections: commitSelections,
        dateStr: includeBooking ? dateStr : "",
        slot: includeBooking ? slot : "",
        committed: committedRef.current,
        onCustomerCreated: () => setCustomerCreated(true),
      });

      const dogCopy = dogs.length === 0
        ? ""
        : ` with ${dogs.length} dog${dogs.length === 1 ? "" : "s"}`;
      const bookingCopy = includeBooking ? " and a booking" : "";
      const action = includeBooking && onBookAnother && humanId
        ? { label: `Book another for ${human.name}`, onClick: () => onBookAnother(humanId) }
        : undefined;
      toast.show(`${human.name} saved${dogCopy}${bookingCopy}`, "success", action);
      onClose();
    } catch (err) {
      logger.error("NewClientWizard save failed", err);
      setError(err?.message || "That didn't quite work — let's try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const confirmReady = canConfirm(dogs, selections, dateStr, slot) && !submitting;

  const header = (
    <header className="px-5 pt-5 pb-3 bg-[var(--color-brand-paper)] border-b border-slate-100">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-label text-ink-muted">
            Add client · Step {step} of 3
          </div>
          <h2 id={titleId} className="text-xl font-bold font-display text-brand-purple leading-tight mt-0.5 truncate">
            {STEP_TITLES[step - 1]}
          </h2>
        </div>
        <HeaderIconButton label="Close" onClick={onClose}>
          <X size={16} strokeWidth={2.2} aria-hidden="true" />
        </HeaderIconButton>
      </div>
      <ol className="flex items-center gap-1.5 mt-3" aria-hidden="true">
        {STEP_TITLES.map((t, i) => {
          const n = i + 1;
          const cur = n === step;
          const done = n < step;
          return (
            <li key={t}
              className={`h-1.5 rounded-full transition-all ${
                cur ? "w-6 bg-brand-teal" : done ? "w-3 bg-brand-teal/60" : "w-3 bg-slate-200"
              }`} />
          );
        })}
      </ol>
    </header>
  );

  const footer = (
    <div className="px-5 py-3 bg-[var(--color-brand-paper)] border-t border-slate-100 flex flex-col gap-2">
      {error && (
        <div role="alert" className="text-[12px] text-brand-coral font-semibold bg-brand-coral-light px-3 py-2 rounded-lg">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        {step > 1 ? (
          <button type="button" onClick={() => setStep((s) => s - 1)} disabled={customerCreated}
            className="px-4 py-2.5 rounded-full border border-slate-200 bg-white text-slate-600 text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed">
            Back
          </button>
        ) : (
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-full border border-slate-200 bg-white text-slate-500 text-[13px] font-bold">
            Cancel
          </button>
        )}
        {step === 1 ? (
          <button type="button" onClick={handleNext} disabled={!canNext}
            className="px-5 py-2.5 rounded-full bg-brand-teal text-white text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity">
            {duplicate ? "Next anyway" : "Next"}
          </button>
        ) : step === 2 ? (
          <div className="ml-auto flex items-center gap-2">
            {dogs.length > 0 && (
              <button
                type="button"
                onClick={() => handleCommit({ includeBooking: false })}
                disabled={submitting}
                className="px-4 py-2.5 rounded-full border border-slate-200 bg-white text-slate-600 text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Save &amp; book later
              </button>
            )}
            <button
              type="button"
              onClick={dogs.length === 0
                ? () => handleCommit({ includeBooking: false })
                : () => setStep(3)}
              disabled={submitting}
              className="px-5 py-2.5 rounded-full bg-brand-teal text-white text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {submitting ? "Saving…" : dogs.length === 0 ? "Save client" : "Continue to booking"}
            </button>
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleCommit({ includeBooking: false })}
              disabled={submitting}
              className="px-4 py-2.5 rounded-full border border-slate-200 bg-white text-slate-600 text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Save &amp; book later
            </button>
            <button
              type="button"
              onClick={() => handleCommit({ includeBooking: true })}
              disabled={!confirmReady}
              className="px-5 py-2.5 rounded-full bg-brand-green-600 text-white text-[13px] font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-green-700 transition-colors"
            >
              {submitting ? "Saving…" : "Confirm booking"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <ModalShell
      onClose={onClose}
      titleId={titleId}
      accent="var(--color-brand-teal)"
      rootClassName="bm-fields"
      widthClass="w-[min(560px,95vw)]"
      header={header}
      footer={footer}
    >
      <div className="p-5">
        {step === 1 && (
          <StepCustomer human={human} onChange={onHumanChange} duplicate={duplicate} phoneError={phoneError} />
        )}
        {step === 2 && <StepDogs dogs={dogs} onAddDog={onAddDog} onRemoveDog={onRemoveDog} />}
        {step === 3 && (
          <StepFirstBooking
            dogs={dogs}
            selections={selections}
            onToggleBooked={onToggleBooked}
            onServiceChange={onServiceChange}
            onAddonsChange={onAddonsChange}
            bookingsByDate={bookingsByDate}
            dayOpenState={dayOpenState}
            daySettings={daySettings}
            dateStr={dateStr}
            slot={slot}
            onSelectDate={onSelectDate}
            onSelectSlot={setSlot}
          />
        )}
      </div>
    </ModalShell>
  );
}
