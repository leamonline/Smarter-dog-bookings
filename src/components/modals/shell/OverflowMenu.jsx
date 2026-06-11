import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { HeaderIconButton } from "./HeaderIconButton.jsx";

// Header overflow ("…") menu extracted from HumanHeader so the dog and
// booking headers can carry the same idiom. Items: { label, onClick,
// disabled }. Renders nothing when there are no items.
export function OverflowMenu({ items }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e) => {
      if (!menuWrapRef.current?.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [menuOpen]);

  if (!items || items.length === 0) return null;

  return (
    <div ref={menuWrapRef} className="relative">
      <HeaderIconButton
        label="More actions"
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <MoreHorizontal size={16} strokeWidth={2.2} aria-hidden="true" />
      </HeaderIconButton>
      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 min-w-[220px] bg-white rounded-lg border border-slate-200 shadow-[0_8px_20px_rgba(45,0,75,0.12)] py-1"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                item.onClick?.();
              }}
              disabled={item.disabled}
              className="w-full text-left px-3 py-1.5 text-sm font-semibold font-inherit text-slate-700 bg-transparent border-none cursor-pointer transition-colors hover:bg-slate-50 disabled:text-slate-300 disabled:cursor-not-allowed"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
