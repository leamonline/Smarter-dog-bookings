import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackEvent } from './analytics';
import { BOOKING_URL } from '../constants/links';
import { goToBooking } from './booking';

vi.mock('./analytics', () => ({ trackEvent: vi.fn() }));

describe('goToBooking', () => {
  let originalLocation;

  beforeEach(() => {
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign: vi.fn() },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    vi.clearAllMocks();
  });

  it('records the analytics event and redirects to the booking portal', () => {
    goToBooking('Hero Section');

    expect(trackEvent).toHaveBeenCalledWith(
      'Engagement',
      'Click Request Appointment',
      'Hero Section',
    );
    expect(window.location.assign).toHaveBeenCalledWith(BOOKING_URL);
  });

  it('defaults the source label to "General"', () => {
    goToBooking();

    expect(trackEvent).toHaveBeenCalledWith(
      'Engagement',
      'Click Request Appointment',
      'General',
    );
    expect(window.location.assign).toHaveBeenCalledWith(BOOKING_URL);
  });
});
