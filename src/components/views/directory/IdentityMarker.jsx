const DOG_TONE = {
  small: {
    container: "bg-brand-yellow/30 border-brand-yellow-dark/50",
    silhouette: "text-brand-yellow-dark",
  },
  medium: {
    container: "bg-brand-teal/10 border-brand-teal/35",
    silhouette: "text-brand-teal-dark",
  },
  large: {
    container: "bg-brand-coral-light border-brand-coral/35",
    silhouette: "text-brand-coral-dark",
  },
  unknown: {
    container: "bg-slate-100 border-slate-300",
    silhouette: "text-slate-500",
  },
};

export function HumanInitials({ fullName, className = "" }) {
  const words = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  const initials = words.length > 0
    ? `${words[0][0]}${words.length > 1 ? words[words.length - 1][0] : ""}`.toUpperCase()
    : "?";

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
      className={`grid size-13 shrink-0 place-items-center rounded-full border ${DOG_TONE[tone].container} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`dog-size-mark__silhouette size-8 ${DOG_TONE[tone].silhouette}`}
      />
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
