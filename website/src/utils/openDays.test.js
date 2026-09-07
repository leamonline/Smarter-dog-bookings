import { describe, it, expect } from 'vitest';
import { defaultIsOpen, toDateKey, dayState, buildOverridesMap, planOpenDaysStrip } from './openDays';

describe('defaultIsOpen', () => {
  it('is true for Monday, Tuesday and Wednesday', () => {
    expect(defaultIsOpen(new Date(2026, 7, 3))).toBe(true); // Monday
    expect(defaultIsOpen(new Date(2026, 7, 4))).toBe(true); // Tuesday
    expect(defaultIsOpen(new Date(2026, 7, 5))).toBe(true); // Wednesday
  });

  it('is false for Thursday through Sunday', () => {
    expect(defaultIsOpen(new Date(2026, 7, 6))).toBe(false); // Thursday
    expect(defaultIsOpen(new Date(2026, 7, 7))).toBe(false); // Friday
    expect(defaultIsOpen(new Date(2026, 7, 8))).toBe(false); // Saturday
    expect(defaultIsOpen(new Date(2026, 7, 9))).toBe(false); // Sunday
  });
});

describe('toDateKey', () => {
  it('formats a local date as zero-padded Y-M-D', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(toDateKey(new Date(2026, 11, 25))).toBe('2026-12-25');
  });
});

describe('dayState', () => {
  it('classifies a default-open day with no override as open', () => {
    expect(dayState(new Date(2026, 7, 3), {})).toBe('open');
  });

  it('classifies a default-closed day with no override as closed', () => {
    expect(dayState(new Date(2026, 7, 6), {})).toBe('closed');
  });

  it('classifies a default-closed day opened by an override as extra-open', () => {
    expect(dayState(new Date(2026, 7, 6), { '2026-08-06': true })).toBe('extra-open');
  });

  it('classifies a default-open day closed by an override as holiday-closed', () => {
    expect(dayState(new Date(2026, 7, 3), { '2026-08-03': false })).toBe('holiday-closed');
  });

  it('treats a missing overrides map the same as no override for that date', () => {
    expect(dayState(new Date(2026, 7, 3), undefined)).toBe('open');
    expect(dayState(new Date(2026, 7, 6), undefined)).toBe('closed');
  });
});

describe('buildOverridesMap', () => {
  it('keys by setting_date and coerces is_open to a boolean', () => {
    expect(
      buildOverridesMap([
        { setting_date: '2026-08-06', is_open: true },
        { setting_date: '2026-08-07', is_open: false },
      ]),
    ).toEqual({ '2026-08-06': true, '2026-08-07': false });
  });

  it('ignores rows without a setting_date', () => {
    expect(buildOverridesMap([{ is_open: true }])).toEqual({});
  });

  it('returns an empty map for empty or missing input', () => {
    expect(buildOverridesMap([])).toEqual({});
    expect(buildOverridesMap(undefined)).toEqual({});
  });
});

describe('planOpenDaysStrip', () => {
  const monday = new Date(2026, 8, 7); // Mon 7 Sep 2026
  const holiday = { id: 'h', notice_from: '2026-09-06', closed_from: '2026-09-07', reopens_on: '2026-09-21', phase: 'away' };
  const closedFortnight = {};
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    closedFortnight[toDateKey(d)] = false;
  }

  it('starts today when the window has an open day', () => {
    const plan = planOpenDaysStrip({ today: monday, count: 14, overrides: {}, holidays: [holiday] });
    expect(plan.start).toEqual(monday);
    expect(plan.holiday).toBeNull();
  });

  it('jumps to the reopening date when a verified holiday closes the whole window', () => {
    const plan = planOpenDaysStrip({ today: monday, count: 14, overrides: closedFortnight, holidays: [holiday] });
    expect(toDateKey(plan.start)).toBe('2026-09-21');
    expect(plan.holiday).toBe(holiday);
  });

  it('stays put when the window is closed but no verified holiday explains it', () => {
    const plan = planOpenDaysStrip({ today: monday, count: 14, overrides: closedFortnight, holidays: [] });
    expect(plan.start).toEqual(monday);
    expect(plan.holiday).toBeNull();
  });

  it('ignores holidays that have already reopened', () => {
    const plan = planOpenDaysStrip({ today: monday, count: 14, overrides: closedFortnight, holidays: [{ ...holiday, reopens_on: '2026-09-07' }] });
    expect(plan.holiday).toBeNull();
  });
});
