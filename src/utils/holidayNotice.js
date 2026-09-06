// Scheduled holiday notices, mirroring src/engine/holidayNotice.ts in the
// booking app. The booking database is the only source: a notice is shown
// only when the salon's actual diary is closed for those dates and open on
// the reopening day. Nothing here reconstructs holidays from reference hours.

const LONDON_DATE = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

/** Today's Europe/London calendar date as "YYYY-MM-DD". */
export function londonDate(now = new Date()) {
    return LONDON_DATE.format(now);
}

/**
 * Keep only notices that are announced and not yet reopened for the given
 * London date, and derive the phase: "upcoming" before the closure starts,
 * "away" during it. The server already applies the same rule on its clock;
 * repeating it keeps a long-open tab honest across midnight.
 */
export function scheduleHolidayNotices(notices, today = londonDate()) {
    return (Array.isArray(notices) ? notices : [])
        .filter((n) => n && typeof n.notice_from === 'string' && typeof n.closed_from === 'string' && typeof n.reopens_on === 'string')
        .filter((n) => n.notice_from <= today && today < n.reopens_on)
        .map((n) => ({ ...n, phase: today < n.closed_from ? 'upcoming' : 'away' }));
}

/** True when the "YYYY-MM-DD" date is inside a closure (reopening day excluded). */
export function isHolidayDate(notices, dateKey) {
    return (notices || []).some((n) => n.closed_from <= dateKey && dateKey < n.reopens_on);
}

const LONG_DATE = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
});

export function formatHolidayDate(dateKey) {
    return LONG_DATE.format(new Date(`${dateKey}T12:00:00Z`));
}

/** Public wording agreed with the booking app, so both surfaces say the same thing. */
export function holidayCopy(notice) {
    const closedLine = notice.phase === 'upcoming'
        ? `We’ll be closed from ${formatHolidayDate(notice.closed_from)}. `
        : '';
    return {
        title: notice.phase === 'upcoming' ? 'Upcoming holiday' : 'We’re taking a little break',
        text: `${closedLine}We reopen on ${formatHolidayDate(notice.reopens_on)}. Online booking is still open — book your dog’s next groom for when we’re back.`,
    };
}
