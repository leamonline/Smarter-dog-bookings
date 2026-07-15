import { ChevronRight } from "lucide-react";

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
      className={`grid size-13 shrink-0 place-items-center rounded-full border border-brand-purple/15 bg-brand-purple/5 ${className}`}
    >
      <span
        aria-hidden="true"
        className="dog-size-mark__silhouette size-8 text-brand-purple"
      />
    </span>
  );
}

export function ProfileArrow({ label, onClick, visibleLabel = false }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-control text-brand-purple hover:bg-brand-purple/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow-dark ${visibleLabel ? "sm:w-auto sm:gap-1 sm:px-3" : ""}`}
    >
      {visibleLabel && <span className="hidden text-xs font-bold sm:inline">View profile</span>}
      <ChevronRight size={18} strokeWidth={2.5} aria-hidden="true" />
    </button>
  );
}
