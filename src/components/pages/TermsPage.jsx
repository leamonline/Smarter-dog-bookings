import React, { useState, useEffect } from 'react';
import { colors } from '../../constants/colors';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import Navigation from '../sections/Navigation';
import FooterSection from '../sections/FooterSection';

const TermsPage = ({ onBookClick }) => {
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setIsLoaded(true), 100);
        return () => clearTimeout(timer);
    }, []);

    useDocumentTitle('Terms & Conditions');

    const sections = [
        {
            title: "Appointments & Arrival",
            items: [
                "Please arrive on time for your appointment. We work in 30-minute arrival windows to keep the day running smoothly.",
                "Late arrivals may need to be rescheduled if they impact the next appointment.",
                "Dogs must be collected promptly when notified. Late collections may incur a fee."
            ]
        },
        {
            title: "Cancellations & No-Shows",
            items: [
                "We require at least 24 hours' notice for cancellations.",
                "No-shows or late cancellations may require a non-refundable deposit before future bookings.",
                "Deposits are decided on a case-by-case basis and must be paid before the next appointment is confirmed."
            ]
        },
        {
            title: "Grooming Services",
            items: [
                "We offer full grooms only. The only pre-bookable add-on is a flea bath.",
                "Nail trims, ear cleaning, and anal gland expression are included within a full groom or available as walk-in services.",
                "Final grooming style depends on the dog's coat condition, behaviour, and overall welfare at the time of the appointment."
            ]
        },
        {
            title: "Coat Condition & Matted Fur",
            items: [
                "Severely matted coats may require clipping short for the welfare of the dog.",
                "Matted or compacted coats increase the risk of skin irritation and uncovering pre-existing issues.",
                "We will always prioritise comfort and safety over style.",
                "Additional charges may apply for de-matting or matted coat grooming."
            ]
        },
        {
            title: "Behaviour & Safety",
            items: [
                "If a dog shows extreme distress or aggression, we may stop the groom for safety reasons.",
                "In these cases, charges may still apply for the time spent.",
                "Some decisions are made at check-in on a case-by-case basis."
            ]
        },
        {
            title: "Health & Medical Conditions",
            items: [
                "Owners must inform us of any medical, behavioural, or mobility issues before the appointment.",
                "We strongly recommend that vaccinations are up to date, but this remains the owner's responsibility.",
                "We are not a veterinary practice. If a dog becomes unwell or an emergency occurs, we will contact you immediately. If required, we may use the local vet we work with."
            ]
        },
        {
            title: "Fleas",
            items: [
                "If fleas are found, a flea bath will be given automatically and an additional fee will apply.",
                "You may be asked to rebook after appropriate at-home flea treatment."
            ]
        },
        {
            title: "Senior Dogs & Special Requirements",
            items: [
                "Older dogs or dogs with additional needs will be groomed at their own pace.",
                "Welfare comes first, and adjustments may be made to the groom if necessary."
            ]
        },
        {
            title: "Payments",
            items: [
                "We accept cash and card payments via Square.",
                "Receipts can be emailed upon request.",
                "All payments must be made at the time of collection."
            ]
        },
        {
            title: "Photography & Social Media",
            items: [
                "We may take photos of your dog for our social media or grooming portfolio.",
                "If you would prefer no photos, please let us know at check-in."
            ]
        },
        {
            title: "Liability",
            items: [
                "While every care is taken, grooming carries inherent risks (e.g., minor nicks, clipper rash, uncovering hidden skin conditions).",
                "Smarter Dog Grooming Salon is not liable for issues arising from undisclosed medical or behavioural conditions, severely matted coats, or flea infestations."
            ]
        },
        {
            title: "Owner Responsibility",
            items: [
                "By booking, you confirm that the information provided about your dog is accurate.",
                "Owners remain responsible for their dog's behaviour, health, and wellbeing outside the grooming session."
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
                            Terms & Conditions
                        </h1>
                        <p className="body-font text-lg leading-relaxed" style={{ color: colors.teal }}>
                            These guidelines help us keep every dog comfortable and safe while running the salon smoothly. By booking an appointment with Smarter Dog Grooming Salon, you agree to the following:
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
                            Thank you for supporting a safe, calm, and welfare-focused grooming environment for every dog who visits us.
                        </p>
                        <p className="body-font text-base" style={{ color: colors.teal }}>
                            If you have questions about any of these policies, please message us on{' '}
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

export default TermsPage;
