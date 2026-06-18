// The quiet 32px header icon button shared by the entity-modal headers
// (edit / overflow / close / gallery). Grows to 44px below sm so it
// meets the phone touch-target floor.
export function HeaderIconButton({ label, onClick, className = "", children, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`w-8 h-8 max-sm:w-11 max-sm:h-11 rounded-lg flex items-center justify-center bg-white border border-slate-200 cursor-pointer text-slate-500 hover:text-brand-purple hover:border-brand-purple/30 hover:bg-brand-purple/5 transition-colors shrink-0 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
