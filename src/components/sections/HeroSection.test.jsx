import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import HeroSection from './HeroSection';
import { colors } from '../../constants/colors';

describe('HeroSection', () => {
  it('renders hero headline', () => {
    render(<HeroSection isLoaded={true} onBookClick={() => {}} />);

    expect(screen.getByText(/Come scruffy/i)).toBeInTheDocument();
    expect(screen.getByText(/Leave gorgeous/i)).toBeInTheDocument();
  });

  it('renders booking button with brand colors', () => {
    render(<HeroSection isLoaded={true} onBookClick={() => {}} />);

    const button = screen.getByRole('button', { name: /Book online/i });
    expect(button).toHaveStyle({ backgroundColor: colors.yellow, color: colors.plum });
  });

  it('calls onBookClick from hero button', () => {
    const onBookClick = vi.fn();
    render(<HeroSection isLoaded={true} onBookClick={onBookClick} />);

    fireEvent.click(screen.getByRole('button', { name: /Book online/i }));
    expect(onBookClick).toHaveBeenCalledWith('Hero Section');
  });
});
