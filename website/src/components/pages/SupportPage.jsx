import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { colors } from '../../constants/colors';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import Navigation from '../sections/Navigation';
import FooterSection from '../sections/FooterSection';
import { useSalonFacts } from '../../hooks/useSalonFacts';
import { whatsAppUrl } from '../../constants/salonFacts';

const SUPPORT_TITLE = 'App support — Smarter Dog Grooming';

const toNationalDisplay = (e164) => {
    const digits = String(e164 || '').replace(/[^0-9]/g, '');
    const national = digits.startsWith('44') ? `0${digits.slice(2)}` : digits;
    return national.length === 11 ? `${national.slice(0, 5)} ${national.slice(5)}` : national;
};

const cardClass = 'bg-white rounded-2xl p-8 shadow-sm border-l-4';

const SupportPage = ({ onBookClick }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const facts = useSalonFacts();

    useEffect(() => {
        const timer = setTimeout(() => setIsLoaded(true), 100);
        return () => clearTimeout(timer);
    }, []);

    useDocumentTitle(SUPPORT_TITLE, true);

    const addressLines = [
        facts.businessName,
        ...String(facts.businessAddress || '').split(',').map((line) => line.trim()).filter(Boolean),
    ];
    const phoneDisplay = toNationalDisplay(facts.businessPhone);
    const whatsAppHref = whatsAppUrl(facts.businessPhone);

    return (
        <div className="min-h-screen" style={{ backgroundColor: colors.offWhite }}>
            <Navigation isLoaded={isLoaded} onBookClick={onBookClick} />

            <main id="main-content" className="pt-24 pb-16 px-6">
                <div className="max-w-3xl mx-auto">
                    <p className="body-font text-base mb-4" style={{ color: colors.teal }}>
                        Support
                    </p>

                    <div className="mb-12">
                        <h1
                            className="heading-font font-bold text-4xl md:text-5xl mb-6"
                            style={{ color: colors.plum }}
                        >
                            {SUPPORT_TITLE}
                        </h1>
                        <p className="body-font text-lg leading-relaxed" style={{ color: colors.teal }}>
                            If you need a hand with the Smarter Dog Grooming iPhone app, or with a booking you have made in it, you can reach us using the details below. We are a small independent salon in Ashton-under-Lyne, and we read everything that comes in.
                        </p>
                    </div>

                    <div className="space-y-6">
                        <div className={cardClass} style={{ borderLeftColor: colors.cyan }}>
                            <h2 className="heading-font font-bold text-2xl mb-4" style={{ color: colors.plum }}>
                                Email
                            </h2>
                            <p className="body-font text-lg leading-relaxed" style={{ color: colors.teal }}>
                                <a
                                    href={`mailto:${facts.businessEmail}`}
                                    className="underline hover:opacity-70"
                                    style={{ color: colors.teal }}
                                >
                                    {facts.businessEmail}
                                </a>
                            </p>
                        </div>

                        <div className={cardClass} style={{ borderLeftColor: colors.cyan }}>
                            <h2 className="heading-font font-bold text-2xl mb-4" style={{ color: colors.plum }}>
                                WhatsApp
                            </h2>
                            <p className="body-font text-lg leading-relaxed" style={{ color: colors.teal }}>
                                <a
                                    href={whatsAppHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline hover:opacity-70"
                                    style={{ color: colors.teal }}
                                >
                                    {phoneDisplay}
                                </a>
                                {' '}
                                (messages only — there is no phone line)
                            </p>
                        </div>

                        <div className={cardClass} style={{ borderLeftColor: colors.cyan }}>
                            <h2 className="heading-font font-bold text-2xl mb-4" style={{ color: colors.plum }}>
                                Post
                            </h2>
                            <address
                                className="body-font text-lg leading-relaxed not-italic"
                                style={{ color: colors.teal }}
                            >
                                {addressLines.map((line) => (
                                    <span key={line} className="block">{line}</span>
                                ))}
                            </address>
                        </div>

                        <div className={cardClass} style={{ borderLeftColor: colors.cyan }}>
                            <h2 className="heading-font font-bold text-2xl mb-4" style={{ color: colors.plum }}>
                                Typical salon hours
                            </h2>
                            <p className="body-font text-lg leading-relaxed" style={{ color: colors.teal }}>
                                Monday to Wednesday, 8:30am to 3:00pm. We are usually closed Thursday to Sunday. We close on bank holidays and often open the Thursday after instead. If you are unsure, please check{' '}
                                <Link to="/" className="underline hover:opacity-70" style={{ color: colors.teal }}>
                                    smarterdog.co.uk
                                </Link>
                                {' '}
                                or message us.
                            </p>
                        </div>

                        <div className={cardClass} style={{ borderLeftColor: colors.cyan }}>
                            <h2 className="heading-font font-bold text-2xl mb-4" style={{ color: colors.plum }}>
                                The app
                            </h2>
                            <p className="body-font text-lg leading-relaxed mb-4" style={{ color: colors.teal }}>
                                With the app you can book a groom, keep your dogs’ details and appointments, message us, and get an optional reminder before you visit. If we have asked for a deposit after a missed appointment, you can pay it in the app with Apple Pay or a card.
                            </p>
                            <p className="body-font text-lg leading-relaxed" style={{ color: colors.teal }}>
                                If something in the app is not working, please tell us which iPhone and which version of the app you are using, and what you were trying to do. We will help as quickly as we can.
                            </p>
                        </div>

                        <div className={cardClass} style={{ borderLeftColor: colors.cyan }}>
                            <h2 className="heading-font font-bold text-2xl mb-4" style={{ color: colors.plum }}>
                                Your account
                            </h2>
                            <p className="body-font text-lg leading-relaxed mb-4" style={{ color: colors.teal }}>
                                You sign in with your mobile number and a password, or with a one-time code sent by SMS.
                            </p>
                            <p className="body-font text-lg leading-relaxed" style={{ color: colors.teal }}>
                                To delete your customer account, email or message us and we will help.
                            </p>
                        </div>

                        <div className={cardClass} style={{ borderLeftColor: colors.cyan }}>
                            <h2 className="heading-font font-bold text-2xl mb-4" style={{ color: colors.plum }}>
                                Privacy
                            </h2>
                            <p className="body-font text-lg leading-relaxed" style={{ color: colors.teal }}>
                                Our privacy policy is at{' '}
                                <Link to="/privacy" className="underline hover:opacity-70" style={{ color: colors.teal }}>
                                    smarterdog.co.uk/privacy
                                </Link>
                                . It explains what we collect in the app and how we use it.
                            </p>
                        </div>
                    </div>

                    <div className="mt-12 text-center bg-white rounded-2xl p-8 shadow-sm">
                        <p className="body-font text-lg italic" style={{ color: colors.teal }}>
                            Thank you for visiting us.
                        </p>
                    </div>

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

export default SupportPage;
