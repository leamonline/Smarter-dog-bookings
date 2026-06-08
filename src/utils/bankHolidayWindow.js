// Bank holiday popup window logic.
//
// Pulled live from gov.uk's open data feed at https://www.gov.uk/bank-holidays.json
// (the same source GOV.UK uses on its own bank-holidays page). We use the
// england-and-wales division because that's where the salon is.
//
// The popup is shown when "today" sits inside the window of any bank holiday
// that falls on a Monday: from 7 days before that Monday, up to (and including)
// the Thursday after. The salon closes on bank holiday Mondays and opens on the
// following Thursday instead, so this is the period when visitors most need
// to see the heads-up.
//
// The fetch can fail — gov.uk could be down, CORS could change, the visitor
// might be offline. In any of those cases we fail closed: no popup. Better to
// under-show than to show a stale or wrong notice.

const GOVUK_URL = 'https://www.gov.uk/bank-holidays.json';
const DEFAULT_DIVISION = 'england-and-wales';

// gov.uk dates arrive as 'YYYY-MM-DD' strings. Parsing with `new Date(iso)`
// treats them as UTC midnight, which shifts back an hour in BST and can land
// on the previous day for early-morning visitors. Building a local-time Date
// from the parts avoids that whole class of bug.
function parseLocalDate(iso) {
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function atLocalMidnight(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
}

/**
 * Returns true if `now` falls inside the popup window of any bank-holiday
 * Monday in the supplied gov.uk events list. Window is 7 days before the
 * Monday up to (and including) the Thursday after.
 *
 * Pure function — no network, no globals. Safe to test directly.
 */
export function isInBankHolidayWindow(events, now = new Date()) {
    if (!Array.isArray(events) || events.length === 0) return false;
    const today = atLocalMidnight(now).getTime();

    return events.some((event) => {
        if (!event || typeof event.date !== 'string') return false;
        const holiday = parseLocalDate(event.date);
        if (Number.isNaN(holiday.getTime())) return false;
        // getDay(): 0 = Sunday, 1 = Monday. We only care about Mondays.
        if (holiday.getDay() !== 1) return false;

        const start = addDays(holiday, -7).getTime();
        const end = addDays(holiday, 3).getTime(); // Thursday after the Monday, inclusive
        return today >= start && today <= end;
    });
}

/**
 * Fetches the England & Wales bank holiday events from gov.uk. Throws on
 * network failure, non-2xx response, or unexpected shape — callers should
 * treat any rejection as "don't show the popup".
 *
 * The fetchFn override is there for tests so we don't have to monkey-patch
 * globalThis.fetch.
 */
export async function fetchBankHolidayEvents({
    fetchFn = typeof globalThis !== 'undefined' ? globalThis.fetch : undefined,
    division = DEFAULT_DIVISION,
} = {}) {
    if (typeof fetchFn !== 'function') {
        throw new Error('fetch is not available in this environment');
    }
    const response = await fetchFn(GOVUK_URL);
    if (!response || !response.ok) {
        throw new Error(`gov.uk bank holidays request failed: ${response ? response.status : 'no response'}`);
    }
    const data = await response.json();
    const events = data && data[division] && data[division].events;
    if (!Array.isArray(events)) {
        throw new Error(`Unexpected gov.uk response shape — events missing for ${division}`);
    }
    return events;
}
