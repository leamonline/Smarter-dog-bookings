import { useState } from "react";
import { useToast } from "../../contexts/ToastContext.jsx";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";

export function WaitlistModal({
  onClose,
  currentDateObj,
  humans,
  dogs,
  onOpenHuman,
  waitlist,
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
    <AccessibleModal
      onClose={onClose}
      titleId={titleId}
      className="bg-emerald-50 rounded-2xl w-[480px] max-w-[calc(100vw-32px)] shadow-[0_8px_32px_rgba(0,0,0,0.18)] overflow-hidden border border-emerald-100"
    >
      <div className="bg-emerald-500 px-4 py-3 border-b border-emerald-600 flex items-center justify-between">
        <div id={titleId} className="text-base font-bold text-white font-display tracking-wide">
          Waitlist — {dateLabel} ({waitlist.length})
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close waitlist"
          className="w-7 h-7 rounded-md flex items-center justify-center border-none cursor-pointer transition-all bg-white/15 text-white hover:bg-white/25"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {!showAdd ? (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="self-start text-[12px] font-bold text-emerald-700 bg-white hover:bg-emerald-100 border border-emerald-200 rounded-md px-3 py-1.5 cursor-pointer transition-colors"
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

        {error && <div className="text-xs text-brand-coral">{error}</div>}

        {waitlist.length > 0 ? (
          <ul className="list-none m-0 p-0 flex flex-col gap-1">
            {waitlist.map((entry) => {
              const h = entry.humans;
              const theirDogs = Object.values(dogs || {}).filter((d) => d._humanId === h.id);
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
      </div>

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
    </AccessibleModal>
  );
}
