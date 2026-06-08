import { describe, it, expect } from 'vitest';
import { isInBankHolidayWindow, fetchBankHolidayEvents } from './bankHolidayWindow';

// Real UK 2026 bank holidays (England & Wales) for stable test fixtures.
// Mixing Monday and non-Monday holidays so we can confirm the filter behaves.
const EVENTS_2026 = [
    { title: "New Year's Day", date: '2026-01-01', notes: '', bunting: true },         // Thursday
    { title: 'Good Friday', date: '2026-04-03', notes: '', bunting: false },           // Friday
    { title: 'Easter Monday', date: '2026-04-06', notes: '', bunting: true },          // Monday
    { title: 'Early May bank holiday', date: '2026-05-04', notes: '', bunting: true }, // Monday
    { title: 'Spring bank holiday', date: '2026-05-25', notes: '', bunting: true },    // Monday
    { title: 'Summer bank holiday', date: '2026-08-31', notes: '', bunting: true },    // Monday
    { title: 'Christmas Day', date: '2026-12-25', notes: '', bunting: true },          // Friday
    { title: 'Boxing Day', date: '2026-12-28', notes: 'Substitute day', bunting: true }, // Monday substitute
];

describe('isInBankHolidayWindow', () => {
    it('returns false when the events list is empty', () => {
        expect(isInBankHolidayWindow([], new Date(2026, 4, 25))).toBe(false);
    });

    it('returns false when given a non-array', () => {
        expect(isInBankHolidayWindow(null, new Date(2026, 4, 25))).toBe(false);
        expect(isInBankHolidayWindow(undefined, new Date(2026, 4, 25))).toBe(false);
    });

    it('returns true exactly seven days before the bank holiday Monday', () => {
        // Spring bank holiday Monday: 25 May 2026. Seven days before = 18 May.
        expect(isInBankHolidayWindow(EVENTS_2026, new Date(2026, 4, 18))).toBe(true);
    });

    it('returns false eight days before — just outside the window', () => {
        expect(isInBankHolidayWindow(EVENTS_2026, new Date(2026, 4, 17))).toBe(false);
    });

    it('returns true on the bank holiday Monday itself', () => {
        expect(isInBankHolidayWindow(EVENTS_2026, new Date(2026, 4, 25))).toBe(true);
    });

    it('returns true on the Thursday after the bank holiday Monday', () => {
        // 25 May Monday → 28 May Thursday
        expect(isInBankHolidayWindow(EVENTS_2026, new Date(2026, 4, 28))).toBe(true);
    });

    it('returns false on the Friday after the bank holiday Monday', () => {
        expect(isInBankHolidayWindow(EVENTS_2026, new Date(2026, 4, 29))).toBe(false);
    });

    it('ignores bank holidays that are not on a Monday', () => {
        // New Year's Day 2026 is a Thursday — no window should fire around it.
        expect(isInBankHolidayWindow(EVENTS_2026, new Date(2025, 11, 25))).toBe(false);
        expect(isInBankHolidayWindow(EVENTS_2026, new Date(2026, 0, 1))).toBe(false);
        expect(isInBankHolidayWindow(EVENTS_2026, new Date(2026, 0, 4))).toBe(false);
        // 27 March 2026 is a Friday — well clear of any Monday holiday window
        // (Easter Monday 6 April's window starts 30 March).
        expect(isInBankHolidayWindow(EVENTS_2026, new Date(2026, 2, 27))).toBe(false);
        // We deliberately don't test Good Friday 3 April 2026 here — it happens
        // to sit inside Easter Monday's window, but for the right reason.
    });

    it('handles back-to-back overlapping windows correctly', () => {
        // Easter Monday 6 April, early May Monday 4 May. Their windows:
        //   Easter Mon: 30 Mar → 9 Apr
        //   Early May:  27 Apr → 7 May
        // 15 April sits between them and should be out of window.
        expect(isInBankHolidayWindow(EVENTS_2026, new Date(2026, 3, 15))).toBe(false);
        // 8 April is inside Easter Monday's window.
        expect(isInBankHolidayWindow(EVENTS_2026, new Date(2026, 3, 8))).toBe(true);
        // 28 April is inside early May's window.
        expect(isInBankHolidayWindow(EVENTS_2026, new Date(2026, 3, 28))).toBe(true);
    });

    it('treats the Boxing Day Monday substitute as a triggering Monday', () => {
        // 28 Dec 2026 is the substitute (Boxing Day fell on Saturday). Window: 21 Dec → 31 Dec.
        expect(isInBankHolidayWindow(EVENTS_2026, new Date(2026, 11, 21))).toBe(true);
        expect(isInBankHolidayWindow(EVENTS_2026, new Date(2026, 11, 31))).toBe(true);
        expect(isInBankHolidayWindow(EVENTS_2026, new Date(2027, 0, 1))).toBe(false);
    });

    it('gracefully skips malformed events without throwing', () => {
        const broken = [
            { title: 'No date', notes: '' },
            null,
            { date: 'not-a-date' },
            { date: '2026-05-25' }, // the valid Monday
        ];
        expect(isInBankHolidayWindow(broken, new Date(2026, 4, 25))).toBe(true);
    });
});

describe('fetchBankHolidayEvents', () => {
    it('returns the england-and-wales events array on a successful response', async () => {
        const fakePayload = {
            'england-and-wales': {
                division: 'england-and-wales',
                events: EVENTS_2026,
            },
            scotland: { division: 'scotland', events: [] },
        };
        const fetchFn = async () => ({ ok: true, json: async () => fakePayload });

        const events = await fetchBankHolidayEvents({ fetchFn });
        expect(events).toEqual(EVENTS_2026);
    });

    it('rejects when the response is not ok', async () => {
        const fetchFn = async () => ({ ok: false, status: 503, json: async () => ({}) });
        await expect(fetchBankHolidayEvents({ fetchFn })).rejects.toThrow(/503/);
    });

    it('rejects when the payload is the wrong shape', async () => {
        const fetchFn = async () => ({ ok: true, json: async () => ({}) });
        await expect(fetchBankHolidayEvents({ fetchFn })).rejects.toThrow(/events missing/);
    });

    it('rejects when fetch is not available', async () => {
        // `null` bypasses the destructuring default; `undefined` would re-trigger it.
        await expect(fetchBankHolidayEvents({ fetchFn: null })).rejects.toThrow(/fetch is not available/);
    });
});
