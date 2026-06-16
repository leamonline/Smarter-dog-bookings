import { useMemo, useState } from "react";
import { Dog as DogIcon, Plus } from "lucide-react";
import { IconSearch } from "../../icons/index.jsx";
import { titleCase } from "../../../utils/text";
import { getHumanByIdOrName } from "../../../engine/bookingRules";

const ACCENT = "var(--color-brand-teal)";

// Two ways to link dogs from a human's card, mirroring the dog card's
// "add a trusted human" flow in reverse:
//   • "Add a dog they own" — opens AddDogModal with this human pre-set as the
//     owner (handled by the parent via onAddOwnedDog).
//   • "Link to a dog" — make this human a trusted contact (drop-off / pickup)
//     on an existing dog, i.e. on that dog's owner (onLinkTrustedOnDog).
export function LinkDogActions({
  human,
  humans,
  dogs,
  onAddOwnedDog,
  onLinkTrustedOnDog,
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return Object.values(dogs || {})
      .filter((d) => {
        if (!d?.id) return false;
        // Hide dogs this human already owns — linking is for dogs they don't.
        if (d._humanId === human.id || d.humanId === human.fullName) return false;
        const name = (d.name || "").toLowerCase();
        const breed = (d.breed || "").toLowerCase();
        return name.includes(q) || breed.includes(q);
      })
      .slice(0, 6);
  }, [query, dogs, human.id, human.fullName]);

  const handlePick = async (dog) => {
    setBusyId(dog.id);
    try {
      await onLinkTrustedOnDog(dog);
      setQuery("");
      setShowSearch(false);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex gap-2">
        {onAddOwnedDog && (
          <button
            type="button"
            onClick={onAddOwnedDog}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border-[1.5px] text-[13px] font-bold cursor-pointer font-inherit transition-all bg-white"
            style={{ borderColor: ACCENT, color: ACCENT }}
          >
            <Plus size={14} strokeWidth={2.6} aria-hidden="true" />
            Add a dog they own
          </button>
        )}
        {onLinkTrustedOnDog && (
          <button
            type="button"
            onClick={() => setShowSearch((v) => !v)}
            aria-expanded={showSearch}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border-[1.5px] border-dashed text-[13px] font-bold cursor-pointer font-inherit transition-all"
            style={{
              borderColor: ACCENT,
              background: showSearch ? ACCENT : "#FFFFFF",
              color: showSearch ? "#FFFFFF" : ACCENT,
            }}
          >
            <DogIcon size={14} strokeWidth={2.4} aria-hidden="true" />
            {showSearch ? "Cancel" : "Link to a dog"}
          </button>
        )}
      </div>

      {showSearch && (
        <div>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex pointer-events-none">
              <IconSearch size={14} colour="#6B7280" />
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              placeholder="Search a dog by name or breed…"
              aria-label="Search for a dog to link this person to"
              className="w-full px-3 py-2 pl-8 rounded-lg border text-[13px] outline-none font-inherit text-slate-800 box-border"
              style={{ borderColor: ACCENT }}
            />
          </div>
          {results.length > 0 && (
            <div className="mt-1 border border-slate-200 rounded-lg overflow-hidden bg-white">
              {results.map((d) => {
                const owner = getHumanByIdOrName(humans, d._humanId || d.humanId);
                const ownerLabel = owner?.fullName || "";
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={busyId === d.id}
                    onClick={() => handlePick(d)}
                    className="w-full text-left bg-white px-3 py-2 cursor-pointer border-x-0 border-t-0 border-b border-slate-100 transition-colors hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus-visible:bg-slate-50"
                  >
                    <div className="text-[13px] font-semibold text-slate-800">
                      {titleCase(d.name)}
                      {d.breed && (
                        <span className="text-xs font-medium text-slate-500 ml-1.5">
                          {titleCase(d.breed)}
                        </span>
                      )}
                    </div>
                    {ownerLabel && (
                      <div className="text-[11px] text-slate-400">
                        Owner: {titleCase(ownerLabel)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {query.trim() && results.length === 0 && (
            <div className="mt-1 text-[12px] text-slate-400 italic px-1">
              No matching dogs.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
