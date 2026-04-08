import { useState } from "react";
import { useWaitlist } from "../../supabase/hooks/useWaitlist.js";

export function WaitlistPanel({ currentDateObj, humans, dogs, onOpenHuman }) {
  const { waitlist, loading, error, joinWaitlist, leaveWaitlist } = useWaitlist(currentDateObj);
  const [showAdd, setShowAdd] = useState(false);
  const [addingId, setAddingId] = useState(null);

  // Sorted humans for dropdown
  const humanList = Object.values(humans || {}).sort((a, b) => a.name.localeCompare(b.name));

  const handleJoin = async (humanId) => {
    if (!humanId) return;
    setAddingId(humanId);
    try {
      await joinWaitlist(humanId, currentDateObj.toISOString().split("T")[0]);
      setShowAdd(false);
    } catch (err) {
      console.error(err);
      alert("Failed to join waitlist");
    } finally {
      setAddingId(null);
    }
  };

  if (loading && waitlist.length === 0) return null;

  return (
    <div className="mt-3 bg-[#FFFBF2] border border-[#F5E6C8] rounded-[14px] p-4 flex flex-col gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
      <div className="flex justify-between items-center">
        <div className="text-[13px] font-extrabold text-slate-800 uppercase tracking-wide">
          Waitlist ({waitlist.length})
        </div>
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="py-1 px-2 rounded-md border-[1.5px] border-slate-200 bg-white text-slate-500 text-[11px] font-bold cursor-pointer transition-all hover:text-brand-blue hover:border-brand-blue"
          >
            + Add Person
          </button>
        )}
      </div>

      {showAdd && (
        <div className="flex gap-2 bg-white p-2 rounded-lg border border-slate-200">
          <select
            onChange={(e) => handleJoin(e.target.value)}
            disabled={addingId !== null}
            defaultValue=""
            className="flex-1 p-1.5 rounded-md border border-slate-200 text-xs"
          >
            <option value="" disabled>Select a customer...</option>
            {humanList.map(h => (
              <option key={h.id} value={h.id}>{h.name} {h.surname} - {h.phone}</option>
            ))}
          </select>
          <button
            onClick={() => setShowAdd(false)}
            className="py-1.5 px-2.5 rounded-md border-none bg-brand-coral-light text-brand-coral text-[11px] font-bold cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {error && <div className="text-xs text-brand-coral">{error}</div>}

      {waitlist.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {waitlist.map(entry => {
            const h = entry.humans;
            const theirDogs = Object.values(dogs || {}).filter(d => d.humanId === h.id);
            const dogNames = theirDogs.map(d => d.name).join(", ") || "No dogs";

            return (
              <div key={entry.id} className="flex items-center justify-between bg-white py-2 px-3 rounded-lg border border-slate-200">
                <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onOpenHuman && onOpenHuman(h.id)}>
                  <div className="text-[13px] font-bold text-slate-800">{h.name} {h.surname}</div>
                  <div className="text-[11px] text-slate-500 whitespace-nowrap overflow-hidden text-ellipsis">
                    {h.phone} · {dogNames}
                  </div>
                </div>
                <button
                  onClick={() => leaveWaitlist(entry.id)}
                  className="bg-transparent border-none text-brand-coral text-xs font-bold cursor-pointer py-1 px-2"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-xs italic text-slate-500">No one is waiting for this date.</div>
      )}
    </div>
  );
}
