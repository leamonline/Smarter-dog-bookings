import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GoogleReviews from './GoogleReviews';

describe('GoogleReviews', () => {
  it('renders rating summary', () => {
    render(<GoogleReviews />);

    expect(screen.getByText('★★★★★')).toBeInTheDocument();
    expect(screen.getByText(/4.9 on Google/i)).toBeInTheDocument();
  });

  it('renders featured and supporting review authors', () => {
    render(<GoogleReviews />);

    expect(screen.getByText('Sandra W.')).toBeInTheDocument();
    expect(screen.getByText('Wallis')).toBeInTheDocument();
    expect(screen.getByText('Lindsay C.')).toBeInTheDocument();
    expect(screen.getByText('K.G.')).toBeInTheDocument();
    expect(screen.getByText('Kate M.')).toBeInTheDocument();
  });

  it('links to Google reviews', () => {
    render(<GoogleReviews />);

    const link = screen.getByRole('link', { name: /See all reviews on Google/i });
    expect(link).toHaveAttribute('href', 'https://g.page/r/CQJp3bxjrSfmEAE/review');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
