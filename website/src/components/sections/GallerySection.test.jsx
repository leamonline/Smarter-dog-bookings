import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import GallerySection from './GallerySection';
import { colors } from '../../constants/colors';

vi.mock('../PolaroidImage', () => ({
  default: ({ src }) => <div data-testid="polaroid-image">{src}</div>,
}));

describe('GallerySection', () => {
  it('renders section heading', () => {
    render(<GallerySection />);
    expect(screen.getByText('Strike a pose, wet nose.')).toBeInTheDocument();
  });

  it('renders gallery photos through polaroid components', () => {
    render(<GallerySection />);
    expect(screen.getAllByTestId('polaroid-image').length).toBeGreaterThanOrEqual(7);
  });

  it('uses brand yellow section background', () => {
    const { container } = render(<GallerySection />);
    const section = container.querySelector('section');
    expect(section).toHaveStyle({ backgroundColor: colors.yellow });
  });
});
