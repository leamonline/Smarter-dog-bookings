// src/components/ui/SectionLabel.jsx
//
// The uppercase, letter-spaced kicker used above cards and sections. Replaces
// the ~34 inline `text-[10px] font-bold text-slate-400 uppercase tracking-wider`
// copies with one element. `text-label` carries size + weight + tracking;
// text-ink-muted is the accessible (AA) grey.
//
// Render as h2/h3 when the label introduces a region so the heading outline is
// correct for screen readers; default div for purely decorative kickers.

export function SectionLabel({ as: Comp = "div", className = "", children, ...rest }) {
  return (
    <Comp className={`text-label text-ink-muted ${className}`} {...rest}>
      {children}
    </Comp>
  );
}
