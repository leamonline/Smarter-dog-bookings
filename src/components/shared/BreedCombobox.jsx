import { useEffect, useId, useMemo, useRef, useState } from "react";
import { DOG_BREEDS } from "../../constants/breeds.js";

/**
 * Accessible searchable breed combobox.
 *
 * - Free typing is permitted — the input value is always the source of truth,
 *   so existing dog records with breeds outside DOG_BREEDS (cross breeds,
 *   inconsistent spellings) keep their value and aren't erased.
 * - Picking from the listbox fills the input.
 * - Keyboard: ArrowDown / ArrowUp / Home / End to navigate, Enter to pick,
 *   Escape to close the popup, Tab to commit and move on.
 * - ARIA pattern: role="combobox" on the input with aria-controls /
 *   aria-expanded / aria-activedescendant pointing at a role="listbox".
 */
export function BreedCombobox({
  value,
  onChange,
  placeholder = "Select or search breed",
  ariaLabel = "Breed",
  ariaLabelledBy,
  inputClassName = "",
  inputStyle,
  listboxClassName = "",
  wrapperClassName = "",
  breeds = DOG_BREEDS,
  autoFocus = false,
}) {
  const reactId = useId();
  const listboxId = `${reactId}-breed-listbox`;
  const optionIdPrefix = `${reactId}-breed-option`;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const listboxRef = useRef(null);

  const trimmedValue = (value || "").trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!trimmedValue) return breeds;
    return breeds.filter((b) => b.toLowerCase().includes(trimmedValue));
  }, [breeds, trimmedValue]);

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Keep highlighted option in view.
  useEffect(() => {
    if (!open || activeIndex < 0 || !listboxRef.current) return;
    const el = listboxRef.current.querySelector(
      `#${CSS.escape(optionIdPrefix)}-${activeIndex}`,
    );
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, open, optionIdPrefix]);

  const commit = (next) => {
    onChange(next);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(filtered.length > 0 ? 0 : -1);
      } else if (filtered.length > 0) {
        setActiveIndex((i) => (i + 1) % filtered.length);
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(filtered.length > 0 ? filtered.length - 1 : -1);
      } else if (filtered.length > 0) {
        setActiveIndex((i) => (i <= 0 ? filtered.length - 1 : i - 1));
      }
      return;
    }
    if (e.key === "Home") {
      if (open && filtered.length > 0) {
        e.preventDefault();
        setActiveIndex(0);
      }
      return;
    }
    if (e.key === "End") {
      if (open && filtered.length > 0) {
        e.preventDefault();
        setActiveIndex(filtered.length - 1);
      }
      return;
    }
    if (e.key === "Enter") {
      if (open && activeIndex >= 0 && filtered[activeIndex]) {
        e.preventDefault();
        commit(filtered[activeIndex]);
      } else if (open) {
        // No highlight — accept typed value as-is.
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (e.key === "Escape") {
      if (open) {
        e.stopPropagation();
        setOpen(false);
        setActiveIndex(-1);
      }
      return;
    }
  };

  const activeId =
    open && activeIndex >= 0 ? `${optionIdPrefix}-${activeIndex}` : undefined;

  return (
    <div ref={wrapperRef} className={`relative ${wrapperClassName}`}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeId}
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        aria-labelledby={ariaLabelledBy}
        value={value || ""}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value);
          if (!open) setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className={inputClassName}
        style={inputStyle}
      />
      {open && filtered.length > 0 && (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          aria-label="Breeds"
          className={`absolute left-0 right-0 top-full mt-1 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white text-slate-800 shadow-[0_4px_12px_rgba(0,0,0,0.12)] z-30 ${listboxClassName}`}
        >
          {filtered.map((breed, idx) => {
            const isActive = idx === activeIndex;
            return (
              <li
                key={breed}
                id={`${optionIdPrefix}-${idx}`}
                role="option"
                aria-selected={isActive}
                onMouseDown={(e) => {
                  // mousedown so we commit before the input's blur fires.
                  e.preventDefault();
                  commit(breed);
                  inputRef.current?.focus();
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`px-3 py-1.5 text-[13px] cursor-pointer ${
                  isActive ? "bg-[#E6F5F2] text-brand-teal" : ""
                }`}
              >
                {breed}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
