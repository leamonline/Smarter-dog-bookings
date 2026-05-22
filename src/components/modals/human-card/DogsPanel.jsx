import { useMemo } from "react";
import { Dog as DogIcon } from "lucide-react";
import { PanelShell } from "./PanelShell.jsx";
import { SizeDot } from "../../ui/SizeDot.jsx";
import { getSizeForBreed } from "../../../constants/index.js";
import { titleCase } from "../../../utils/text.js";

// Replaces the amber DogPill chips. On the dashboard, amber means
// "today / attention" — so an amber dog name was misleading. The new
// rows mirror the Humans directory list (size badge + name + breed
// muted) so the modal visually echoes the list it was opened from.

function DogRow({ dog, onClose, onOpenDog }) {
  const dogSize = dog.size || getSizeForBreed(dog.breed);
  const hasAlerts = dog.alerts && dog.alerts.length > 0;
  return (
    <button
      type="button"
      onClick={() => {
        onClose?.();
        onOpenDog?.(dog.id || dog.name);
      }}
      aria-label={`Open ${dog.name}${hasAlerts ? " (has alerts)" : ""}`}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-transparent border-none cursor-pointer text-left font-inherit hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/60"
    >
      <SizeDot size={dogSize} dim={20} />
      <span className="flex-1 min-w-0 truncate">
        <span className="text-sm font-semibold text-brand-purple">
          {titleCase(dog.name)}
        </span>
        {dog.breed && (
          <span className="text-xs font-medium text-slate-500 ml-1.5">
            {titleCase(dog.breed)}
          </span>
        )}
      </span>
      {hasAlerts && (
        <span aria-hidden="true" title="Has alerts" className="text-xs">
          ⚠️
        </span>
      )}
    </button>
  );
}

export function DogsPanel({
  human,
  humanFullName,
  dogs,
  onClose,
  onOpenDog,
}) {
  const { ownedDogs, trustedDogs } = useMemo(() => {
    const owned = [];
    const trusted = [];
    const trustedSet = new Set(human.trustedIds || []);

    for (const dog of Object.values(dogs || {})) {
      const ownerId = dog._humanId || null;
      const ownerName = dog.humanId || "";
      if (ownerId === human.id || ownerName === humanFullName) {
        owned.push(dog);
      } else if (trustedSet.has(ownerId) || trustedSet.has(ownerName)) {
        trusted.push(dog);
      }
    }
    owned.sort((a, b) => a.name.localeCompare(b.name));
    trusted.sort((a, b) => a.name.localeCompare(b.name));
    return { ownedDogs: owned, trustedDogs: trusted };
  }, [dogs, human.id, humanFullName, human.trustedIds]);

  return (
    <PanelShell eyebrow="Dogs" icon={DogIcon} accent="teal">
      {ownedDogs.length === 0 && trustedDogs.length === 0 ? (
        <div className="text-sm text-slate-400 italic">No dogs linked yet.</div>
      ) : (
        <>
          {ownedDogs.length > 0 && (
            <div className="flex flex-col gap-0.5">
              {ownedDogs.map((d) => (
                <DogRow key={d.id} dog={d} onClose={onClose} onOpenDog={onOpenDog} />
              ))}
            </div>
          )}

          {trustedDogs.length > 0 && (
            <div className={ownedDogs.length > 0 ? "mt-3 pt-3 border-t border-slate-100" : ""}>
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 px-2">
                Trusted to drop off / pick up
              </div>
              <div className="flex flex-col gap-0.5">
                {trustedDogs.map((d) => (
                  <DogRow key={d.id} dog={d} onClose={onClose} onOpenDog={onOpenDog} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </PanelShell>
  );
}
