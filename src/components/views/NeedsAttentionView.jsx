// Needs Attention — a read-only backlog of unfinished work from previous
// days: dogs never marked collected, bookings left in an active status
// after their day passed, and completed grooms whose payment record looks
// incomplete. Clicking an item opens the existing booking detail modal;
// this view itself changes nothing (no status writes, no payment writes,
// no customer messages).
import { RefreshCw } from "lucide-react";
import { resolveBookingDisplay } from "../../engine/bookingRules";
import { getStatusDisplay } from "../../constants/salon";
import { ageLabel, NEEDS_ATTENTION_LOOKBACK_DAYS } from "../../engine/needsAttention";
import { useNeedsAttention } from "../../hooks/useNeedsAttention";

function dateLabel(dateStr) {
  if (!dateStr) return "";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function SectionSkeleton() {
  return (
    <div aria-label="Loading needs attention" className="grid gap-4 motion-safe:animate-pulse">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-brand-paper-line bg-white p-4">
          <div className="mb-3 h-5 w-48 rounded bg-slate-100" />
          <div className="mb-2 h-14 rounded-xl bg-slate-50" />
          <div className="h-14 rounded-xl bg-slate-50" />
        </div>
      ))}
    </div>
  );
}

function AttentionRow({ item, dogs, humans, onOpenBooking }) {
  // One row per task (a multi-dog group is one task) — names resolved via
  // the display selector so a raw UUID can never render.
  const names = item.bookings
    .map((b) => resolveBookingDisplay(b, dogs, humans).dogName)
    .filter(Boolean);
  const display = resolveBookingDisplay(item.booking, dogs, humans);
  const status = getStatusDisplay(item.booking.status);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpenBooking?.(item.booking.id, item.booking)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-brand-paper-line bg-white text-left cursor-pointer transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-purple focus-visible:outline-offset-2 font-[inherit]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-bold text-brand-purple truncate">
              {names.length > 0 ? names.join(" & ") : "Unnamed booking"}
            </span>
            {display.owner && !display.ownerMissing && (
              <span className="text-xs text-slate-500 truncate">{display.owner}</span>
            )}
          </div>
          <div className="mt-0.5 text-xs text-slate-600">
            {dateLabel(item.date)}
            {item.slot ? ` · ${item.slot}` : ""}
            {` — ${item.detail}`}
          </div>
          <div className="mt-1 flex items-center gap-1.5">
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold ${
                item.isStale
                  ? "bg-brand-coral-light text-brand-coral-dark"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {ageLabel(item.ageDays)}
            </span>
            {item.isStale && (
              <span className="text-[11px] font-semibold text-brand-coral-dark">
                Needs chasing
              </span>
            )}
          </div>
        </div>
        <span
          className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold"
          style={{ background: status.bg, color: status.color }}
        >
          {status.label}
        </span>
      </button>
    </li>
  );
}

function AttentionSection({ section, dogs, humans, onOpenBooking }) {
  return (
    <section
      aria-label={`${section.title} — ${section.items.length} ${section.items.length === 1 ? "item" : "items"}`}
      className="rounded-2xl border border-brand-paper-line bg-white p-4"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-base font-bold text-brand-purple m-0">{section.title}</h2>
        <span className="min-w-[24px] h-6 px-1.5 rounded-full bg-brand-purple text-white text-xs font-bold flex items-center justify-center">
          {section.items.length}
        </span>
      </div>
      <p className="mt-1 mb-3 text-xs text-slate-500">{section.description}</p>
      {section.items.length === 0 ? (
        <p className="m-0 text-sm text-slate-400">Nothing here — all resolved.</p>
      ) : (
        <ul className="m-0 p-0 list-none grid gap-2">
          {section.items.map((item) => (
            <AttentionRow
              key={`${item.kind}:${item.booking.id}`}
              item={item}
              dogs={dogs}
              humans={humans}
              onOpenBooking={onOpenBooking}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// Presentational half — takes the classified summary as props so the
// component test can drive it without a network. The container below
// wires it to the read-only hook.
export function NeedsAttentionContent({
  loading,
  available,
  summary,
  dogs,
  humans,
  onOpenBooking,
  onRefresh,
}) {
  return (
    <div className="max-w-3xl mx-auto py-4">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-brand-purple m-0">Needs Attention</h1>
          <p className="mt-1 mb-0 text-sm text-slate-600">
            {loading
              ? "Checking the last few weeks…"
              : available
                ? `${summary.total} ${summary.total === 1 ? "item" : "items"} from the last ${NEEDS_ATTENTION_LOOKBACK_DAYS} days`
                : "Needs a live connection to check previous days."}
          </p>
          {/* Oldest first, so the count that matters is the stale one — the
              rest is usually yesterday's paperwork, cleared as a matter of
              course. */}
          {!loading && available && summary.staleTotal > 0 && (
            <p className="mt-0.5 mb-0 text-sm font-semibold text-brand-coral-dark">
              {summary.staleTotal} waiting more than a fortnight
            </p>
          )}
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh"
            className="tap-target shrink-0 w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer border border-brand-paper-line bg-white text-brand-purple hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        )}
      </div>

      {loading ? (
        <SectionSkeleton />
      ) : !available ? null : summary.total === 0 ? (
        <div className="rounded-2xl border border-brand-paper-line bg-white p-6 text-center">
          <p className="m-0 text-base font-bold text-brand-teal-dark">All clear</p>
          <p className="mt-1 mb-0 text-sm text-slate-500">
            Nothing from previous days needs resolving.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {summary.sections.map((section) => (
            <AttentionSection
              key={section.kind}
              section={section}
              dogs={dogs}
              humans={humans}
              onOpenBooking={onOpenBooking}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function NeedsAttentionView({ dogs, humans, onOpenBooking }) {
  const { loading, available, summary, refresh } = useNeedsAttention();
  return (
    <NeedsAttentionContent
      loading={loading}
      available={available}
      summary={summary}
      dogs={dogs}
      humans={humans}
      onOpenBooking={onOpenBooking}
      onRefresh={refresh}
    />
  );
}
