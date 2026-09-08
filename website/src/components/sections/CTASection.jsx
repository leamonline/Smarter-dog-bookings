import React from 'react';
import { colors } from '../../constants/colors';
import { useSalonFacts } from '../../hooks/useSalonFacts';
import { whatsAppUrl } from '../../constants/salonFacts';

import SectionDivider from '../SectionDivider';
import FadeIn from '../FadeIn';
import OpenDaysCalendar from '../OpenDaysCalendar';

const formatTime12h = (hhmm) => {
    const [h, m] = String(hhmm || '').split(':').map(Number);
    if (Number.isNaN(h)) return '';
    const period = h < 12 ? 'am' : 'pm';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(m || 0).padStart(2, '0')}${period}`;
};

const OPEN_DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const openHoursSentence = (businessHours) => {
    const openDays = OPEN_DAY_ORDER.filter((day) => businessHours?.[day] && !businessHours[day].closed);
    if (openDays.length === 0) return "We're open — message us for hours and availability.";
    const first = businessHours[openDays[0]];
    const last = businessHours[openDays[openDays.length - 1]];
    const range = openDays.length > 1 ? `${openDays[0]} to ${openDays[openDays.length - 1]}` : openDays[0];
    return `We're open ${range}, ${formatTime12h(first.open)} – ${formatTime12h(last.close)} in Ashton-under-Lyne. Slots go fast — get yours booked in.`;
};

const CTASection = ({ onBookClick }) => {
    const facts = useSalonFacts();

    return (
        <>
            <section
                className="py-20 relative overflow-hidden"
                style={{ backgroundColor: colors.pink }}
            >
                {/* Decorative circles */}
                <div
                    className="absolute -top-20 -left-20 w-64 h-64 rounded-full opacity-10"
                    style={{ backgroundColor: 'white' }}
                />
                <div
                    className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full opacity-10"
                    style={{ backgroundColor: 'white' }}
                />

                <FadeIn>
                    <div className="max-w-3xl mx-auto px-6 text-center relative z-10">
                        <span
                            className="handwriting text-3xl"
                            style={{ color: 'white' }}
                        >
                            Ready for their pamper?
                        </span>
                        <h3
                            className="heading-font font-bold text-4xl md:text-5xl mt-4 mb-6"
                            style={{ color: 'white' }}
                        >
                            Book your visit
                        </h3>
                        <p
                            className="body-font text-lg mb-8"
                            style={{ color: colors.plum }}
                        >
                            {openHoursSentence(facts.businessHours)}
                        </p>
                        <div className="flex flex-wrap justify-center gap-4 mb-10">
                            <button
                                onClick={() => onBookClick('CTA Section')}
                                className="px-10 py-4 rounded-full font-bold text-lg transition-all duration-300 hover:scale-105 hover:shadow-xl"
                                style={{
                                    backgroundColor: 'white',
                                    color: colors.plum
                                }}
                            >
                                Book online
                            </button>
                            <a
                                href={whatsAppUrl(facts.businessPhone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-10 py-4 rounded-full font-bold text-lg transition-all duration-300 hover:scale-105 flex items-center gap-2"
                                style={{ backgroundColor: '#25D366', color: colors.plum }}
                            >
                                <span>WhatsApp us</span>
                            </a>
                        </div>
                        <OpenDaysCalendar />
                    </div>
                </FadeIn>
            </section>

            <SectionDivider type="wave" color={colors.yellow} backgroundColor={colors.pink} />
        </>
    );
};

export default CTASection;
