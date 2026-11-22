// The segmented stripe from the salon's printed flyer: nine rounded segments,
// copied in order from the flyer's top edge (two yellow, one navy, the rest the
// flyer blue; two segments double width). Flyer visual language, decision 4:
// docs/plans/active/2026-11-22-flyer-visual-language.md.
//
// It frames the top of a screen and never sits inside content. Purely
// decorative, so it is hidden from assistive technology. Colours come from the
// .brand-stripe rules in src/index.css, never from props.
//
//   size="bar"  7px, across the top of an ordinary screen
//   size="hero" 16px, on sign-in and other hero screens

const SEGMENTS = ["blue", "blue wide", "yellow", "blue", "navy", "blue wide", "blue", "blue", "yellow"];

export function BrandStripe({ size = "bar", className = "" }) {
  return (
    <div aria-hidden="true" data-brand-stripe={size} className={`brand-stripe brand-stripe--${size} ${className}`.trim()}>
      {SEGMENTS.map((segment, index) => (
        <span
          key={index}
          className={segment
            .split(" ")
            .map((part) => `brand-stripe__seg--${part}`)
            .concat("brand-stripe__seg")
            .join(" ")}
        />
      ))}
    </div>
  );
}
