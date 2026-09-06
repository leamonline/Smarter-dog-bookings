import React from 'react';
import { colors } from '../constants/colors';
import { useHolidayNotices } from '../hooks/useHolidayNotices';
import { holidayCopy } from '../utils/holidayNotice';

// Prominent holiday card for the homepage hero. Renders nothing unless the
// booking database confirms a scheduled holiday, so a quiet failure can never
// invent a closure or a reopening date. Opaque white on plum text keeps the
// contrast well above 4.5:1 over the cyan hero.
const HolidayNoticeCard = ({ onBookClick }) => {
    const notices = useHolidayNotices();
    if (notices.length === 0) return null;

    return (
        <div className="flex flex-col gap-4 mb-10 max-w-md">
            {notices.map((notice) => {
                const copy = holidayCopy(notice);
                return (
                    <section
                        key={notice.id}
                        aria-labelledby={`holiday-notice-${notice.id}`}
                        className="rounded-2xl p-5 md:p-6 relative"
                        style={{
                            backgroundColor: '#FFFFFF',
                            color: colors.plum,
                            borderLeft: `8px solid ${colors.yellow}`,
                            boxShadow: '0 8px 24px rgba(45, 0, 75, 0.18)',
                        }}
                    >
                        <span className="handwriting text-2xl block" style={{ color: colors.pink }}>
                            {notice.phase === 'upcoming' ? 'A quick heads-up' : 'Back soon'}
                        </span>
                        <h2
                            id={`holiday-notice-${notice.id}`}
                            className="heading-font font-bold text-2xl md:text-3xl mt-1 mb-2"
                        >
                            {copy.title}
                        </h2>
                        <p className="body-font text-base leading-relaxed mb-4" style={{ fontWeight: 500 }}>
                            {copy.text}
                        </p>
                        <button
                            type="button"
                            onClick={() => onBookClick('Holiday Notice')}
                            className="px-8 py-3 rounded-full font-bold text-lg transition-all duration-300 hover:scale-105 hover:shadow-lg"
                            style={{
                                backgroundColor: colors.yellow,
                                color: colors.plum,
                                boxShadow: '0 5px 0 #E0A800',
                            }}
                        >
                            Book for our return
                        </button>
                    </section>
                );
            })}
        </div>
    );
};

export default HolidayNoticeCard;
