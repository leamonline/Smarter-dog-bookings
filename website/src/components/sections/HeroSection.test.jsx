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

    expect(screen.getByRole('heading', { level: 1, name: /Come scruffy\.\s*Leave gorgeous\./i })).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Book for our return' }));
    expect(onBookClick).toHaveBeenCalledWith('Holiday Notice');

    vi.mocked(useHolidayNotices).mockReturnValue([]);
    rerender(<HeroSection isLoaded={true} onBookClick={onBookClick} />);
    expect(screen.queryByRole('button', { name: 'Book for our return' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Book your dog online/i })).toBeInTheDocument();
    expect(screen.getByText(/Easy peasy/i)).toBeInTheDocument();
  });

  // The hero tidy-up of 23 November 2026: one yellow control, one handwritten
  // line, and the proof facts the stats strip already states.
  it('has one yellow element, the booking button, and no yellow tag that looks like a second button', () => {
    const { container } = render(<HeroSection isLoaded={true} onBookClick={() => {}} />);
    const yellow = [...container.querySelectorAll('[style]')].filter(
      (el) => el.style.backgroundColor === 'rgb(254, 204, 19)',
    );
    expect(yellow).toHaveLength(1);
    expect(yellow[0]).toBe(screen.getByRole('button', { name: /Book your dog online/i }));
  });

  it('keeps to one handwritten line on the hero: Easy peasy, plus the front photo caption only', () => {
    const { container } = render(<HeroSection isLoaded={true} onBookClick={() => {}} />);
    const handwriting = [...container.querySelectorAll('.handwriting')].map((el) => el.textContent.trim());
    expect(handwriting).toEqual([expect.stringMatching(/^Easy peasy/), 'Feeling gorgeous']);
    expect(screen.queryByText(/quick and easy,/i)).not.toBeInTheDocument();
  });

  it('still describes the uncaptioned photos to screen readers', () => {
    render(<HeroSection isLoaded={true} onBookClick={() => {}} />);
    expect(screen.getByAltText('Happy freshly groomed pup')).toBeInTheDocument();
    expect(screen.getByAltText('Fluffy and fabulous')).toBeInTheDocument();
    expect(screen.getByAltText('Feeling gorgeous')).toBeInTheDocument();
  });

  it('states the rating and founding year from the shared facts', () => {
    render(<HeroSection isLoaded={true} onBookClick={() => {}} />);
    expect(screen.getByText(/4\.9 on Google · Since 1982/)).toBeInTheDocument();
  });

  it('draws the swash under "gorgeous." only', () => {
    const { container } = render(<HeroSection isLoaded={true} onBookClick={() => {}} />);
    const swash = container.querySelector('h1 svg.swash-draw');
    expect(swash.parentElement.textContent).toBe('gorgeous.');
  });
});
