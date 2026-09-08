// Mon/Tue/Wed default open, everything else default closed -- matches the
// booking app's canonical open days. An RPC row overrides the default for
// its date, letting the UI tell an "extra opening" apart from a "holiday
// closure" instead of just a flat open/closed flag.
const DEFAULT_OPEN_WEEKDAYS = new Set([1, 2, 3]); // 0 = Sunday

export const defaultIsOpen = (date) => DEFAULT_OPEN_WEEKDAYS.has(date.getDay());

// Local Y/M/D key -- deliberately not toISOString(), which converts to UTC
// first and can roll the date back a day depending on the browser's timezone.
export function toDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function dayState(date, overridesByDate) {
    const key = toDateKey(date);
    const override = overridesByDate ? overridesByDate[key] : undefined;
    const isDefaultOpen = defaultIsOpen(date);
    const isOpen = override === undefined ? isDefaultOpen : override;
    if (isOpen && !isDefaultOpen) return 'extra-open';
    if (!isOpen && isDefaultOpen) return 'holiday-closed';
    return isOpen ? 'open' : 'closed';
}

export function buildOverridesMap(rows) {
    const map = {};
    for (const row of rows || []) {
        if (row?.setting_date) map[row.setting_date] = Boolean(row.is_open);
    }
    return map;
}

export function nextDaysFrom(start, count) {
    const days = [];
    const base = new Date(start);
    base.setHours(0, 0, 0, 0);
    for (let i = 0; i < count; i += 1) {
        const d = new Date(base);
        d.setDate(base.getDate() + i);
        days.push(d);
    }
    return days;
}

// Parse a "YYYY-MM-DD" key as a LOCAL date (new Date(key) would be UTC and
// can land on the previous evening in the UK).
export function fromDateKey(key) {
    const [y, m, d] = String(key).split('-').map(Number);
    return new Date(y, m - 1, d);
}

/**
 * Decide where the "next two weeks" strip should start. Normally today. But
 * when a verified holiday leaves the whole window closed, a wall of closed
 * days tells customers nothing useful, so the strip starts on the reopening
 * date instead and the caller says why. Only a holiday the booking database
 * has confirmed can move the window; ordinary closures never do.
 */
export function planOpenDaysStrip({ today, count, overrides, holidays }) {
    const normalWindow = nextDaysFrom(today, count);
    const hasOpenDay = normalWindow.some((date) => {
        const state = dayState(date, overrides);
        return state === 'open' || state === 'extra-open';
    });
    if (hasOpenDay) return { start: today, holiday: null };

    const todayKey = toDateKey(today);
    const reopening = (holidays || [])
        .filter((h) => h && typeof h.reopens_on === 'string' && h.reopens_on > todayKey)
        .sort((a, b) => (a.reopens_on < b.reopens_on ? -1 : 1))[0];
    if (!reopening) return { start: today, holiday: null };
    return { start: fromDateKey(reopening.reopens_on), holiday: reopening };
}
