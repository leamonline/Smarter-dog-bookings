const DOG_TONE = {
  small: "text-brand-purple bg-brand-yellow/30 border-brand-yellow-dark/50",
  medium: "text-brand-teal-dark bg-brand-teal/10 border-brand-teal/35",
  large: "text-brand-coral-dark bg-brand-coral-light border-brand-coral/35",
  unknown: "text-slate-500 bg-slate-100 border-slate-300",
};

export function HumanInitials({ fullName, className = "" }) {
  const initials =
    String(fullName || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?";

  return (
    <span
      data-testid="human-initials"
      aria-hidden="true"
      className={`grid size-13 shrink-0 place-items-center rounded-2xl bg-brand-purple/10 font-extrabold text-brand-purple ${className}`}
    >
      {initials}
    </span>
  );
}

export function DogSizeMark({ size, decorative = false, className = "" }) {
  const tone = ["small", "medium", "large"].includes(size) ? size : "unknown";
  const label =
    tone === "unknown"
      ? "Dog size unknown"
      : `${tone[0].toUpperCase()}${tone.slice(1)} dog`;

  return (
    <span
      data-testid="dog-size-mark"
      data-size-tone={tone}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      className={`grid size-13 shrink-0 place-items-center rounded-full border ${DOG_TONE[tone]} ${className}`}
    >
      <span aria-hidden="true" className="dog-size-mark__silhouette size-8" />
    </span>
  );
}

export function ProfileArrow({ label, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-brand-purple hover:bg-brand-purple/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow-dark"
    >
      ›
    </button>
  );
}
