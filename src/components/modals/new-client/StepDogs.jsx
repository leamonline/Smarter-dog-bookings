import { useMemo, useState } from "react";
import { getSizeForBreed, BREED_LIST } from "../../../constants/breeds";

const INPUT =
  "w-full px-3 py-2.5 rounded-lg border border-slate-200 text-[14px] outline-none font-[inherit] text-slate-800 box-border focus:border-brand-teal";
const SIZES = [["small", "Small"], ["medium", "Medium"], ["large", "Large"]];

function emptyDraft() {
  return { name: "", breed: "", size: "", gender: "", colour: "", groomNotes: "" };
}

// Step 2 — add the customer's dog(s). Each added dog accumulates in the
// wizard's `dogs` state (write-at-end). Breed auto-fills size (overridable).
export function StepDogs({ dogs, onAddDog, onRemoveDog }) {
  const [draft, setDraft] = useState(emptyDraft);
  const [sizeOverridden, setSizeOverridden] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [err, setErr] = useState("");

  const breeds = useMemo(() => [...new Set(Object.values(BREED_LIST).flat())].sort(), []);
  const setField = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  const onBreed = (v) => {
    setDraft((d) => {
      const next = { ...d, breed: v };
      if (!sizeOverridden) {
        const s = getSizeForBreed(v);
        if (s) next.size = s;
      }
      return next;
    });
  };
  const onSize = (v) => { setSizeOverridden(true); setField("size", v); };

  const addDog = () => {
    if (!draft.name.trim()) { setErr("Give the dog a name."); return; }
    if (!draft.size) { setErr("Pick a size."); return; }
    onAddDog({
      clientKey: crypto.randomUUID(),
      name: draft.name.trim(),
      breed: draft.breed.trim(),
      size: draft.size,
      gender: draft.gender || undefined,
      colour: draft.colour.trim() || undefined,
      groomNotes: draft.groomNotes.trim() || undefined,
    });
    setDraft(emptyDraft());
    setSizeOverridden(false);
    setShowMore(false);
    setErr("");
  };

  return (
    <div className="flex flex-col gap-4">
      {dogs.length > 0 && (
        <ul className="flex flex-col gap-2">
          {dogs.map((d) => (
            <li key={d.clientKey}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200">
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-brand-purple truncate">{d.name}</div>
                <div className="text-[11px] text-slate-500 truncate">
                  {[d.breed, d.size].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button type="button" onClick={() => onRemoveDog(d.clientKey)} aria-label={`Remove ${d.name}`}
                className="shrink-0 text-slate-400 hover:text-brand-coral text-lg leading-none px-1">×</button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-xl border border-dashed border-slate-300 bg-brand-paper p-3 flex flex-col gap-3">
        <div className="text-[12px] font-bold text-brand-teal-text">
          {dogs.length ? "Add another dog" : "Add their dog"}
        </div>
        <input className={INPUT} value={draft.name} aria-label="Dog name" placeholder="Dog name *"
          onChange={(e) => setField("name", e.target.value)} />
        <input className={INPUT} list="nc-breeds" value={draft.breed} aria-label="Breed"
          placeholder="Breed (sets the size)" onChange={(e) => onBreed(e.target.value)} />
        <datalist id="nc-breeds">{breeds.map((b) => <option key={b} value={b} />)}</datalist>

        <div className="flex gap-2" role="group" aria-label="Size">
          {SIZES.map(([v, l]) => (
            <button key={v} type="button" onClick={() => onSize(v)} aria-pressed={draft.size === v}
              className={`flex-1 py-2 rounded-lg border text-[12px] font-bold transition-colors ${
                draft.size === v
                  ? "bg-brand-teal text-white border-brand-teal"
                  : "bg-white text-slate-600 border-slate-200"
              }`}>{l}</button>
          ))}
        </div>

        {showMore && (
          <div className="flex flex-col gap-3">
            <select className={INPUT} value={draft.gender} aria-label="Sex"
              onChange={(e) => setField("gender", e.target.value)}>
              <option value="">Sex (optional)</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
            <input className={INPUT} value={draft.colour} placeholder="Colour / markings"
              onChange={(e) => setField("colour", e.target.value)} aria-label="Colour" />
            <textarea className={`${INPUT} resize-y`} rows={2} value={draft.groomNotes}
              placeholder="Groom notes" aria-label="Groom notes"
              onChange={(e) => setField("groomNotes", e.target.value)} />
          </div>
        )}

        <button type="button" onClick={() => setShowMore((v) => !v)}
          className="self-start text-[12px] font-bold text-brand-teal hover:underline">
          {showMore ? "− Fewer details" : "+ More details"}
        </button>

        {err && <div role="alert" className="text-[12px] text-brand-coral font-semibold">{err}</div>}

        <button type="button" onClick={addDog}
          className="self-start px-4 py-2 rounded-full bg-brand-teal text-white text-[13px] font-bold cursor-pointer hover:opacity-90 transition-opacity">
          + Add this dog
        </button>
      </div>
    </div>
  );
}
