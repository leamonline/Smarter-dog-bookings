import { useState, useEffect, useMemo } from "react";
import { X } from "lucide-react";
import { useToast } from "../../contexts/ToastContext.jsx";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { ModalShell, HeaderIconButton } from "./shell/index.js";
import { InlineError } from "../ui/InlineError.jsx";

export function WaitlistModal({
  onClose,
  currentDateObj,
  humans,
  dogs,
  dogsByHumanId,
  ensureDogsForHumans,
  onOpenHuman,
  waitlist,
  loading = false,
  error,
  joinWaitlist,
  leaveWaitlist,
}) {
  const toast = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(null);

  const humanList = Object.values(humans || {}).sort((a, b) => a.name.localeCompare(b.name));
  const titleId = "waitlist-modal-title";

  const waitlistHumanIdsKey = useMemo(
    () =>
      (waitlist || [])
        .map((entry) => entry?.humans?.id)
        .filter(Boolean)
        .join(","),
    [waitlist],
  );

  useEffect(() => {
    if (!ensureDogsForHumans || !waitlistHumanIdsKey) return;
    ensureDogsForHumans(waitlistHumanIdsKey.split(","));
  }, [ensureDogsForHumans, waitlistHumanIdsKey]);

  const dateLabel = currentDateObj.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const handleJoin = async (humanId) => {
    if (!humanId) return;
    setAddingId(humanId);
    try {
      await joinWaitlist(humanId, currentDateObj.toISOString().split("T")[0]);
      setShowAdd(false);
    } catch (err) {
      console.error(err);
      toast.show("Failed to join waitlist", "error");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <>
    <ModalShell
      onClose={onClose}
      titleId={titleId}
      accent="#10B981"
      widthClass="w-[min(480px,95vw)]"
      bodyClassName="p-4 flex flex-col gap-3"
      rootClassName="bm-fields"
      header={
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 bg-[var(--color-brand-paper)]">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Waitlist
            </span>
            <h2
              id={titleId}
              className="text-xl md:text-2xl font-bold font-display text-brand-purple leading-tight mt-1"
            >
              {dateLabel} ({waitlist.length})
            </h2>
          </div>
          <HeaderIconButton label="Close waitlist" onClick={onClose}>
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        </header>
      }
    >
        {!showAdd ? (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="self-start inline-flex items-center min-h-[44px] text-[12px] font-bold text-emerald-700 bg-white hover:bg-emerald-100 border border-emerald-200 rounded-full px-4 py-1.5 cursor-pointer transition-colors"
          >
            + Add Person
          </button>
        ) : (
          <div className="flex gap-2 bg-white p-2 rounded-lg border border-emerald-200">
            <select
              onChange={(e) => handleJoin(e.target.value)}
              disabled={addingId !== null}
              defaultValue=""
              className="flex-1 p-1.5 rounded-md border border-slate-200 text-xs"
            >
              <option value="" disabled>Select a customer...</option>
              {humanList.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} {h.surname} - {h.phone}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowAdd(false)}
              className="text-xs font-bold text-brand-coral bg-brand-coral-light border-none rounded-md px-3 py-1.5 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}

        <InlineError message={error} />

        {loading && (waitlist || []).length === 0 ? (
          <div className="text-center text-xs italic text-slate-500 py-6">
            Loading the waitlist…
          </div>
        ) : (waitlist || []).length > 0 ? (
          <ul className="list-none m-0 p-0 flex flex-col gap-1">
            {waitlist.map((entry) => {
              const h = entry.humans;
              const theirDogs =
                dogsByHumanId?.[h.id] ||
                Object.values(dogs || {}).filter((d) => d._humanId === h.id);
              const dogNames = theirDogs.map((d) => d.name).join(", ") || "No dogs";
              return (
                <li
                  key={entry.id}
                  className="group flex items-center gap-2 bg-white py-2 px-3 rounded-lg border border-emerald-100 transition-colors hover:border-emerald-300"
                >
                  <button
                    type="button"
                    onClick={() => onOpenHuman && onOpenHuman(h.id)}
                    className="min-w-0 flex-1 text-left bg-transparent border-none cursor-pointer p-0 font-[inherit]"
                  >
                    <div className="text-[13px] font-bold text-slate-800 truncate">
                      {h.name} {h.surname}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {h.phone} · {dogNames}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmRemove({
                        id: entry.id,
                        humanId: h.id,
                        name: `${h.name} ${h.surname}`,
                      })
                    }
                    aria-label="Remove from waitlist"
                    title="Remove"
                    className="text-[11px] font-bold text-brand-coral bg-transparent border-none cursor-pointer hover:underline shrink-0"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="text-center text-xs italic text-slate-500 py-3">
            No one is waiting for this date.
          </div>
        )}
    </ModalShell>

      {confirmRemove && (
        <ConfirmDialog
          title="Remove from waitlist?"
          message={`${confirmRemove.name} will be removed from this date's waitlist.`}
          confirmLabel="Remove"
          variant="danger"
          onConfirm={async () => {
            const { name, humanId } = confirmRemove;
            const dateStr = currentDateObj.toISOString().split("T")[0];
            await leaveWaitlist(confirmRemove.id);
            setConfirmRemove(null);
            toast.show(`${name} removed from waitlist`, "success", () =>
              joinWaitlist(humanId, dateStr),
            );
          }}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </>
  );
}
