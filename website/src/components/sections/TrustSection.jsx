import React from 'react';
import { colors } from '../../constants/colors';
import FadeIn from '../FadeIn';

const TrustSection = () => {
    return (
        <>
            {/* CALM CONTINUED - Proof, not excitement */}
            <section
                className="py-10 relative overflow-hidden"
                style={{ backgroundColor: 'white' }}
            >
                <div className="max-w-6xl mx-auto px-6 flex flex-wrap justify-center items-center gap-8 md:gap-16 relative z-10">
                    {
                        [
                            { number: 'Since 1982', label: 'Serving Ashton' },
                            { number: 'Thousands', label: 'of happy pups' },
                            { number: '4.9★', label: 'Google rating' }
                        ].map((stat, i) => (
                            <FadeIn key={i} delay={i * 100}>
                                <div className="text-center">
                                    <div
                                        className="heading-font font-bold text-4xl mb-1"
                                        // Plum, not cyan: cyan on white is ~2.1:1 and fails WCAG AA
                                        // even for large text (needs 3:1). Cyan stays as the section's
                                        // calm accent in the divider and tape details.
                                        style={{ color: colors.plum }}
                                    >
                                        {stat.number}
                                    </div>
                                    <div
                                        className="body-font text-base font-medium"
                                        style={{ color: colors.teal }}
                                    >
                                        {stat.label}
                                    </div>
                                </div>
                            </FadeIn>
                        ))
                    }
                </div>
            </section>

            {/* Slant Transition: White -> Pink (Services) */}
            <div style={{ backgroundColor: 'white', lineHeight: 0, position: 'relative' }}>
                <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ width: '100%', height: '60px' }}>
                    <path d="M0 100L1440 100L1440 0L0 100Z" fill={colors.pink} />
                </svg>
            </div>
        </>
    );
};

export default TrustSection;
