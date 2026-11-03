import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HoundslySection from './HoundslySection';

const renderSection = () => render(
  <MemoryRouter>
    <HoundslySection />
  </MemoryRouter>,
);

describe('HoundslySection', () => {
  it('renders core heading copy', () => {
    renderSection();

    expect(screen.getByText('Handmade with love')).toBeInTheDocument();
    expect(screen.getByText('Made for sensitive skin')).toBeInTheDocument();
  });

  it('renders brand and product visuals', () => {
    renderSection();

    expect(screen.getByAltText('Houndsly Pet Products')).toBeInTheDocument();
    expect(screen.getByText('Houndsly Natural Shampoo')).toBeInTheDocument();
    expect(screen.getByText('Drynamite Dry Shampoo')).toBeInTheDocument();
  });

  it('renders badges and shop CTA', () => {
    renderSection();

    expect(screen.getByText('Vegan')).toBeInTheDocument();
    expect(screen.getByText('Small Batch')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /Shop Houndsly/i });
    expect(link).toHaveAttribute('href', 'https://houndsly.co.uk');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
