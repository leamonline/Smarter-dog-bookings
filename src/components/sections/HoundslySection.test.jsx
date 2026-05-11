import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import HoundslySection from './HoundslySection';

describe('HoundslySection', () => {
  it('renders core heading copy', () => {
    render(<HoundslySection />);

    expect(screen.getByText('Handmade with love')).toBeInTheDocument();
    expect(screen.getByText('Made for sensitive skin')).toBeInTheDocument();
  });

  it('renders brand and product visuals', () => {
    render(<HoundslySection />);

    expect(screen.getByAltText('Houndsly Pet Products')).toBeInTheDocument();
    expect(screen.getByText('Houndsly Natural Shampoo')).toBeInTheDocument();
    expect(screen.getByText('Drynamite Dry Shampoo')).toBeInTheDocument();
  });

  it('renders badges and shop CTA', () => {
    render(<HoundslySection />);

    expect(screen.getByText('Vegan')).toBeInTheDocument();
    expect(screen.getByText('Small Batch')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /Shop Houndsly/i });
    expect(link).toHaveAttribute('href', 'https://houndsly.co.uk');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
