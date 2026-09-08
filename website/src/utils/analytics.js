import ReactGA from 'react-ga4';

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

let isInitialized = false;

/**
 * Initialize GA4 — only call AFTER cookie consent is granted.
 * Safe to call multiple times (initializes only once).
 * Does NOT load GA if consent has not been granted, ensuring
 * GDPR/PECR compliance by not setting cookies before consent.
 */
export const initializeAnalytics = () => {
    if (isInitialized || !GA_MEASUREMENT_ID) return;

    const consent = localStorage.getItem('cookieConsent');
    if (consent !== 'true') return;

    ReactGA.initialize(GA_MEASUREMENT_ID);
    isInitialized = true;

    if (import.meta.env.DEV) {
        console.log('Analytics initialized (consent granted)');
    }
};

export const trackEvent = (category, action, label) => {
    if (!isInitialized) return;
    ReactGA.event({ category, action, label });
};

export const trackPageView = (path) => {
    if (!isInitialized) return;
    ReactGA.send({ hitType: "pageview", page: path });
};
