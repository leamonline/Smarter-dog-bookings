// The flyer's mascot for a bookable service: a cartoon dog in a blue or yellow
// circle with a white ring. Flyer visual language, decisions 4 and 10:
// docs/plans/active/2026-11-22-flyer-visual-language.md.
//
// Always decorative. The service's name sits beside it, so the image has empty
// alt text and is hidden from assistive technology. A service without artwork
// renders nothing rather than a broken image or a stand-in.
//
// The files are 250px rasters copied from website/public/assets/icons (the two
// apps keep their own copies, ADR 009). They stay sharp up to about 120px.
//
// bounce plays the one approved bounce for a hero moment. The keyframes in
// src/index.css switch it off under prefers-reduced-motion.

export const SERVICE_MASCOTS = Object.freeze({
  "full-groom": "/app/mascots/full-groom.webp",
  "bath-and-brush": "/app/mascots/bath-and-brush.webp",
  "bath-and-deshed": "/app/mascots/bath-and-deshed.webp",
  "puppy-groom": "/app/mascots/puppy-groom.webp",
});

const MAX_SHARP_SIZE = 120;

export function ServiceMascot({ serviceId, size = 56, bounce = false, className = "" }) {
  const src = SERVICE_MASCOTS[serviceId];
  if (!src) return null;
  const px = Math.min(size, MAX_SHARP_SIZE);
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={px}
      height={px}
      draggable={false}
      decoding="async"
      data-service-mascot={serviceId}
      className={`service-mascot${bounce ? " service-mascot--bounce" : ""} ${className}`.trim()}
    />
  );
}
