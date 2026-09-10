// Decorative scatter of the brand's dog silhouette across a card. Each is
// placed deterministically (so the layout doesn't shift between renders) but
// chosen to feel random — varying size, rotation, colour, and opacity.
// Recolouring is done with CSS mask-image: the PNG becomes a stencil and the
// background-color paints through it. Shared by CustomerLoginPage and
// LoginPage so the two entry points read as one brand surface.
//
// When `animated` is set, each silhouette drifts gently and independently
// (a slow float + faint rotate wobble + opacity breathe). The motion lives
// on an OUTER wrapper so it composes cleanly with the silhouette's static
// base rotation on the inner span, and it's disabled under
// prefers-reduced-motion (see .dog-silhouette--float in customer-portal.css).

// `hideMobile` marks the four inner silhouettes that crowd the form controls
// on a narrow screen. With the `mobileSparse` prop set (staff LoginPage), they
// are dropped below `sm`, leaving only the four corner shapes as a quiet
// watermark. The customer portal doesn't pass the prop, so it is unchanged.
const SILHOUETTE_SCATTER = [
  { top: "-4%",  left: "-6%",  size: 130, rot: -18, color: "var(--sd-navy)",        opacity: 0.07, dur: 11, delay: 0.0, dist: 12, dx: 5,  wob: 2 },
  { top: "12%",  left: "82%",  size: 70,  rot:  22, color: "var(--sd-yellow)",      opacity: 0.18, dur: 7.5, delay: 1.2, dist: 16, dx: -6, wob: -3 },
  { top: "30%",  left: "-8%",  size: 90,  rot:  12, color: "var(--sd-cyan-dark)",   opacity: 0.07, dur: 9,  delay: 0.6, dist: 10, dx: 7,  wob: 2, hideMobile: true },
  { top: "44%",  left: "88%",  size: 50,  rot: -28, color: "var(--sd-coral)",       opacity: 0.12, dur: 6.5, delay: 2.4, dist: 18, dx: -8, wob: 4, hideMobile: true },
  { top: "58%",  left: "8%",   size: 60,  rot:  35, color: "var(--sd-yellow-dark)", opacity: 0.10, dur: 8.5, delay: 1.8, dist: 14, dx: 6,  wob: -3, hideMobile: true },
  { top: "70%",  left: "70%",  size: 110, rot:  -8, color: "var(--sd-navy-soft)",   opacity: 0.06, dur: 12, delay: 0.4, dist: 11, dx: -5, wob: 2, hideMobile: true },
  { top: "88%",  left: "18%",  size: 75,  rot:  18, color: "var(--sd-cyan-dark)",   opacity: 0.09, dur: 7,  delay: 3.0, dist: 15, dx: 6,  wob: 3 },
  { top: "92%",  left: "82%",  size: 55,  rot: -14, color: "var(--sd-yellow)",      opacity: 0.13, dur: 9.5, delay: 0.9, dist: 13, dx: -7, wob: -2 },
];

const SILHOUETTE_URL = "/app/images/dog-silhouette.png";

export function DogSilhouetteScatter({ animated = false, mobileSparse = false }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {SILHOUETTE_SCATTER.map((s, i) => (
        <span
          key={i}
          className={[
            animated && "dog-silhouette--float",
            mobileSparse && s.hideMobile && "hidden sm:block",
          ].filter(Boolean).join(" ") || undefined}
          style={{
            position: "absolute",
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            ...(animated
              ? {
                  "--dur": `${s.dur}s`,
                  "--delay": `${s.delay}s`,
                  "--dist": `${s.dist}px`,
                  "--dx": `${s.dx}px`,
                  "--wob": `${s.wob}deg`,
                }
              : null),
          }}
        >
          <span
            style={{
              display: "block",
              width: "100%",
              height: "100%",
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
        </span>
      ))}
    </div>
  );
}
