import React, { useState, useEffect } from 'react';
import { colors } from '../../constants/colors';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import Navigation from '../sections/Navigation';
import FooterSection from '../sections/FooterSection';

const MattedCoatPolicyPage = ({ onBookClick }) => {
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setIsLoaded(true), 100);
        return () => clearTimeout(timer);
    }, []);

    useDocumentTitle('Matted Coat Policy');

    const sections = [
        {
            title: "Welfare Comes First",
            items: [
                "Matted or compacted fur pulls on the skin and can hide irritation, sores, or parasites.",
                "Removing matting safely isn't about style — it's about comfort and wellbeing.",
                "We will always choose the least stressful and safest option for your dog."
            ]
        },
        {
            title: "What Happens During the Groom",
            items: [
                "Mild matting: We may be able to gently brush out small areas if it can be done without causing pain.",
                "Moderate to severe matting: We will clip the coat short to remove the mats safely. This is often the kindest option.",
                "We will never force a painful de-matting process."
            ]
        },
        {
            title: "After Effects You May Notice",
            items: [
                "A shorter-than-usual haircut.",
                "Temporary redness, irritation, or sensitivity where mats were removed.",
                "Previously hidden skin issues may be uncovered once the coat is off."
            ]
        },
        {
            title: "Additional Charges",
            items: [
                "Heavily matted coats take more time and increase wear on equipment.",
                "A matted-coat fee may apply depending on the severity."
            ]
        },
        {
            title: "Preventing Future Matting",
            items: [
                "Regular brushing at home makes a huge difference.",
                "We can show you the right tools and brushing techniques for your dog's coat type.",
                "Keeping to a consistent grooming schedule helps prevent matting from returning."
            ]
        },
        {
            title: "Owner Agreement",
            intro: "By booking a groom, you:",
            items: [
                "Understand the risks associated with matted coats.",
                "Agree that clipping short may be necessary for your dog's comfort.",
                "Accept that additional fees may apply."
            ]
        }
    ];

    return (
        <div className="min-h-screen" style={{ backgroundColor: colors.offWhite }}>
            <Navigation isLoaded={isLoaded} onBookClick={onBookClick} />

            <main id="main-content" className="pt-24 pb-16 px-6">
                <div className="max-w-3xl mx-auto">
                    {/* Breadcrumb */}
                    <p className="body-font text-base mb-4" style={{ color: colors.teal }}>
                        Policies & Terms
                    </p>

                    {/* Header */}
                    <div className="mb-12">
                        <h1
                            className="heading-font font-bold text-4xl md:text-5xl mb-6"
                            style={{ color: colors.plum }}
                        >
                            Matted Coat Policy
                        </h1>
                        <p className="body-font text-lg leading-relaxed" style={{ color: colors.teal }}>
                            Your dog's comfort always comes first. A matted coat is uncomfortable, restricts movement, and can cause skin problems. This policy explains how we handle matted coats so you know exactly what to expect.
                        </p>
                    </div>

                    {/* Sections */}
                    <div className="space-y-6">
                        {sections.map((section, i) => (
                            <div
                                key={i}
                                className="bg-white rounded-2xl p-8 shadow-sm border-l-4"
                                style={{ borderLeftColor: colors.cyan }}
                            >
                                <h2
                                    className="heading-font font-bold text-2xl mb-4"
                                    style={{ color: colors.plum }}
                                >
                                    {section.title}
                                </h2>
                                {section.intro && (
                                    <p className="body-font text-lg mb-4" style={{ color: colors.teal }}>
                                        {section.intro}
                                    </p>
                                )}
                                <ul className="space-y-4">
                                    {section.items.map((item, j) => (
                                        <li
                                            key={j}
                                            className="body-font text-lg leading-relaxed flex gap-3"
                                            style={{ color: colors.teal }}
                                        >
                                            <span style={{ color: colors.teal }} className="flex-shrink-0">•</span>
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>

                    {/* Closing */}
                    <div className="mt-12 text-center bg-white rounded-2xl p-8 shadow-sm">
                        <p
                            className="body-font text-lg italic mb-6"
                            style={{ color: colors.teal }}
                        >
                            Our goal is always a calm, safe, and positive grooming experience.
                        </p>
                        <p className="body-font text-base" style={{ color: colors.teal }}>
                            If you have questions about your dog's coat or how to care for it between grooms, please message us on{' '}
                            <a href="https://wa.me/447873329440" target="_blank" rel="noopener noreferrer" className="font-semibold underline hover:opacity-70" style={{ color: colors.teal }}>
                                WhatsApp
                            </a>
                        </p>
                    </div>
                </div>
            </main>

            <FooterSection onBookClick={onBookClick} />
        </div>
    );
};

export default MattedCoatPolicyPage;
