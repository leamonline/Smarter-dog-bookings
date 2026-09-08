import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TestimonialsSection from './TestimonialsSection';
import { colors } from '../../constants/colors';

describe('TestimonialsSection', () => {
  it('renders title and intro copy', () => {
    render(<TestimonialsSection />);

    expect(screen.getByText(/Dogs who wouldn't go anywhere else/i)).toBeInTheDocument();
    expect(screen.getByText(/Real words from long-time regulars/i)).toBeInTheDocument();
  });

  it('renders embedded review content', () => {
    render(<TestimonialsSection />);

    expect(screen.getByText('Sandra W.')).toBeInTheDocument();
    expect(screen.getByText('Wallis')).toBeInTheDocument();
  });

  it('renders transition svg to CTA section', () => {
    const { container } = render(<TestimonialsSection />);
    const path = container.querySelector('svg[viewBox="0 0 1440 100"] path');
    expect(path).toHaveAttribute('fill', colors.pink);
  });
});
