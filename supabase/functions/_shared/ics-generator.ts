// _shared/ics-generator.ts — RFC 5545 ICS generation for calendar sync
// Used by calendar-ics (single-event download) and calendar-feed (subscribable feed)

/** Service ID → human-readable label mapping */
const SERVICE_LABELS: Record<string, string> = {
  "full-groom": "Full Groom",
  "bath-and-brush": "Bath & Brush",
  "bath-and-deshed": "Bath & De-shed",
  "puppy-groom": "Puppy Groom",
};

/** Escape text per RFC 5545 §3.3.11 */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Fold content lines longer than 75 octets per RFC 5545 §3.1 */
export function foldLine(line: string): string {
  const MAX = 75;
  if (line.length <= MAX) return line;

  const parts: string[] = [line.slice(0, MAX)];
  let pos = MAX;
  while (pos < line.length) {
    // Continuation lines start with a single space
    parts.push(" " + line.slice(pos, pos + MAX - 1));
    pos += MAX - 1;
  }
  return parts.join("\r\n");
}

/**
 * Format a date + slot into ICS DTSTART/DTEND value with TZID.
 * dateStr: "2026-04-13", slotStr: "09:00", tzid: "Europe/London"
 * → "TZID=Europe/London:20260413T090000"
 */
export function formatIcsDateTime(dateStr: string, slotStr: string, tzid: string): string {
  const [y, m, d] = dateStr.split("-");
  const [h, min] = slotStr.split(":");
  return `TZID=${tzid}:${y}${m}${d}T${h.padStart(2, "0")}${min.padStart(2, "0")}00`;
}

/**
 * Add minutes to a slot time string. Returns new HH:MM string.
 * addMinutesToSlot("09:00", 120) → "11:00"
 */
export function addMinutesToSlot(slot: string, minutes: number): string {
  const [h, m] = slot.split(":").map(Number);
  const totalMins = h * 60 + m + minutes;
  const newH = Math.floor(totalMins / 60) % 24;
  const newM = totalMins % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

/** Format an ISO timestamp as ICS UTC datetime: 20260413T120000Z */
export function formatIcsUtcTimestamp(isoStr?: string): string {
  const d = isoStr ? new Date(isoStr) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

export interface VEventInput {
  bookingId: string;
  bookingDate: string;  // YYYY-MM-DD
  slot: string;         // HH:MM
  dogName: string;
  humanName?: string;   // included in staff feed
  service: string;      // service ID like "full-groom"
  status: string;       // booking status
  pickupOffsetMins: number;
  updatedAt?: string;   // ISO timestamp
}

/** Map app booking status to ICS STATUS */
function mapStatus(appStatus: string): string {
  const lower = appStatus.toLowerCase();
  if (lower === "completed" || lower === "no-show") return "CANCELLED";
  return "CONFIRMED";
}

/**
 * Generate a single VEVENT block.
 * The UID is deterministic from the booking ID so calendar apps recognise updates.
 */
export function generateVEvent(input: VEventInput, tzid: string): string {
  const {
    bookingId, bookingDate, slot, dogName, humanName,
    service, status, pickupOffsetMins, updatedAt,
  } = input;

  const serviceLabel = SERVICE_LABELS[service] || service;
  const endSlot = addMinutesToSlot(slot, pickupOffsetMins);
  const summary = humanName
    ? `${escapeIcsText(dogName)} (${escapeIcsText(humanName)}) - ${serviceLabel}`
    : `Dog Grooming - ${escapeIcsText(dogName)} (${serviceLabel})`;

  const description = humanName
    ? `${serviceLabel} for ${escapeIcsText(dogName)}. Owner: ${escapeIcsText(humanName)}. Drop off at ${slot}.`
    : `${serviceLabel} for ${escapeIcsText(dogName)} at Smarter Dog Grooming. Drop off at ${slot}.`;

  const now = formatIcsUtcTimestamp();
  const lastMod = updatedAt ? formatIcsUtcTimestamp(updatedAt) : now;

  const lines = [
    "BEGIN:VEVENT",
    foldLine(`UID:${bookingId}@smarterdog.grooming`),
    foldLine(`DTSTAMP:${now}`),
    foldLine(`DTSTART;${formatIcsDateTime(bookingDate, slot, tzid)}`),
    foldLine(`DTEND;${formatIcsDateTime(bookingDate, endSlot, tzid)}`),
    foldLine(`SUMMARY:${summary}`),
    foldLine(`DESCRIPTION:${description}`),
    `STATUS:${mapStatus(status)}`,
    foldLine(`LAST-MODIFIED:${lastMod}`),
    "END:VEVENT",
  ];
  return lines.join("\r\n");
}

/**
 * VTIMEZONE block for Europe/London.
 * Includes both STANDARD (GMT) and DAYLIGHT (BST) transitions.
 * Required by Apple Calendar; Google Calendar is more forgiving.
 */
function londonVTimezone(): string {
  return [
    "BEGIN:VTIMEZONE",
    "TZID:Europe/London",
    "BEGIN:STANDARD",
    "DTSTART:19701025T020000",
    "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0000",
    "TZNAME:GMT",
    "END:STANDARD",
    "BEGIN:DAYLIGHT",
    "DTSTART:19700329T010000",
    "RRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3",
    "TZOFFSETFROM:+0000",
    "TZOFFSETTO:+0100",
    "TZNAME:BST",
    "END:DAYLIGHT",
    "END:VTIMEZONE",
  ].join("\r\n");
}

/**
 * Wrap VEVENT blocks in a full VCALENDAR document.
 * calName: displayed as the calendar name in calendar apps.
 * refreshInterval: ISO 8601 duration for how often to re-fetch (e.g. "PT15M").
 */
export function wrapCalendar(
  events: string[],
  calName: string,
  refreshInterval?: string,
): string {
  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SmarterDog//Grooming//EN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:${escapeIcsText(calName)}`),
  ];

  if (refreshInterval) {
    header.push(`REFRESH-INTERVAL;VALUE=DURATION:${refreshInterval}`);
    // Apple Calendar uses X-PUBLISHED-TTL as a fallback
    header.push(`X-PUBLISHED-TTL:${refreshInterval}`);
  }

  header.push(londonVTimezone());

  const footer = ["END:VCALENDAR"];

  return [...header, ...events, ...footer].join("\r\n") + "\r\n";
}
