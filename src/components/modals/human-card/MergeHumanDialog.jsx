import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Search, X } from "lucide-react";
import { AccessibleModal } from "../../shared/AccessibleModal.tsx";
import { ConfirmDialog } from "../../shared/ConfirmDialog.jsx";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { titleCase } from "../../../utils/text";
import { getDogsForHuman } from "../../../utils/directorySearch";

// Merge-duplicate flow for the HumanCardModal. Pick the other record with
// the same debounced search the trusted-contacts picker uses, eyeball a
// side-by-side comparison, choose which record to keep, and confirm. The
// commit goes through the merge_humans RPC (passed in as `onMerge`), which
// reassigns dogs + bookings + trusted contacts to the winner and deletes
// the loser server-side.

function fullNameOf(h) {
  return h?.fullName || `${h?.name || ""} ${h?.surname || ""}`.trim();
}

function countBookings(human, dogs, dogsByHumanId, bookingsByDate) {
  if (!human || !bookingsByDate) return 0;
  // Match by dog id, not name — a shared dog name across owners would
  // otherwise inflate the count (see HumanBookingHistory).
  const ids = new Set(
    getDogsForHuman(human, dogs || {}, dogsByHumanId || {}).map((d) => d.id),
  );
  let n = 0;
  for (const list of Object.values(bookingsByDate)) {
    for (const b of list || []) {
      if (ids.has(b._dogId) || b._ownerId === human.id) {
        n++;
      }
    }
  }
  return n;
}

