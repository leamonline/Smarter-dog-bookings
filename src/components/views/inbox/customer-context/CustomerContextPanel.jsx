// ============================================================
// src/components/views/inbox/customer-context/CustomerContextPanel.jsx
//
// The "tell me about this customer" surface that lives beside the
// conversation thread. Used in two responsive modes:
//
//   - Desktop (xl+): docked third column inside InboxView. No
//     onClose handler, no close button.
//   - Below xl: full-screen slide-over launched by the "Customer
//     info" button in the thread header. Pass onClose to render
//     the dismiss button.
//
// The panel itself doesn't fetch — it accepts the data shape
// returned by useCustomerContext so the same shell renders in
// either mode without spawning duplicate queries.
// ============================================================

import { LoadingSpinner } from "../../../ui/LoadingSpinner.jsx";
import { titleCase } from "../../../../utils/text";
import { formatPhoneForDisplay } from "../../../../utils/phone.js";
import { waMeLink, telLink } from "../hooks/customerContextSummary.js";
import { DogSummaryCard } from "./DogSummaryCard.jsx";
import { LastBookingChip } from "./LastBookingChip.jsx";
import { TrustedHumansChips } from "./TrustedHumansChips.jsx";

export function CustomerContextPanel({
  context,
  conversation,
  onOpenHuman,
  onOpenDog,
  onClose,
  titleId,
}) {
  const { human, dogs, lastBooking, trustedContacts, summary, loading, error } = context;
  const displayHuman = loading ? null : human;

  const phoneE164 = conversation?.phone_e164 || displayHuman?.phone || "";
  const rawPhone = displayHuman?.phone || phoneE164;
  const displayPhone = formatPhoneForDisplay(rawPhone) || rawPhone;
  const tel = telLink(rawPhone);
  const waMe = waMeLink(rawPhone);

  return (
    <aside
      className="flex flex-col h-full bg-brand-paper"
      aria-label="Customer context"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-slate-200 bg-white shrink-0">
        <h3
          id={titleId}
          className="text-[14px] font-bold text-brand-purple font-display leading-tight m-0 truncate"
        >
          {loading
            ? "Loading customer details..."
            : displayHuman
              ? titleCase(displayHuman.fullName || `${displayHuman.name} ${displayHuman.surname}`)
            : "Unmatched contact"}
        </h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close customer context"
            className="w-9 h-9 rounded-full text-slate-500 hover:bg-slate-100 hover:text-brand-purple transition-colors text-[18px] leading-none cursor-pointer"
          >
            ×
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="py-6"><LoadingSpinner /></div>
        ) : error ? (
          <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2">
            Couldn't load customer details: {error}
          </div>
        ) : !displayHuman ? (
          <UnmatchedEmptyState phone={displayPhone} />
        ) : (
          <div className="flex flex-col gap-3">
            {summary && (
              <p className="text-[12px] text-slate-700 leading-snug">{summary}</p>
            )}

            <div className="flex flex-wrap gap-2">
              {tel && (
                <a
                  href={tel}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white border border-slate-300 text-brand-purple text-[12px] font-semibold no-underline hover:border-brand-yellow/60 transition-colors"
                  aria-label={`Call ${displayPhone}`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  Call
                </a>
              )}
              {waMe && (
                <a
                  href={waMe}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#25D366]/10 border border-[#25D366]/40 text-[#108444] text-[12px] font-semibold no-underline hover:bg-[#25D366]/20 transition-colors"
                  aria-label={`Open WhatsApp Web for ${displayPhone}`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                  WhatsApp
                </a>
              )}
              {onOpenHuman && displayHuman && (
                <button
                  type="button"
                  onClick={() => onOpenHuman(displayHuman.id)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-white border border-slate-300 text-brand-purple text-[12px] font-semibold cursor-pointer hover:border-brand-yellow/60 transition-colors font-[inherit]"
                >
                  Open full profile
                </button>
              )}
            </div>

            <LastBookingChip lastBooking={lastBooking} />

            {(displayHuman.address || displayHuman.email || displayHuman.notes || displayHuman.historyFlag) && (
              <Section title="Details">
                {displayHuman.email && (
                  <DetailLine
                    label="Email"
                    value={displayHuman.email}
                    href={`mailto:${displayHuman.email}`}
                  />
                )}
                {displayHuman.address && (
                  <DetailLine label="Address" value={displayHuman.address} />
                )}
                {displayHuman.notes && (
                  <DetailLine
                    label="Notes"
                    value={displayHuman.notes}
                    multiline
                  />
                )}
                {displayHuman.historyFlag && (
                  <DetailLine label="Flag" value={displayHuman.historyFlag} accent="rose" />
                )}
              </Section>
            )}

            {dogs.length > 0 && (
              <Section title={dogs.length === 1 ? "Dog" : `Dogs (${dogs.length})`}>
                <div className="flex flex-col gap-2">
                  {dogs.map((dog) => (
                    <DogSummaryCard
                      key={dog.id}
                      dog={dog}
                      onOpenDog={onOpenDog}
                    />
                  ))}
                </div>
              </Section>
            )}

            {trustedContacts.length > 0 && (
              <Section title="Trusted contacts">
                <TrustedHumansChips
                  contacts={trustedContacts}
                  onOpenHuman={onOpenHuman}
                />
              </Section>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
        {title}
      </div>
      {children}
    </div>
  );
}

function DetailLine({ label, value, href, multiline, accent }) {
  const valueClass = `text-[12px] text-brand-purple ${multiline ? "whitespace-pre-wrap leading-snug" : "truncate"} ${accent === "rose" ? "text-rose-700 font-semibold" : ""}`;
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      {href ? (
        <a
          href={href}
          className={`${valueClass} no-underline hover:underline`}
        >
          {value}
        </a>
      ) : (
        <div className={valueClass}>{value}</div>
      )}
    </div>
  );
}

function UnmatchedEmptyState({ phone }) {
  return (
    <div className="text-[13px] text-slate-600 leading-snug bg-amber-50 border border-amber-200 rounded-lg p-3">
      <p className="font-bold text-amber-900 mb-1">No customer match yet</p>
      <p className="text-amber-900/80">
        We haven&apos;t linked {phone || "this number"} to a customer record. Adding a quick profile means the AI can personalise replies and the diary stays accurate.
      </p>
    </div>
  );
}
