// The dog's face on the board.
//
// There is no dog photo anywhere in this data model (`groom_photos` is a
// separate staff-only gallery, not a profile picture), so this is initials
// with a deterministic tint — the same dog is the same colour every day,
// which is what makes a token findable by peripheral vision. The fallback
// hierarchy is initials → paw glyph; nothing is ever fabricated.
//
// Decorative by design: the token's own accessible name carries the dog's
// name and status, so the avatar is aria-hidden and never announced twice.

// Low-saturation tints only. The board's colour budget belongs to urgency —
// an avatar must never out-shout a coral late ring, so these sit well below
// the tier tones in weight while staying distinguishable from each other.
const TINTS = [
  "bg-[#EFE8F5] text-[#4B2A63]",
  "bg-[#E4EFEC] text-[#245C50]",
  "bg-[#E7EEF5] text-[#2A4E6B]",
  "bg-[#F5EDE1] text-[#6B4A21]",
  "bg-[#F4E8EA] text-[#7A3A46]",
  "bg-[#E9EDE4] text-[#41552E]",
];

function hash(value) {
  let total = 0;
  for (let index = 0; index < value.length; index += 1) {
    total = (total * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(total);
}

/** First letter of the first word, plus the second word's if there is one. */
export function dogInitials(name) {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter((word) => /[a-z0-9]/i.test(word));
  if (words.length === 0) return null;
  const first = words[0][0] || "";
  const second = words.length > 1 ? words[1][0] || "" : "";
  return (first + second).toUpperCase();
}

export function DogTokenAvatar({ name, seed, size = 64, className = "" }) {
  const initials = dogInitials(name);
  const tint = TINTS[hash(String(seed || name || "?")) % TINTS.length];

  return (
    <span
      aria-hidden="true"
      data-token-avatar
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-display font-bold leading-none ${tint} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials ?? (
        <svg
          width={Math.round(size * 0.46)}
          height={Math.round(size * 0.46)}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <ellipse cx="12" cy="16" rx="5.2" ry="4.4" />
          <ellipse cx="5.6" cy="10.4" rx="2.5" ry="3.1" />
          <ellipse cx="18.4" cy="10.4" rx="2.5" ry="3.1" />
          <ellipse cx="9.2" cy="5.6" rx="2.3" ry="2.9" />
          <ellipse cx="14.8" cy="5.6" rx="2.3" ry="2.9" />
        </svg>
      )}
    </span>
  );
}
