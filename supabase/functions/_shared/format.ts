// Shared formatting helpers used by notify-* edge functions.

/** Strip HTML tags and control characters from user-supplied text (names, etc.). */
export function sanitise(str: string): string {
  return str
    .replace(/<[^>]*>/g, "")          // strip HTML tags
    .replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "") // strip control chars (keep \n for safety, but we join lines ourselves)
    .replace(/\n/g, " ")              // collapse any newlines into spaces
    .replace(/\s+/g, " ")            // normalise whitespace
    .trim();
}

/** Short form "Mon 29 Mar" — keeps SMS in a single GSM-7 segment. */
export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Long form "Monday 29 March 2026" — used in email subjects where length is fine. */
export function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Format a slot string like "09:00" as "9:00am". */
export function formatTime(slot: string): string {
  const [h, m] = slot.split(":").map(Number);
  const period = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")}${period}`;
}

/** Join a list of names naturally: "Bella", "Bella and Max", "Bella, Max and Daisy". */
export function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}
