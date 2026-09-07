import React, { useEffect, useState } from 'react';
import { colors } from '../constants/colors';
import { useFocusTrap } from '../hooks/useFocusTrap';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion';
import { trackEvent } from '../utils/analytics';
import { fetchBankHolidayEvents, isInBankHolidayWindow } from '../utils/bankHolidayWindow';

const SHOW_DELAY_MS = 1200;

const LandingPopup = ({ onBookClick }) => {
    const [isOpen, setIsOpen] = useState(false);
    const prefersReducedMotion = usePrefersReducedMotion();

    // Close only hides for the current page view. We deliberately don't persist
    // dismissal, so the next visit gets the heads-up again if we're still in
    // the bank-holiday window.
    const handleClose = React.useCallback(() => {
        setIsOpen(false);
    }, []);

    const dialogRef = useFocusTrap(isOpen, handleClose);

    useEffect(() => {
        // Two-phase guard: first ask gov.uk whether we're in a Monday bank-holiday
        // window, then (only if yes) schedule the popup. If the fetch fails for
        // any reason — network, CORS, bad payload — we fail closed and stay quiet.
        let cancelled = false;
        let timer = null;

        fetchBankHolidayEvents()
            .then((events) => {
                if (cancelled) return;
                if (!isInBankHolidayWindow(events)) return;

                timer = setTimeout(() => {
                    if (cancelled) return;
                    setIsOpen(true);
                    trackEvent('Engagement', 'Landing Popup Shown', 'Bank Holiday');
                }, SHOW_DELAY_MS);
            })
            .catch(() => {
                // Silent — better to under-show than to show stale info.
            });

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, []);

    const handleBookNow = () => {
        trackEvent('Engagement', 'Landing Popup Book Now', 'Bank Holiday');
        handleClose();
        if (typeof onBookClick === 'function') {
            onBookClick('Landing Popup');
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
            role="presentation"
        >
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm"
                onClick={handleClose}
                aria-hidden="true"
            />

            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="landing-popup-title"
                aria-describedby="landing-popup-body"
                className={`relative w-full max-w-md md:max-w-lg bg-white rounded-3xl shadow-2xl my-auto max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain ${prefersReducedMotion ? '' : 'animate-fade-in-up'}`}
            >
                {/* Header band with decorations + logo */}
                <div className="relative pt-5 pb-2 px-5 sm:pt-6 sm:px-6" style={{ backgroundColor: colors.cyanLight }}>
                    {/* Paw print - top left */}
                    <svg
                        aria-hidden="true"
                        className="absolute top-3 left-4 w-7 h-7 opacity-80"
                        viewBox="0 0 24 24"
                        fill={colors.cyan}
                    >
                        <ellipse cx="6" cy="9" rx="1.7" ry="2.4" />
                        <ellipse cx="10" cy="6" rx="1.7" ry="2.4" />
                        <ellipse cx="14" cy="6" rx="1.7" ry="2.4" />
                        <ellipse cx="18" cy="9" rx="1.7" ry="2.4" />
                        <path d="M12 11c-3 0-5 2.5-5 5 0 1.7 1.5 3 3 3 .8 0 1.4-.4 2-.4s1.2.4 2 .4c1.5 0 3-1.3 3-3 0-2.5-2-5-5-5z" />
                    </svg>

                    {/* Sparkle / asterisk */}
                    <svg
                        aria-hidden="true"
                        className="absolute top-12 left-16 w-4 h-4 opacity-80"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={colors.cyan}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                    >
                        <path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4" />
                    </svg>

                    {/* Scissors - top right */}
                    <svg
                        aria-hidden="true"
                        className="absolute top-10 right-16 w-7 h-7 opacity-80"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={colors.cyan}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <circle cx="6" cy="6" r="3" />
                        <circle cx="6" cy="18" r="3" />
                        <path d="M8.12 8.12L20 20M20 4L8.12 15.88" />
                    </svg>

                    {/* Comb - top right */}
                    <svg
                        aria-hidden="true"
                        className="absolute top-3 right-6 w-7 h-7 opacity-80"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={colors.cyan}
                        strokeWidth="2"
                        strokeLinecap="round"
                    >
                        <rect x="3" y="6" width="18" height="5" rx="1" />
                        <path d="M6 11v4M9 11v5M12 11v4M15 11v5M18 11v4" />
                    </svg>

                    {/* Close button */}
                    <button
                        type="button"
                        onClick={handleClose}
                        aria-label="Close announcement"
                        className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center hover:scale-105 transition-transform z-10"
                        style={{ color: colors.plum }}
                    >
                        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                    </button>

                    {/* Logo */}
                    <div className="relative z-0 flex justify-center pt-2 pb-6">
                        <img
                            src="/assets/logo-text.png"
                            alt="Smarter Dog Grooming Salon"
                            width="200"
                            height="56"
                            className="h-12 w-auto object-contain"
                        />
                    </div>
                </div>

                {/* Wave divider between header and body */}
                <div style={{ backgroundColor: colors.cyanLight, lineHeight: 0 }}>
                    <svg
                        viewBox="0 0 1440 80"
                        preserveAspectRatio="none"
                        xmlns="http://www.w3.org/2000/svg"
                        className="block w-full h-6"
                        aria-hidden="true"
                    >
                        <path
                            d="M0,40 C240,80 480,0 720,40 C960,80 1200,0 1440,40 L1440,80 L0,80 Z"
                            fill="white"
                        />
                    </svg>
                </div>

                {/* Body */}
                <div className="px-5 pb-5 pt-2 sm:px-6 sm:pb-6 md:px-8 md:pb-8 relative">
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 md:gap-6 items-start">
                        <div className="min-w-0">
                            {/* Title */}
                            <h2
                                id="landing-popup-title"
                                className="heading-font font-bold text-3xl sm:text-4xl md:text-5xl text-center md:text-left"
                                style={{ color: colors.plum, lineHeight: 1.05, letterSpacing: '-0.01em' }}
                            >
                                Bank Holiday<br />Update
                            </h2>

                            {/* Yellow squiggle underline */}
                            <div className="flex justify-center md:justify-start mt-2 mb-5">
                                <svg viewBox="0 0 220 10" className="w-40 h-3" fill="none" aria-hidden="true">
                                    <path d="M2 6 Q 55 2, 110 6 T 218 6" stroke={colors.yellow} strokeWidth="4" strokeLinecap="round" />
                                </svg>
                            </div>

                            <div id="landing-popup-body">
                                <p
                                    className="body-font text-base md:text-[17px] font-semibold text-center md:text-left"
                                    style={{ color: colors.plum }}
                                >
                                    We'll be closed on Bank Holiday Monday.
                                </p>

                                {/* Paw divider */}
                                <div className="flex items-center gap-3 my-4" aria-hidden="true">
                                    <span className="flex-1 h-px" style={{ backgroundColor: colors.cyanLight }} />
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill={colors.cyan}>
                                        <ellipse cx="6" cy="9" rx="1.7" ry="2.4" />
                                        <ellipse cx="10" cy="6" rx="1.7" ry="2.4" />
                                        <ellipse cx="14" cy="6" rx="1.7" ry="2.4" />
                                        <ellipse cx="18" cy="9" rx="1.7" ry="2.4" />
                                        <path d="M12 11c-3 0-5 2.5-5 5 0 1.7 1.5 3 3 3 .8 0 1.4-.4 2-.4s1.2.4 2 .4c1.5 0 3-1.3 3-3 0-2.5-2-5-5-5z" />
                                    </svg>
                                    <span className="flex-1 h-px" style={{ backgroundColor: colors.cyanLight }} />
                                </div>

                                <p
                                    className="body-font text-sm md:text-base text-center md:text-left"
                                    style={{ color: colors.plum }}
                                >
                                    We reopen on Tuesday and will also be opening on Thursday with extra appointments available.
                                </p>

                                <p className="body-font text-sm mt-4 flex items-center gap-2 justify-center md:justify-start" style={{ color: colors.plum }}>
                                    <span aria-hidden="true">🌐</span>
                                    <span>
                                        Book online anytime at{' '}
                                        <span className="font-semibold" style={{ color: colors.pink }}>
                                            smarterdog.co.uk
                                        </span>
                                    </span>
                                </p>
                            </div>
                        </div>

                        {/* Polaroid image */}
                        <div className="hidden md:flex justify-center md:justify-end pt-1">
                            <div
                                className="relative bg-white p-2 pb-6 shadow-layered"
                                style={{ transform: 'rotate(4deg)', width: '140px' }}
                            >
                                {/* Pink tape */}
                                <span
                                    aria-hidden="true"
                                    className="absolute -top-2 left-1/2 w-20 h-5 opacity-80"
                                    style={{
                                        backgroundColor: colors.pink + 'CC',
                                        transform: 'translateX(-50%) rotate(-3deg)',
                                        clipPath: 'polygon(2% 0%, 98% 0%, 100% 100%, 0% 100%)'
                                    }}
                                />
                                <picture>
                                    <source srcSet="/assets/client-dog-2-240.avif" type="image/avif" />
                                    <source srcSet="/assets/client-dog-2-240.webp" type="image/webp" />
                                    <img
                                        src="/assets/client-dog-2-240.jpg"
                                        alt="A happy freshly groomed dog"
                                        width="240"
                                        height="240"
                                        loading="lazy"
                                        className="block w-full aspect-square object-cover"
                                    />
                                </picture>
                            </div>
                        </div>
                    </div>

                    {/* Book now button */}
                    <div className="mt-6 flex flex-col items-center relative">
                        <svg aria-hidden="true" className="absolute -left-2 bottom-3 w-8 h-3" viewBox="0 0 40 12" fill="none" stroke={colors.yellow} strokeWidth="2.5" strokeLinecap="round">
                            <path d="M3 9l5-5M14 9V3M24 9l-5-5" />
                        </svg>
                        <svg aria-hidden="true" className="absolute -right-2 bottom-3 w-8 h-3" viewBox="0 0 40 12" fill="none" stroke={colors.yellow} strokeWidth="2.5" strokeLinecap="round">
                            <path d="M37 9l-5-5M26 9V3M16 9l5-5" />
                        </svg>
                        <button
                            type="button"
                            onClick={handleBookNow}
                            className="px-12 py-4 rounded-full font-bold text-white text-lg transition-all duration-300 hover:shadow-xl hover:scale-105 active-squish"
                            style={{ backgroundColor: colors.pink }}
                        >
                            Book now
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LandingPopup;
