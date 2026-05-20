import { SIZE_THEME, getSizeForBreed } from "../../../constants/index.js";
import { titleCase } from "../../../utils/text.js";

const PILL_FALLBACK = { light: "#E5E7EB", primary: "#6B7280" };

// Compact owner-modal pill that links out to a dog's profile.
// onClose runs first (so the human modal closes before the dog modal
// opens) — matches the inline definition that this replaces.
export function DogPill({ dog, onClose, onOpenDog }) {
  const dogSize = dog.size || getSizeForBreed(dog.breed);
  const theme = SIZE_THEME[dogSize] || PILL_FALLBACK;
  const colours = { bg: theme.light, text: theme.primary };
  const hasAlerts = dog.alerts && dog.alerts.length > 0;
  return (
    <button
      type="button"
      onClick={() => {
        onClose?.();
        onOpenDog?.(dog.id || dog.name);
      }}
      aria-label={`Open ${dog.name}${hasAlerts ? " (has alerts)" : ""}`}
      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full cursor-pointer text-xs font-bold transition-opacity hover:opacity-80 border-none font-inherit focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/60"
      style={{ background: colours.bg, color: colours.text }}
    >
      {hasAlerts && <span aria-hidden="true">{"⚠️ "}</span>}
      {titleCase(dog.name)} · {titleCase(dog.breed)}
    </button>
  );
}
