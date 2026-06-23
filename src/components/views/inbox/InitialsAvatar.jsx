// ============================================================
// src/components/views/inbox/InitialsAvatar.jsx
//
// Deterministic initials avatar for the inbox (conversation-list rows
// and the thread header). The colour is picked from a small on-brand
// palette by hashing a stable seed (human id / phone), so a given
// customer always gets the same colour. Decorative: the name is shown
// alongside, so the avatar is aria-hidden.
// ============================================================

const AVATAR_COLORS = [
  "bg-purple-100 text-purple-700",
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-700",
  "bg-violet-100 text-violet-700",
  "bg-teal-100 text-teal-700",
];

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Initials from the first + last alphabetic word (so a phone-number
// "name" yields none → we show a person glyph instead).
function initialsFrom(name) {
  const words = (name || "").trim().split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (words.length === 0) return null;
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function InitialsAvatar({ name, seed, size = 32, className = "" }) {
  const initials = initialsFrom(name);
  const palette = AVATAR_COLORS[hashString(String(seed || name || "?")) % AVATAR_COLORS.length];
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${palette} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {initials ?? (
        <svg
          width={Math.round(size * 0.55)}
          height={Math.round(size * 0.55)}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )}
    </span>
  );
}