function CompareColumn({ human, dogs, dogsByHumanId, bookingsByDate, role }) {
  const isWinner = role === "winner";
  const dogCount = getDogsForHuman(human, dogs || {}, dogsByHumanId || {}).length;
  const bookingCount = countBookings(human, dogs, dogsByHumanId, bookingsByDate);
  const rows = [
    ["Phone", human.phone || "—"],
    ["Email", human.email || "—"],
    ["Address", human.address || "—"],
    ["Dogs", String(dogCount)],
    ["Bookings", String(bookingCount)],
  ];
  return (
    <div
      className={`flex-1 min-w-0 rounded-control border p-3 ${
        isWinner
          ? "border-brand-teal/50 bg-brand-teal/5"
          : "border-slate-200 bg-slate-50"
      }`}
    >
      <div
        className={`text-[10px] font-bold uppercase tracking-wider ${
          isWinner ? "text-brand-teal-text" : "text-brand-coral-text"
        }`}
      >
        {isWinner ? "Keep" : "Remove"}
      </div>
      <div className="text-sm font-bold text-brand-purple truncate mt-0.5">
        {titleCase(fullNameOf(human)) || "Unnamed"}
      </div>
      <dl className="mt-2 flex flex-col gap-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-2">
            <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400 shrink-0">
              {label}
            </dt>
            <dd className="text-xs text-slate-600 truncate text-right">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function MergeHumanDialog({
  human,
  humans,
  dogs,
  dogsByHumanId,
  bookingsByDate,
  ensureDogsForHumans,
  searchHumansByTerm,
  onMerge,
  onMerged,
  onClose,
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [otherId, setOtherId] = useState(null);
  const [winnerIsCurrent, setWinnerIsCurrent] = useState(true);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [merging, setMerging] = useState(false);

  // Debounced server search hydrates the humans map (mirrors the
  // trusted-contacts picker), so paginated-out duplicates are findable.
  useEffect(() => {
    const q = query.trim();
    if (!q || !searchHumansByTerm) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      if (cancelled) return;
      searchHumansByTerm(q).catch((err) => console.error("merge search failed:", err));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, searchHumansByTerm]);

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return Object.values(humans || {})
      .filter((c) => c.id && c.id !== human.id)
      .filter((c) => `${fullNameOf(c)} ${c.phone || ""}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, humans, human.id]);

  const other = otherId
    ? Object.values(humans || {}).find((h) => h.id === otherId) || null
    : null;

  // Pull the candidate's dogs in so the comparison counts are accurate even
  // when their dogs sit past the paginated window.
  useEffect(() => {
    if (otherId && ensureDogsForHumans) ensureDogsForHumans([otherId]);
  }, [otherId, ensureDogsForHumans]);

  const winner = winnerIsCurrent ? human : other;
  const loser = winnerIsCurrent ? other : human;

  const handleConfirmMerge = async () => {
    if (!winner?.id || !loser?.id || merging) return;
    setMerging(true);
    try {
      const res = await onMerge(winner.id, loser.id);
      setPendingConfirm(false);
      if (res?.ok) {
        toast.show(
          `Merged ${fullNameOf(loser)} into ${fullNameOf(winner)}`,
          "success",
        );
        onMerged?.(winner.id);
      } else {
        toast.show(res?.error || "Merge failed", "error");
      }
    } finally {
      setMerging(false);
    }
  };

  return (
    <>
      <AccessibleModal
        onClose={onClose}
        titleId="merge-human-title"
        backdropClass="bg-[rgba(45,0,75,0.45)]"
        className="bg-[var(--color-brand-paper)] rounded-[20px] w-[min(560px,95vw)] max-h-[min(85vh,640px)] flex flex-col overflow-hidden shadow-[0_18px_50px_-12px_rgba(45,0,75,0.28)]"
      >
        <header className="shrink-0 flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Merge duplicate
            </div>
            <h2
              id="merge-human-title"
              className="text-lg font-bold font-display text-brand-purple leading-tight mt-0.5"
            >
              {titleCase(fullNameOf(human))}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-slate-200 cursor-pointer text-slate-500 hover:text-brand-purple hover:border-brand-purple/30 transition-colors shrink-0"
          >
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-5">
          {!other ? (
            <div>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-500">
                  Find the duplicate record to merge in
                </span>
                <div className="relative mt-1.5">
                  <Search
                    size={14}
                    aria-hidden="true"
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name or phone…"
                    aria-label="Search for a duplicate human"
                    className="w-full pl-8 pr-2.5 py-2 rounded-control border border-slate-200 text-sm font-inherit outline-none text-brand-purple bg-white focus:border-brand-teal transition-colors"
                  />
                </div>
              </label>
              <div className="mt-2 flex flex-col gap-1">
                {results.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setOtherId(c.id)}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-control bg-white border border-slate-200 cursor-pointer text-left font-inherit hover:border-brand-teal/50 hover:bg-brand-teal/5 transition-colors"
                  >
                    <span className="text-sm font-semibold text-brand-purple truncate">
                      {titleCase(fullNameOf(c))}
                    </span>
                    <span className="text-xs text-slate-400 shrink-0">{c.phone || "No phone"}</span>
                  </button>
                ))}
                {query.trim() && results.length === 0 && (
                  <div className="text-sm text-slate-400 italic px-1 py-2">
                    No other records match “{query.trim()}”.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-stretch gap-2">
                <CompareColumn
                  human={winner}
                  dogs={dogs}
                  dogsByHumanId={dogsByHumanId}
                  bookingsByDate={bookingsByDate}
                  role="winner"
                />
                <CompareColumn
                  human={loser}
                  dogs={dogs}
                  dogsByHumanId={dogsByHumanId}
                  bookingsByDate={bookingsByDate}
                  role="loser"
                />
              </div>

              <button
                type="button"
                onClick={() => setWinnerIsCurrent((v) => !v)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-purple bg-transparent border-none cursor-pointer hover:text-brand-teal-text transition-colors px-1"
              >
                <ArrowLeftRight size={13} strokeWidth={2.4} aria-hidden="true" />
                Swap which record to keep
              </button>

              <p className="mt-3 text-xs text-slate-500 leading-relaxed">
                {titleCase(fullNameOf(loser))}’s dogs, bookings and trusted
                contacts move to {titleCase(fullNameOf(winner))}. Blank fields
                on the kept record are filled in from the other. The removed
                record is deleted.
              </p>

              <div className="mt-4 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setOtherId(null)}
                  className="px-4 py-2 rounded-control border-[1.5px] border-slate-200 bg-white text-slate-600 text-sm font-bold cursor-pointer font-inherit transition-colors hover:bg-slate-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setPendingConfirm(true)}
                  className="ml-auto py-2 px-5 rounded-full border-none text-sm font-bold font-inherit cursor-pointer transition-colors bg-action text-on-action hover:bg-brand-yellow-dark"
                >
                  Merge…
                </button>
              </div>
            </div>
          )}
        </div>
      </AccessibleModal>

      {pendingConfirm && winner && loser && (
        <ConfirmDialog
          title="Merge these records?"
          message={`Merge ${fullNameOf(loser)} into ${fullNameOf(winner)}? Their dogs, bookings and trusted contacts move to ${fullNameOf(winner)}, and ${fullNameOf(loser)} is permanently deleted. This can’t be undone.`}
          confirmLabel={merging ? "Merging…" : "Merge and delete"}
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={handleConfirmMerge}
          onCancel={() => setPendingConfirm(false)}
        />
      )}
    </>
  );
}
