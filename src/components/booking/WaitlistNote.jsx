import { useState, useRef, useEffect } from "react";
import { useWaitlist } from "../../supabase/hooks/useWaitlist.js";

export function WaitlistNote({ currentDateObj, humans, dogs, onOpenHuman }) {
  const { waitlist, loading, joinWaitlist, leaveWaitlist } = useWaitlist(currentDateObj);
  const [open, setOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addingId, setAddingId] = useState(null);
  const ref = useRef(null);

  const humanList = Object.values(humans || {}).sort((a, b) => a.name.localeCompare(b.name));

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setShowAdd(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") { setOpen(false); setShowAdd(false); }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const handleJoin = async (humanId) => {
    if (!humanId) return;
    setAddingId(humanId);
    try {
      await joinWaitlist(humanId, currentDateObj.toISOString().split("T")[0]);
      setShowAdd(false);
    } catch {
      alert("Failed to join waitlist");
    } finally {
      setAddingId(null);
    }
  };

  const count = waitlist.length;

  if (loading && count === 0) return null;

  return (
    <div ref={ref} className="relative snap-center shrink-0">
      {/* Post-it tab — same size as day tabs */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={`Waitlist: ${count} ${count === 1 ? "person" : "people"}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); } }}
        className="flex-1 min-w-[56px] md:min-w-[72px] rounded-t-[10px] bg-[#FFFBF2] text-center border-[1.5px] border-b-0 border-[#F5E6C8] select-none pb-1.5 cursor-pointer transition-all hover:-translate-y-0.5 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]"
      >
        <div className="py-[3px] text-[8px] font-extrabold text-[#B8860B] uppercase tracking-[0.8px] rounded-t-lg bg-[#F5E6C8]">
          Wait List
        </div>
        <div className="text-lg md:text-2xl font-black leading-none mt-0.5 text-[#B8860B]">
          {count}
        </div>
        <div className="text-[10px] md:text-[13px] font-extrabold leading-none mt-px text-[#B8860B]/60">
          {count === 1 ? "person" : "people"}
        </div>
      </div>

      {/* Post-it dropdown — square, simple */}
      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 w-[min(280px,calc(100vw-32px))] max-h-[320px] bg-[#FFFBF2] border border-[#F5E6C8] rounded-md shadow-[0_4px_20px_rgba(0,0,0,0.12),0_2px_6px_rgba(0,0,0,0.06)] p-4 flex flex-col animate-[fadeIn_0.12s_ease-out]">
          {/* Tape strip */}
          <div className="absolute -top-[6px] left-1/2 -translate-x-1/2 w-10 h-3 bg-[#F5E6C8]/80 rounded-sm" />

          <div className="text-[15px] font-black text-[#B8860B] mb-3">
            Wait List
          </div>

          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="mb-3 py-2 px-3 rounded-lg border-[1.5px] border-dashed border-[#D4A500]/30 bg-white/60 text-[#B8860B] text-xs font-bold cursor-pointer transition-all hover:border-[#B8860B] hover:bg-white w-full text-center"
          >
            + Add Person
          </button>

          {showAdd && (
            <div className="flex gap-2 bg-white p-2 rounded-lg border border-slate-200 mb-2">
              <select
                aria-label="Select customer to add to waitlist"
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

          <div className="flex-1 overflow-y-auto flex flex-col gap-1.5">
            {count > 0 ? (
              waitlist.map(entry => {
                const h = entry.humans;
                const theirDogs = Object.values(dogs || {}).filter(d => d._humanId === h.id);
                const dogNames = theirDogs.map(d => d.name).join(", ") || "No dogs";

                return (
                  <div key={entry.id} className="flex items-center justify-between bg-white/70 py-2 px-3 rounded-lg border border-[#F5E6C8]">
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => { onOpenHuman && onOpenHuman(h.id); setOpen(false); }}>
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
              })
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs italic text-[#B8860B]/50">
                No one waiting yet
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
