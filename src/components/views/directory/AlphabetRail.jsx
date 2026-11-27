import { useMemo } from "react";

const AZ_LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "#",
];

// A–Z jump rail. Letters with no matches under the current query are disabled.
// The same component renders as a vertical sticky rail on desktop and a
// horizontal scroll strip on mobile (caller sets the layout classes).
export function AlphabetRail({ availableLetters, activeLetter, onLetterChange, className = "" }) {
  const have = useMemo(() => new Set(availableLetters || []), [availableLetters]);
  return (
    <nav aria-label="Jump to letter" className={className}>
      {AZ_LETTERS.map((letter) => {
        const enabled = have.has(letter) || activeLetter === letter;
        const active = activeLetter === letter;
        return (
          <button
            key={letter}
            type="button"
            onClick={() => onLetterChange(letter)}
            disabled={!enabled}
            aria-pressed={active}
            aria-label={`Jump to ${letter === "#" ? "non-letter names" : `the letter ${letter}`}`}
            className={`shrink-0 w-7 h-7 max-md:w-9 max-md:h-9 rounded-md text-micro font-bold flex items-center justify-center transition-colors ${
              active
                ? "bg-brand-yellow text-brand-ink"
                : enabled
                  ? "text-slate-600 hover:bg-brand-ink/10 hover:text-brand-ink cursor-pointer"
                  : "text-slate-400 cursor-default"
            }`}
          >
            {letter}
          </button>
        );
      })}
    </nav>
  );
}
