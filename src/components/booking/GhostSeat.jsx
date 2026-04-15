// src/components/booking/GhostSeat.jsx
import { useState } from "react";

function BlockMenu({ onBlock1, onBlock2, onBlockBoth, onClose }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-[10px] shadow-lg border border-slate-200 p-2 flex flex-col gap-1 z-10 min-w-[140px]"
    >
      {[
        { label: "Block seat 1", action: onBlock1 },
        { label: "Block seat 2", action: onBlock2 },
        { label: "Block both", action: onBlockBoth },
      ].map(({ label, action }) => (
        <button
          key={label}
          onClick={() => { action(); onClose(); }}
          aria-label={label}
          className="py-1.5 px-3 rounded-md border-none bg-brand-coral-light text-brand-coral text-xs font-bold cursor-pointer font-[inherit] transition-all text-left hover:bg-brand-coral hover:text-white"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function GhostSeat({ onClick, onBlock, span }) {
  const [showMenu, setShowMenu] = useState(false);

  const spanClass = span ? "col-span-2" : "";

  // Simple ghost seat without blocking (e.g., rebook modal)
  if (!onBlock) {
    return (
      <div
        onClick={onClick}
        className={`border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-300 text-lg cursor-pointer transition-all min-h-[36px] md:min-h-[44px] hover:border-brand-cyan hover:text-brand-cyan hover:bg-sky-50 ${spanClass}`}
      >
        +
      </div>
    );
  }

  // Ghost seat with block button
  return (
    <div
      className={`border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center gap-1.5 transition-all min-h-[36px] md:min-h-[44px] relative ${spanClass}`}
    >
      {/* Book button */}
      <button
        onClick={onClick}
        aria-label="Book this seat"
        className="w-8 h-8 rounded-md bg-sky-50 text-brand-cyan border-none flex items-center justify-center cursor-pointer transition-all font-[inherit] text-sm font-bold hover:bg-brand-cyan hover:text-white"
      >
        +
      </button>

      {/* Block button */}
      <button
        aria-label="Block this seat"
        onClick={(e) => {
          e.stopPropagation();
          if (span) {
            setShowMenu(true);
          } else {
            onBlock();
          }
        }}
        className="w-8 h-8 rounded-md bg-pink-50 text-brand-coral border-none flex items-center justify-center cursor-pointer transition-all font-[inherit] hover:bg-brand-coral hover:text-white"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
          <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Block menu for spanning ghost seats */}
      {showMenu && (
        <BlockMenu
          onBlock1={() => onBlock(0)}
          onBlock2={() => onBlock(1)}
          onBlockBoth={() => { onBlock(0); onBlock(1); }}
          onClose={() => setShowMenu(false)}
        />
      )}
    </div>
  );
}
