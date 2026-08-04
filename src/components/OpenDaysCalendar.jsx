import React from 'react';
import { colors } from '../constants/colors';
import { useOpenDays } from '../hooks/useOpenDays';
import { dayState } from '../utils/openDays';

const DAY_LABEL = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };

// Opaque backgrounds only -- a translucent chip over the section's pink
// backdrop composites to a colour axe/WCAG checks against directly, and a
// semi-transparent white-on-white ("closed") measured well under the
// required 4.5:1 contrast ratio once blended with the pink behind it.
const STATE_STYLE = {
    open: { bg: '#FFFFFF', color: colors.plum, label: 'Open' },
    closed: { bg: colors.plum, color: '#FFFFFF', label: 'Closed' },
    'extra-open': { bg: colors.green, color: colors.plum, label: 'Extra opening' },
    'holiday-closed': { bg: colors.yellow, color: colors.plum, label: 'Closed for a holiday' },
};

function nextDays(count) {
    const days = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = 0; i < count; i += 1) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        days.push(d);
    }
    return days;
}

// Compact "next two weeks" open/closed strip -- not a full calendar grid, so
// it fits inside a CTA banner rather than needing its own page section.
const OpenDaysCalendar = ({ days = 14 }) => {
    const overrides = useOpenDays();
    const dates = nextDays(days);

    return (
        <div className="mt-6">
            <div
                className="flex flex-wrap justify-center gap-2"
                role="list"
                aria-label="Opening days for the next two weeks"
            >
                {dates.map((date) => {
                    const state = dayState(date, overrides);
                    const style = STATE_STYLE[state];
                    const label = date.toLocaleDateString('en-GB', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                    });
                    return (
                        <div
                            key={date.toISOString()}
                            role="listitem"
                            title={`${label}: ${style.label}`}
                            aria-label={`${label}: ${style.label}`}
                            className="w-14 rounded-xl py-2 text-center"
                            style={{ backgroundColor: style.bg, color: style.color }}
                        >
                            <div className="text-[11px] font-semibold">
                                {DAY_LABEL[date.getDay()]}
                            </div>
                            <div className="text-lg font-bold leading-none">{date.getDate()}</div>
                        </div>
                    );
                })}
            </div>
            <div
                className="flex flex-wrap justify-center gap-3 mt-3 text-xs"
                style={{ color: colors.plum }}
            >
                <span className="inline-flex items-center gap-1.5">
                    <span
                        className="w-2.5 h-2.5 rounded-full inline-block"
                        style={{ backgroundColor: '#FFFFFF', border: `1px solid ${colors.plum}` }}
                    />
                    Open
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: colors.green }} />
                    Extra opening
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: colors.yellow }} />
                    Holiday closure
                </span>
            </div>
        </div>
    );
};

export default OpenDaysCalendar;
