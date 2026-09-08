import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ExternalRedirect from './ExternalRedirect';

describe('ExternalRedirect', () => {
  let originalLocation;

  beforeEach(() => {
    originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { replace: vi.fn() },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    vi.clearAllMocks();
  });

  it('replaces the location with the target URL on mount', () => {
    render(<ExternalRedirect to="https://example.com/login" />);

    expect(window.location.replace).toHaveBeenCalledWith('https://example.com/login');
  });

  it('shows a brief loading message while redirecting', () => {
    render(<ExternalRedirect to="https://example.com/login" />);

    expect(screen.getByText(/taking you to booking/i)).toBeInTheDocument();
  });
});
