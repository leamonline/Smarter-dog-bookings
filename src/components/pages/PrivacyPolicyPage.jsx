import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { colors } from '../../constants/colors';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import Navigation from '../sections/Navigation';
import FooterSection from '../sections/FooterSection';

const PrivacyPolicyPage = ({ onBookClick }) => {
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setIsLoaded(true), 100);
        return () => clearTimeout(timer);
    }, []);

    useDocumentTitle('Privacy Policy');

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
                            Privacy Policy
                        </h1>
                        <p className="body-font text-lg leading-relaxed" style={{ color: colors.teal }}>
                            This policy explains how we collect and use personal data at Smarter Dog Grooming Salon. We're committed to protecting your privacy and being transparent about how we handle your information.
                        </p>
                        <p className="body-font text-base mt-4" style={{ color: colors.teal }}>
                            <strong>Last updated:</strong> December 2024
                        </p>
                    </div>

                    {/* Sections */}
                    <div className="space-y-6">

                        {/* Who We Are */}
                        <div className="bg-white rounded-2xl p-8 shadow-sm border-l-4" style={{ borderLeftColor: colors.cyan }}>
                            <h2 className="heading-font font-bold text-2xl mb-4" style={{ color: colors.plum }}>
                                Who We Are
                            </h2>
                            <p className="body-font text-lg leading-relaxed" style={{ color: colors.teal }}>
                                Smarter Dog Grooming Salon ("we", "us", or "our") operates at 183 Kings Road, Ashton-under-Lyne, OL6 8HD. We are the data controller for the personal information we collect about you and your dog.
                            </p>
                        </div>

                        {/* What Data We Collect */}
                        <div className="bg-white rounded-2xl p-8 shadow-sm border-l-4" style={{ borderLeftColor: colors.cyan }}>
                            <h2 className="heading-font font-bold text-2xl mb-4" style={{ color: colors.plum }}>
                                What Data We Collect
                            </h2>
                            <p className="body-font text-lg leading-relaxed mb-4" style={{ color: colors.teal }}>
                                When you book an appointment or contact us, we collect:
                            </p>
                            <ul className="space-y-3 mb-6">
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Your details:</strong> Name, phone number, email address, and home address</span>
                                </li>
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Your dog's details:</strong> Name, breed, age, weight, and coat type</span>
                                </li>
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Health & behaviour notes:</strong> Any medical conditions, allergies, behaviour concerns, or special requirements</span>
                                </li>
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Appointment history:</strong> Dates, services provided, grooming notes, and any issues encountered</span>
                                </li>
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Payment information:</strong> Transaction records processed securely through Square</span>
                                </li>
                            </ul>
                        </div>

                        {/* Why We Collect It */}
                        <div className="bg-white rounded-2xl p-8 shadow-sm border-l-4" style={{ borderLeftColor: colors.cyan }}>
                            <h2 className="heading-font font-bold text-2xl mb-4" style={{ color: colors.plum }}>
                                Why We Collect It
                            </h2>
                            <p className="body-font text-lg leading-relaxed mb-4" style={{ color: colors.teal }}>
                                We only collect data that's necessary to provide a safe and professional grooming service:
                            </p>
                            <ul className="space-y-3">
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Booking appointments:</strong> To schedule, confirm, and remind you about upcoming visits</span>
                                </li>
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Providing safe care:</strong> Health notes help us groom your dog safely and avoid triggers</span>
                                </li>
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Continuity of service:</strong> Appointment history helps us remember your dog's preferences and needs</span>
                                </li>
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Contacting you:</strong> To discuss bookings, share updates, or reach you in an emergency</span>
                                </li>
                            </ul>
                        </div>

                        {/* Data Retention */}
                        <div className="bg-white rounded-2xl p-8 shadow-sm border-l-4" style={{ borderLeftColor: colors.cyan }}>
                            <h2 className="heading-font font-bold text-2xl mb-4" style={{ color: colors.plum }}>
                                How Long We Keep Your Data
                            </h2>
                            <ul className="space-y-3">
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Active client records:</strong> Kept while you're a regular customer and for 3 years after your last appointment</span>
                                </li>
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Financial records:</strong> Kept for 6 years as required by UK tax law</span>
                                </li>
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Health/incident notes:</strong> Kept for 3 years for safety and liability purposes</span>
                                </li>
                            </ul>
                            <p className="body-font text-lg leading-relaxed mt-4" style={{ color: colors.teal }}>
                                You can request deletion of your data at any time (see Your Rights below).
                            </p>
                        </div>

                        {/* Data Sharing */}
                        <div className="bg-white rounded-2xl p-8 shadow-sm border-l-4" style={{ borderLeftColor: colors.cyan }}>
                            <h2 className="heading-font font-bold text-2xl mb-4" style={{ color: colors.plum }}>
                                Who We Share Data With
                            </h2>
                            <p className="body-font text-lg leading-relaxed mb-4" style={{ color: colors.teal }}>
                                <strong>We never sell your data.</strong> We only share information when necessary:
                            </p>
                            <ul className="space-y-3">
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Payment processor (Square):</strong> To process card payments securely</span>
                                </li>
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Emergency vets:</strong> If your dog becomes unwell and needs veterinary attention during their visit</span>
                                </li>
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Legal requirements:</strong> Only if required by law or court order</span>
                                </li>
                            </ul>
                        </div>

                        {/* Data Security */}
                        <div className="bg-white rounded-2xl p-8 shadow-sm border-l-4" style={{ borderLeftColor: colors.cyan }}>
                            <h2 className="heading-font font-bold text-2xl mb-4" style={{ color: colors.plum }}>
                                Data Security
                            </h2>
                            <p className="body-font text-lg leading-relaxed" style={{ color: colors.teal }}>
                                We implement appropriate security measures to protect your personal information. Your data is stored securely and only accessed by authorised personnel. Digital records are password-protected, and paper records are kept in a locked location.
                            </p>
                        </div>

                        {/* Your Rights */}
                        <div className="bg-white rounded-2xl p-8 shadow-sm border-l-4" style={{ borderLeftColor: colors.cyan }}>
                            <h2 className="heading-font font-bold text-2xl mb-4" style={{ color: colors.plum }}>
                                Your Rights
                            </h2>
                            <p className="body-font text-lg leading-relaxed mb-4" style={{ color: colors.teal }}>
                                Under UK data protection law (UK GDPR), you have the right to:
                            </p>
                            <ul className="space-y-3">
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Access:</strong> Request a copy of the personal data we hold about you</span>
                                </li>
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Correction:</strong> Ask us to correct inaccurate or incomplete data</span>
                                </li>
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Deletion:</strong> Request that we delete your data (subject to legal retention requirements)</span>
                                </li>
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Objection:</strong> Object to or restrict how we process your data</span>
                                </li>
                            </ul>
                            <p className="body-font text-lg leading-relaxed mt-4" style={{ color: colors.teal }}>
                                To exercise any of these rights, please contact us using the details below.
                            </p>
                        </div>

                        {/* Cookies */}
                        <div className="bg-white rounded-2xl p-8 shadow-sm border-l-4" style={{ borderLeftColor: colors.cyan }}>
                            <h2 className="heading-font font-bold text-2xl mb-4" style={{ color: colors.plum }}>
                                Cookies
                            </h2>
                            <p className="body-font text-lg leading-relaxed mb-4" style={{ color: colors.teal }}>
                                Our website uses cookies to function properly:
                            </p>
                            <ul className="space-y-3">
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Essential cookies:</strong> Required for the website to work (no consent needed)</span>
                                </li>
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Analytics cookies:</strong> Help us understand how visitors use our site (only with your consent)</span>
                                </li>
                            </ul>
                            <p className="body-font text-lg leading-relaxed mt-4" style={{ color: colors.teal }}>
                                When you first visit our site, you'll see a cookie banner where you can accept or decline non-essential cookies. You can change your preferences at any time through your browser settings.
                            </p>
                        </div>

                        {/* Contact */}
                        <div className="bg-white rounded-2xl p-8 shadow-sm border-l-4" style={{ borderLeftColor: colors.cyan }}>
                            <h2 className="heading-font font-bold text-2xl mb-4" style={{ color: colors.plum }}>
                                Contact Us
                            </h2>
                            <p className="body-font text-lg leading-relaxed mb-4" style={{ color: colors.teal }}>
                                If you have any questions about this Privacy Policy, want to exercise your rights, or have concerns about how we handle your data:
                            </p>
                            <ul className="space-y-3">
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Email:</strong> <a href="mailto:bookings@smarterdog.co.uk" className="underline hover:opacity-70" style={{ color: colors.teal }}>bookings@smarterdog.co.uk</a></span>
                                </li>
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>WhatsApp:</strong> <a href="https://wa.me/447873329440" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-70" style={{ color: colors.teal }}>07873 329440</a></span>
                                </li>
                                <li className="body-font text-lg leading-relaxed flex gap-3" style={{ color: colors.teal }}>
                                    <span style={{ color: colors.teal }}>•</span>
                                    <span><strong>Address:</strong> 183 Kings Road, Ashton-under-Lyne, OL6 8HD</span>
                                </li>
                            </ul>
                            <p className="body-font text-lg leading-relaxed mt-4" style={{ color: colors.teal }}>
                                If you're not satisfied with our response, you have the right to complain to the Information Commissioner's Office (ICO) at <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="underline hover:opacity-70" style={{ color: colors.teal }}>ico.org.uk</a>.
                            </p>
                        </div>

                    </div>

                    {/* Back link */}
                    <div className="mt-12 pt-8 border-t" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
                        <Link
                            to="/"
                            className="inline-flex items-center gap-2 font-bold transition-all hover:opacity-70 body-font text-lg"
                            style={{ color: colors.teal }}
                        >
                            ← Back to Home
                        </Link>
                    </div>
                </div>
            </main>

            <FooterSection onBookClick={onBookClick} />
        </div>
    );
};

export default PrivacyPolicyPage;
