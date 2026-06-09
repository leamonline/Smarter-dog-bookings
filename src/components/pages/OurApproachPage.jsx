import React, { useState, useEffect } from 'react';
import { colors } from '../../constants/colors';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import Navigation from '../sections/Navigation';
import FooterSection from '../sections/FooterSection';
import DogSilhouette from '../DogSilhouette';

const OurApproachPage = ({ onBookClick }) => {
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setIsLoaded(true), 100);
        return () => clearTimeout(timer);
    }, []);

    useDocumentTitle('Our Approach');

    const approaches = [
        {
            title: "No rushing, ever.",
            desc: "Every dog gets the time they need. We don't double-book or hurry through appointments."
        },
        {
            title: "We respect medical needs.",
            desc: "Arthritis, skin conditions, post-surgery — we adapt our techniques and products accordingly."
        },
        {
            title: "We don't force styles you don't want.",
            desc: "This is your dog. We listen to what you want, ask questions if we're unsure, and never assume."
        },
        {
            title: "We'll tell you if something needs attention.",
            desc: "Lumps, ear infections, dental issues — if we spot something, we'll let you know. Sometimes dogs need a vet, not just another groom."
        },
        {
            title: "Nervous dogs are welcome.",
            desc: "We've worked with anxious, reactive, and elderly dogs for over 40 years. Patience isn't an extra — it's how we work."
        }
    ];

    return (
        <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: colors.offWhite }}>
            {/* Background Decorations - simplified */}
            <div className="absolute bottom-40 right-0 z-0 opacity-5 pointer-events-none" aria-hidden="true">
                <DogSilhouette
                    color={colors.plum}
                    className="w-72 h-auto rotate-6 scale-x-[-1]"
                />
            </div>

            <Navigation isLoaded={isLoaded} onBookClick={onBookClick} />

            <main id="main-content" className="pt-24 pb-16 px-6 relative z-10">
                <div className="max-w-3xl mx-auto">
                    {/* Header */}
                    <div className="text-center mb-16">
                        <h1
                            className="heading-font font-bold text-4xl md:text-5xl mb-6"
                            style={{ color: colors.plum }}
                        >
                            Our Approach
                        </h1>
                        <p className="body-font text-lg" style={{ color: colors.teal }}>
                            We're a calm, welfare-first salon. Here's how that shows up in practice.
                        </p>
                    </div>

                    {/* Approach Points */}
                    <div className="space-y-8">
                        {approaches.map((item, i) => (
                            <div
                                key={i}
                                className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100"
                            >
                                <h2
                                    className="heading-font font-semibold text-xl mb-3"
                                    style={{ color: colors.plum }}
                                >
                                    {item.title}
                                </h2>
                                <p className="body-font" style={{ color: colors.teal }}>
                                    {item.desc}
                                </p>
                            </div>
                        ))}
                    </div>

                    {/* CTA */}
                    <div className="text-center mt-16">
                        <p className="body-font mb-6" style={{ color: colors.teal }}>
                            Ready to book your dog's first visit?
                        </p>
                        <button
                            onClick={() => onBookClick?.('Approach Page')}
                            className="px-10 py-4 rounded-full font-bold text-lg transition-all duration-300 hover:scale-105 hover:shadow-xl"
                            style={{
                                backgroundColor: colors.cyan,
                                color: colors.plum
                            }}
                        >
                            Book online
                        </button>
                    </div>
                </div>
            </main>

            <FooterSection onBookClick={onBookClick} />
        </div>
    );
};

export default OurApproachPage;
