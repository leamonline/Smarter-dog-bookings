// The header icon button shared by the entity-modal headers (edit /
// overflow / close / gallery). 44px on phones and tablets (including iPad
// portrait at 768px, which the old `sm` cliff missed), shrinking to a quiet
// 32px only on desktop (lg+), so it meets the touch-target floor everywhere
// a finger is used.
export function HeaderIconButton({ label, onClick, className = "", children, ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`w-11 h-11 lg:w-8 lg:h-8 rounded-lg flex items-center justify-center bg-white border border-slate-200 cursor-pointer text-slate-500 hover:text-brand-purple hover:border-brand-purple/30 hover:bg-brand-purple/5 transition-colors shrink-0 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
