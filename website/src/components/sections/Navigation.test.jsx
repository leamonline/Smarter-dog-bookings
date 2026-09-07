import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Navigation from './Navigation';
import { BOOKING_URL } from '../../constants/links';

const renderNavigation = (props = {}) =>
  render(
    <MemoryRouter>
      <Navigation isLoaded={true} {...props} />
    </MemoryRouter>
  );

describe('Navigation', () => {
  it('renders logo and primary links', () => {
    renderNavigation();

    expect(screen.getByAltText('Smarter Dog Grooming Salon')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Services' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Houndsly' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Our Approach' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'FAQ' })).toBeInTheDocument();
  });

  it('opens and closes mobile menu', () => {
    renderNavigation();

    const toggle = screen.getByRole('button', { name: 'Open menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('points "Book online" at the external booking portal', () => {
    renderNavigation();

    expect(screen.getByRole('link', { name: /Book online/i })).toHaveAttribute('href', BOOKING_URL);
  });
});
