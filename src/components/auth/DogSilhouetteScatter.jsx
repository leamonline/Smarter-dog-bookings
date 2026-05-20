// Decorative scatter of the brand's dog silhouette across a card. Each is
// placed deterministically (so the layout doesn't shift between renders) but
// chosen to feel random — varying size, rotation, colour, and opacity.
// Recolouring is done with CSS mask-image: the PNG becomes a stencil and the
// background-color paints through it. Shared by CustomerLoginPage and
// LoginPage so the two entry points read as one brand surface.

const SILHOUETTE_SCATTER = [
  { top: "-4%",  left: "-6%",  size: 130, rot: -18, color: "var(--sd-navy)",        opacity: 0.07 },
  { top: "12%",  left: "82%",  size: 70,  rot:  22, color: "var(--sd-yellow)",      opacity: 0.18 },
  { top: "30%",  left: "-8%",  size: 90,  rot:  12, color: "var(--sd-cyan-dark)",   opacity: 0.07 },
  { top: "44%",  left: "88%",  size: 50,  rot: -28, color: "var(--sd-coral)",       opacity: 0.12 },
  { top: "58%",  left: "8%",   size: 60,  rot:  35, color: "var(--sd-yellow-dark)", opacity: 0.10 },
  { top: "70%",  left: "70%",  size: 110, rot:  -8, color: "var(--sd-navy-soft)",   opacity: 0.06 },
  { top: "88%",  left: "18%",  size: 75,  rot:  18, color: "var(--sd-cyan-dark)",   opacity: 0.09 },
  { top: "92%",  left: "82%",  size: 55,  rot: -14, color: "var(--sd-yellow)",      opacity: 0.13 },
];

const SILHOUETTE_URL = "/images/dog-silhouette.png";

export function DogSilhouetteScatter() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {SILHOUETTE_SCATTER.map((s, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            transform: `rotate(${s.rot}deg)`,
            opacity: s.opacity,
            backgroundColor: s.color,
            WebkitMaskImage: `url(${SILHOUETTE_URL})`,
            maskImage: `url(${SILHOUETTE_URL})`,
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskSize: "contain",
            maskSize: "contain",
            WebkitMaskPosition: "center",
            maskPosition: "center",
          }}
        />
      ))}
    </div>
  );
}
