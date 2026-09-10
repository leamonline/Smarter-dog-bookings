import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HeroSection from './HeroSection';
import { colors } from '../../constants/colors';
import { useHolidayNotices } from '../../hooks/useHolidayNotices';

vi.mock('../../hooks/useHolidayNotices', () => ({
  useHolidayNotices: vi.fn(() => []),
}));

describe('HeroSection', () => {
  it('renders hero headline', () => {
    render(<HeroSection isLoaded={true} onBookClick={() => {}} />);

    expect(screen.getByText(/Come scruffy/i)).toBeInTheDocument();
    expect(screen.getByText(/Leave gorgeous/i)).toBeInTheDocument();
  });

  it('renders booking button with brand colors', () => {
    render(<HeroSection isLoaded={true} onBookClick={() => {}} />);

    const button = screen.getByRole('button', { name: /Book your dog online/i });
    expect(button).toHaveStyle({ backgroundColor: colors.yellow, color: colors.plum });
  });

  it('calls onBookClick from hero button', () => {
    const onBookClick = vi.fn();
    render(<HeroSection isLoaded={true} onBookClick={onBookClick} />);

    fireEvent.click(screen.getByRole('button', { name: /Book your dog online/i }));
    expect(onBookClick).toHaveBeenCalledWith('Hero Section');
  });

  it('shows no holiday card when nothing is scheduled', () => {
    render(<HeroSection isLoaded={true} onBookClick={() => {}} />);

    expect(screen.queryByRole('button', { name: /Book for our return/i })).not.toBeInTheDocument();
  });

  it.each(['upcoming', 'away'])('replaces the booking group while a %s holiday card is visible, then restores it', (phase) => {
    const onBookClick = vi.fn();
    vi.mocked(useHolidayNotices).mockReturnValue([{ id: 'holiday', phase, closed_from: '2026-09-10', reopens_on: '2026-09-21' }]);
    const { rerender } = render(<HeroSection isLoaded={true} onBookClick={onBookClick} />);

    expect(screen.queryByRole('button', { name: /Book your dog online/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Easy peasy/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/quick and easy,/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Book for our return' }));
    expect(onBookClick).toHaveBeenCalledWith('Holiday Notice');

    vi.mocked(useHolidayNotices).mockReturnValue([]);
    rerender(<HeroSection isLoaded={true} onBookClick={onBookClick} />);
    expect(screen.queryByRole('button', { name: 'Book for our return' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Book your dog online/i })).toBeInTheDocument();
    expect(screen.getByText(/Easy peasy/i)).toBeInTheDocument();
    expect(screen.getByText(/quick and easy,/i)).toBeInTheDocument();
  });
});
