import { trackEvent } from './analytics';
import { BOOKING_URL } from '../constants/links';

/**
 * Send the visitor to the external customer portal to book/log in.
 * Records the same analytics event the old in-page modal used, so
 * existing GA funnels keep working, then navigates in the same tab.
 *
 * @param {string} source - where the click came from (for analytics)
 */
export const goToBooking = (source = 'General') => {
    trackEvent('Engagement', 'Click Request Appointment', source);
    window.location.assign(BOOKING_URL);
};
