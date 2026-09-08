import React from 'react';
import { colors } from '../../constants/colors';
import FadeIn from '../FadeIn';

import GoogleReviews from '../GoogleReviews';

const TestimonialsSection = () => {
    return (
        <>
            {/* CALM - Reviews need credibility, not colour */}
            <section className="py-24 relative overflow-hidden" id="reviews" style={{ backgroundColor: colors.offWhite }}>
                <div className="relative z-10 px-6">
                    <div className="max-w-6xl mx-auto text-center mb-10">
                        <FadeIn>
                            <h3
                                className="heading-font font-bold text-4xl md:text-5xl mb-4"
                                style={{ color: colors.plum }}
                            >
                                Dogs who wouldn't go anywhere else
                            </h3>
                            <p className="text-lg max-w-xl mx-auto" style={{ color: colors.teal }}>
                                Real words from long-time regulars, nervous pups and first-time visitors.
                            </p>
                        </FadeIn>
                    </div>

                    {/* Reviews - story wall layout */}
                    <FadeIn delay={200}>
                        <div className="max-w-4xl mx-auto">
                            <GoogleReviews />
                        </div>
                    </FadeIn>
                </div>
            </section >

            {/* Transition to CTA (pink) */}
            < div style={{ backgroundColor: colors.offWhite, lineHeight: 0, position: 'relative', marginTop: '-1px' }
            }>
                <svg viewBox="0 0 1440 100" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ width: '100%', height: '80px' }}>
                    <path d="M0 0L1440 100L1440 100L0 100Z" fill={colors.pink} />
                </svg>
            </div >
        </>
    );
};

export default TestimonialsSection;
