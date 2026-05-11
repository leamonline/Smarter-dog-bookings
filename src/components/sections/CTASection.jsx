import React from 'react';
import { colors } from '../../constants/colors';

import SectionDivider from '../SectionDivider';
import FadeIn from '../FadeIn';

const BOOKING_STEPS = [
    {
        title: '1) Send your request',
        detail: 'Tell us your dog, service, and best times in about two minutes.',
    },
    {
        title: '2) We confirm a slot',
        detail: 'Our Ashton team checks the diary and replies by text or call.',
    },
    {
        title: '3) Easy drop-off',
        detail: "Bring them in on the day and we'll handle the rest.",
    },
];

const CTASection = ({ onBookClick }) => {
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
                            We're open Monday to Wednesday, 8:30am – 3:00pm in Ashton-under-Lyne. Slots go fast — get yours booked in.
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
                                Book your visit
                            </button>
                            <a
                                href="https://wa.me/447507731487"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-10 py-4 rounded-full font-bold text-lg transition-all duration-300 hover:scale-105 flex items-center gap-2"
                                style={{ backgroundColor: '#25D366', color: colors.plum }}
                            >
                                <span>💬</span>
                                <span>WhatsApp us</span>
                            </a>
                            <a
                                href="sms:07507731487"
                                className="px-10 py-4 rounded-full font-bold text-lg transition-all duration-300 hover:scale-105 border-2 flex items-center gap-2"
                                style={{
                                    borderColor: colors.plum,
                                    color: colors.plum,
                                    backgroundColor: 'transparent'
                                }}
                            >
                                <span>✉️</span>
                                <span>Text 07507 731487</span>
                            </a>
                        </div>

                        <div
                            className="rounded-3xl p-6 mb-10 text-left"
                            style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                        >
                            <h4 className="heading-font text-2xl font-bold mb-4" style={{ color: colors.plum }}>
                                What happens next
                            </h4>
                            <div className="grid md:grid-cols-3 gap-4">
                                {BOOKING_STEPS.map((step) => (
                                    <article
                                        key={step.title}
                                        className="rounded-2xl p-4 h-full"
                                        style={{ backgroundColor: colors.offWhite }}
                                    >
                                        <p className="font-semibold mb-2" style={{ color: colors.plum }}>{step.title}</p>
                                        <p className="text-sm" style={{ color: colors.teal }}>{step.detail}</p>
                                    </article>
                                ))}
                            </div>
                        </div>

                        {/* Signposts for different visitor types */}
                        <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
                            <div
                                className="p-5 rounded-2xl text-left"
                                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                            >
                                <p className="font-semibold mb-1" style={{ color: colors.plum }}>New to us?</p>
                                <p className="text-base" style={{ color: colors.plum }}>
                                    We'll talk through your dog's needs first — no rush.
                                </p>
                            </div>
                            <div
                                className="p-5 rounded-2xl text-left"
                                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
                            >
                                <p className="font-semibold mb-1" style={{ color: colors.plum }}>Already a regular?</p>
                                <p className="text-base" style={{ color: colors.plum }}>
                                    Just tell us who you are and when you'd like to come in.
                                </p>
                            </div>
                        </div>
                    </div>
                </FadeIn>
            </section>

            <SectionDivider type="wave" color={colors.yellow} backgroundColor={colors.pink} />
        </>
    );
};

export default CTASection;
