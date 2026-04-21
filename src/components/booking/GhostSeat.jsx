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

export function GhostSeat({ onClick, onBlock, span, onDragOver, onDragLeave, onDrop, isDropTarget }) {
  const [showMenu, setShowMenu] = useState(false);

  const spanClass = span ? "col-span-2" : "";
  const dropClass = isDropTarget
    ? "border-brand-yellow bg-brand-yellow/20 ring-2 ring-brand-yellow/40"
    : "";

  // Simple ghost seat without blocking (e.g., rebook modal)
  if (!onBlock) {
    return (
      <button
        onClick={onClick}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        aria-label="Book this seat"
        title="Add booking"
        className={`group border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center gap-1.5 text-slate-400 cursor-pointer transition-all duration-200 min-h-[44px] font-[inherit] hover:border-brand-yellow hover:text-brand-purple hover:bg-brand-yellow/15 ${spanClass} ${dropClass}`}
      >
        <span className="text-lg font-bold transition-transform duration-200 group-hover:scale-125">+</span>
        <span className="text-xs font-semibold">Book</span>
      </button>
    );
  }

  // Ghost seat with block button
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center gap-1.5 transition-all duration-200 min-h-[44px] relative px-1.5 hover:border-brand-yellow/60 ${spanClass} ${dropClass}`}
    >
      {/* Book button — mustard CTA on hover */}
      <button
        onClick={onClick}
        aria-label="Book this seat"
        title="Add booking"
        className="group/book flex-1 min-h-[40px] rounded-full bg-brand-yellow/15 text-brand-purple border-none flex items-center justify-center gap-1 cursor-pointer transition-all duration-200 font-[inherit] hover:bg-brand-yellow"
      >
        <span className="text-sm font-bold transition-transform duration-200 group-hover/book:scale-125">+</span>
        <span className="text-xs font-semibold">Book</span>
      </button>

      {/* Block button */}
      <button
        aria-label="Block this seat"
        title="Block this timeslot"
        onClick={(e) => {
          e.stopPropagation();
          if (span) {
            setShowMenu(true);
          } else {
            onBlock();
          }
        }}
        className="group/block w-10 h-10 rounded-full bg-pink-50 text-brand-coral border-none flex items-center justify-center shrink-0 cursor-pointer transition-all duration-200 font-[inherit] hover:bg-brand-coral hover:text-white"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="transition-transform duration-200 group-hover/block:scale-110">
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
