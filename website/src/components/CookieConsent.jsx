import React, { useState, useEffect } from 'react';
import { colors } from '../constants/colors';
import { initializeAnalytics } from '../utils/analytics';

const CookieConsent = () => {
    const [isVisible, setIsVisible] = useState(() => !localStorage.getItem('cookieConsent'));

    useEffect(() => {
        const consent = localStorage.getItem('cookieConsent');
        if (consent === 'true') {
            initializeAnalytics();
        }
    }, []);

    const handleAccept = () => {
        localStorage.setItem('cookieConsent', 'true');
        setIsVisible(false);
        initializeAnalytics();
    };

    const handleDecline = () => {
        localStorage.setItem('cookieConsent', 'false');
        setIsVisible(false);
    };

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-fade-in-up">
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-2xl p-6 md:flex items-center justify-between gap-6 border border-gray-100">
                <div className="mb-4 md:mb-0">
                    <h3 className="heading-font font-bold text-lg mb-2" style={{ color: colors.teal }}>
                        🍪 We use cookies
                    </h3>
                    <p className="body-font text-sm text-gray-600">
                        We use cookies to analyze our traffic and improve your experience.
                        We don't sell your data to anyone.
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={handleDecline}
                        className="px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-gray-100"
                        style={{ color: colors.teal }}
                    >
                        Decline
                    </button>
                    <button
                        onClick={handleAccept}
                        className="px-6 py-2 rounded-lg text-sm font-bold text-white transition-transform hover:scale-105"
                        style={{ backgroundColor: colors.teal }}
                    >
                        Accept
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CookieConsent;
