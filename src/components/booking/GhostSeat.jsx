import { useState } from "react";

function BlockMenu({ onBlock1, onBlock2, onBlockBoth, onClose }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      role="menu"
      aria-label="Block seats"
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-control shadow-lg border border-slate-200 p-2 flex flex-col gap-1 z-10 min-w-[140px]"
    >
      {[
        { label: "Block seat 1", action: onBlock1 },
        { label: "Block seat 2", action: onBlock2 },
        { label: "Block both", action: onBlockBoth },
      ].map(({ label, action }) => (
        <button
          key={label}
          role="menuitem"
          onClick={() => { action(); onClose(); }}
          aria-label={label}
          className="tap-target py-1.5 px-3 rounded-md border-none bg-brand-coral-light text-brand-coral text-xs font-bold cursor-pointer font-[inherit] transition-all text-left hover:bg-brand-coral hover:text-white"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function GhostSeat({ onClick, onBlock, span, onDragOver, onDragLeave, onDrop, isDropTarget }) {
  const [showMenu, setShowMenu] = useState(false);

  const spanClass = span ? "col-span-2" : "";
  const dropClass = isDropTarget
    ? "border-brand-yellow bg-brand-yellow/20 ring-2 ring-brand-yellow/40"
    : "";

  // Simple, extremely calm and visually compact ghost seat
  if (!onBlock) {
    return (
      <button
        onClick={onClick}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        aria-label="Book this seat"
        title="Add booking"
        className={`group border-[1.5px] border-dashed border-slate-200 rounded-xl flex items-center justify-center gap-1 text-slate-400 cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow focus-visible:ring-offset-1 min-h-[76px] lg:min-h-[80px] font-[inherit] hover:border-slate-300 hover:text-brand-purple hover:bg-slate-50/50 ${spanClass} ${dropClass}`}
      >
        <span className="text-sm font-extrabold transition-transform duration-150 group-hover:scale-110">+</span>
        <span className="text-xs font-bold">Book</span>
      </button>
    );
  }

  // Ghost seat with block button (compressed heights)
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`border-[1.5px] border-dashed border-slate-200 rounded-xl flex items-center justify-center gap-1.5 transition-all duration-150 min-h-[76px] lg:min-h-[80px] relative px-1.5 hover:border-slate-300 ${spanClass} ${dropClass}`}
    >
      {/* Book button — calm layout */}
      <button
        onClick={onClick}
        aria-label="Book this seat"
        title="Add booking"
        className="group/book flex-1 min-h-[56px] lg:min-h-[64px] rounded-lg bg-brand-yellow/5 text-brand-purple border border-brand-yellow/20 flex items-center justify-center gap-1 cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow focus-visible:ring-offset-1 font-[inherit] hover:bg-brand-yellow/15"
      >
        <span className="text-xs font-extrabold transition-transform duration-150 group-hover/book:scale-110">+</span>
        <span className="text-xs font-bold">Book</span>
      </button>

      {/* Block button */}
      <button
        aria-label={span ? "Block seats" : "Block this seat"}
        title={span ? "Block seats" : "Block this seat"}
        onClick={(e) => {
          e.stopPropagation();
          if (span) {
            setShowMenu(true);
          } else {
            onBlock();
          }
        }}
        className="group/block w-8 h-8 rounded-full bg-pink-50 text-brand-coral border-none flex items-center justify-center shrink-0 cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-coral focus-visible:ring-offset-1 font-[inherit] hover:bg-brand-coral hover:text-white"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="transition-transform duration-150 group-hover/block:scale-110">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
          <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Block menu for spanning ghost seats */}
      {showMenu && (
        <BlockMenu
          onBlock1={() => onBlock(0)}
          onBlock2={() => onBlock(1)}
          onBlockBoth={() => onBlock([0, 1])}
          onClose={() => setShowMenu(false)}
        />
      )}
    </div>
  );
}
