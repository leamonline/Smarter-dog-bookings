import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PolaroidImage from './PolaroidImage';
import { colors } from '../constants/colors';

describe('PolaroidImage', () => {
  it('renders caption text', () => {
    render(<PolaroidImage caption="Bella's spa day" />);
    expect(screen.getByText("Bella's spa day")).toBeInTheDocument();
  });

  it('renders image with provided src and alt', () => {
    render(<PolaroidImage src="/assets/client-dog-1.jpg" caption="Happy pup" />);

    const image = screen.getByRole('img', { name: 'Happy pup' });
    expect(image).toHaveAttribute('src', '/assets/client-dog-1.jpg');
  });

  it('applies core polaroid classes', () => {
    const { container } = render(<PolaroidImage caption="Test" />);
    const wrapper = container.firstChild;

    expect(wrapper).toHaveClass('shadow-layered');
    expect(wrapper).toHaveClass('texture-grain');
    expect(wrapper).toHaveClass('hover-lift');
    expect(wrapper).toHaveClass('hover-tilt');
  });

  it('renders tape element with transform style', () => {
    const { container } = render(<PolaroidImage caption="Test" tapeColor={colors.cyan} />);
    const tape = container.querySelector('.absolute.opacity-80.z-20');

    expect(tape).toBeInTheDocument();
    expect(tape.getAttribute('style')).toMatch(/transform:/);
  });

  it('falls back to base src image when optimized source fails', () => {
    const { container } = render(<PolaroidImage src="/assets/client-dog-1.jpg" caption="Fallback pup" />);

    const optimizedImage = screen.getByRole('img', { name: 'Fallback pup' });
    expect(container.querySelector('picture')).toBeInTheDocument();

    fireEvent.error(optimizedImage);

    const fallbackImage = screen.getByRole('img', { name: 'Fallback pup' });
    expect(container.querySelector('picture')).not.toBeInTheDocument();
    expect(fallbackImage).toHaveAttribute('src', '/assets/client-dog-1.jpg');
  });
});
