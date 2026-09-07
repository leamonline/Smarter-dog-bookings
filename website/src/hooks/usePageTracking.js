import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../utils/analytics';

/**
 * Hook that tracks page views on route changes.
 * Respects cookie consent - only tracks if user has consented.
 */
export const usePageTracking = () => {
    const location = useLocation();

    useEffect(() => {
        // Track page view whenever route changes
        trackPageView(location.pathname);
    }, [location.pathname]);
};

export default usePageTracking;
