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
