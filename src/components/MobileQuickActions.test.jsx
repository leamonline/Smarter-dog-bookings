import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MobileQuickActions from './MobileQuickActions';

vi.mock('../utils/analytics', () => ({
  trackEvent: vi.fn(),
}));

describe('MobileQuickActions', () => {
  it('calls onBookClick when booking button is clicked', () => {
    const onBookClick = vi.fn();
    render(<MobileQuickActions onBookClick={onBookClick} />);

    fireEvent.click(screen.getByRole('button', { name: /Book now/i }));
    expect(onBookClick).toHaveBeenCalledWith('Mobile Quick Actions');
  });

  it('renders WhatsApp link with wa.me href', () => {
    render(<MobileQuickActions onBookClick={() => {}} />);

    expect(screen.getByRole('link', { name: /WhatsApp us/i })).toHaveAttribute('href', 'https://wa.me/447873329440');
  });
});
