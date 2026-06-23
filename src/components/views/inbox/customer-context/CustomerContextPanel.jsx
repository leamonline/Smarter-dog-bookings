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

import { useState } from "react";
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
  onBookAppointment,
  onUpdateNotes,
  onClose,
  titleId,
}) {
  const { human, dogs, lastBooking, trustedContacts, summary, loading, error } = context;
  const displayHuman = loading ? null : human;
  const [updatingNotes, setUpdatingNotes] = useState(false);

  async function handleUpdateNotes() {
    if (!onUpdateNotes || updatingNotes) return;
    setUpdatingNotes(true);
    try {
      await onUpdateNotes();
    } finally {
      setUpdatingNotes(false);
    }
  }

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
        <div className="flex flex-col gap-3">
          {/* A short orientation blurb and the customer's dog(s) sit right
              under the name — that's what staff glance at first. Both are
              available only once a matched customer has loaded. */}
          {!loading && !error && displayHuman && summary && (
            <p className="text-[12px] text-slate-700 leading-snug">{summary}</p>
          )}

          {/* Owner notes — the durable profile notes (humans.notes),
              shown read-only here above the dog card(s) as a titled card.
              Staff edit them on the full profile. */}
          {!loading && !error && displayHuman && displayHuman.notes && (
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Notes
              </div>
              <div className="text-[12px] text-slate-700 leading-snug whitespace-pre-wrap">
                {displayHuman.notes}
              </div>
            </div>
          )}

          {!loading && !error && displayHuman && dogs.length > 0 && (
            <div className="flex flex-col gap-2">
              {dogs.map((dog) => (
                <DogSummaryCard
                  key={dog.id}
                  dog={dog}
                  onOpenDog={onOpenDog}
                />
              ))}
            </div>
          )}

          {loading ? (
            <div className="py-6"><LoadingSpinner label="Loading customer…" /></div>
          ) : error ? (
            <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-2">
              Couldn't load customer details: {error}
            </div>
          ) : !displayHuman ? (
            <UnmatchedEmptyState phone={displayPhone} />
          ) : (
            <>
              {/* Actions — compact with a clear hierarchy: a quick-contact
                  icon row, the primary Book-appointment CTA, then the
                  secondary profile / update-notes pair. */}
              {(tel || waMe || displayHuman.email) && (
                <div className="flex gap-2">
                  {tel && (
                    <a
                      href={tel}
                      aria-label={`Call ${displayPhone}`}
                      title={`Call ${displayPhone}`}
                      className="flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl border border-slate-200 bg-white text-brand-purple no-underline hover:border-brand-yellow/60 hover:bg-brand-yellow/5 transition-colors"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                      <span className="text-[10px] font-semibold">Call</span>
                    </a>
                  )}
                  {waMe && (
                    <a
                      href={waMe}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open WhatsApp Web for ${displayPhone}`}
                      title={`Open WhatsApp Web for ${displayPhone}`}
                      className="flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl border border-[#25D366]/40 bg-[#25D366]/10 text-[#108444] no-underline hover:bg-[#25D366]/20 transition-colors"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                      <span className="text-[10px] font-semibold">WhatsApp</span>
                    </a>
                  )}
                  {displayHuman.email && (
                    <a
                      href={`mailto:${displayHuman.email}`}
                      aria-label={`Email ${displayHuman.email}`}
                      title={`Email ${displayHuman.email}`}
                      className="flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-xl border border-slate-200 bg-white text-brand-purple no-underline hover:border-brand-yellow/60 hover:bg-brand-yellow/5 transition-colors"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="2" y="4" width="20" height="16" rx="2" />
                        <path d="m22 7-10 6L2 7" />
                      </svg>
                      <span className="text-[10px] font-semibold">Email</span>
                    </a>
                  )}
                </div>
              )}

              {onBookAppointment && displayHuman && (
                <button
                  type="button"
                  onClick={() => onBookAppointment()}
                  className="flex w-full items-center justify-center gap-1.5 h-9 px-3 rounded-full bg-brand-yellow text-brand-purple text-[12px] font-bold cursor-pointer hover:bg-brand-yellow-dark transition-colors font-[inherit]"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                    <line x1="12" y1="14" x2="12" y2="18" />
                    <line x1="10" y1="16" x2="14" y2="16" />
                  </svg>
                  Book appointment
                </button>
              )}

              {(onOpenHuman || onUpdateNotes) && displayHuman && (
                <div className="flex gap-2">
                  {onOpenHuman && (
                    <button
                      type="button"
                      onClick={() => onOpenHuman(displayHuman.id)}
                      title="Open full profile"
                      aria-label="Open full profile"
                      className="flex-1 flex items-center justify-center gap-1.5 h-9 px-2 rounded-full bg-white border border-slate-300 text-brand-purple text-[11px] font-semibold cursor-pointer hover:border-brand-yellow/60 transition-colors font-[inherit]"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      Profile
                    </button>
                  )}
                  {onUpdateNotes && (
                    <button
                      type="button"
                      onClick={handleUpdateNotes}
                      disabled={updatingNotes}
                      title="Have the AI read this chat and save any durable customer notes and dog grooming requests to their records. Nothing is sent to the customer."
                      className="flex-1 flex items-center justify-center gap-1.5 h-9 px-2 rounded-full bg-white border border-slate-300 text-brand-purple text-[11px] font-semibold cursor-pointer hover:border-brand-yellow/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-[inherit]"
                    >
                      {updatingNotes ? (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="animate-spin">
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                          </svg>
                          Saving…
                        </>
                      ) : (
                        <>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                          </svg>
                          Update notes
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}

              <LastBookingChip lastBooking={lastBooking} />

              {trustedContacts.length > 0 && (
                <Section title="Trusted contacts">
                  <TrustedHumansChips
                    contacts={trustedContacts}
                    onOpenHuman={onOpenHuman}
                  />
                </Section>
              )}

              {/* Address + any history flag sit at the very end (no section
                  header). Email is an action button above; notes have their
                  own card above the dogs. */}
              {(displayHuman.address || displayHuman.historyFlag) && (
                <div>
                  {displayHuman.address && (
                    <DetailLine label="Address" value={displayHuman.address} />
                  )}
                  {displayHuman.historyFlag && (
                    <DetailLine label="Flag" value={displayHuman.historyFlag} accent="rose" />
                  )}
                </div>
              )}
            </>
          )}
        </div>
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
