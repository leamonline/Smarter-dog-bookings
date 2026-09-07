import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import DogSilhouette from './DogSilhouette';
import { colors } from '../constants/colors';

describe('DogSilhouette', () => {
  it('renders an SVG element', () => {
    const { container } = render(<DogSilhouette />);
    const svg = container.querySelector('svg');

    expect(svg).toBeInTheDocument();
  });

  it('has correct viewBox attribute', () => {
    const { container } = render(<DogSilhouette />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('viewBox', '0 0 923 1057');
  });

  it('has xmlns attribute', () => {
    const { container } = render(<DogSilhouette />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('xmlns', 'http://www.w3.org/2000/svg');
  });

  it('uses currentColor as default fill', () => {
    const { container } = render(<DogSilhouette />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('fill', 'currentColor');
  });

  it('applies custom color when provided', () => {
    const { container } = render(<DogSilhouette color={colors.yellow} />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('fill', colors.yellow);
  });

  it('applies different custom color', () => {
    const { container } = render(<DogSilhouette color="white" />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('fill', 'white');
  });

  it('applies custom className when provided', () => {
    const { container } = render(<DogSilhouette className="w-96 h-auto rotate-12" />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveClass('w-96');
    expect(svg).toHaveClass('h-auto');
    expect(svg).toHaveClass('rotate-12');
  });

  it('has empty className by default', () => {
    const { container } = render(<DogSilhouette />);
    const svg = container.querySelector('svg');

    expect(svg.className.baseVal).toBe('');
  });

  it('applies custom style object when provided', () => {
    const customStyle = { opacity: 0.5, transform: 'scale(1.2)' };
    const { container } = render(<DogSilhouette style={customStyle} />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveStyle({ opacity: '0.5' });
    expect(svg).toHaveStyle({ transform: 'scale(1.2)' });
  });

  it('has empty style object by default', () => {
    const { container } = render(<DogSilhouette />);
    const svg = container.querySelector('svg');

    // Should have no inline styles beyond what's set by fill
    expect(svg.style.length).toBeLessThanOrEqual(1);
  });

  it('contains a path element for the dog shape', () => {
    const { container } = render(<DogSilhouette />);
    const path = container.querySelector('path');

    expect(path).toBeInTheDocument();
  });

  it('path has the correct dog silhouette coordinates', () => {
    const { container } = render(<DogSilhouette />);
    const path = container.querySelector('path');

    expect(path).toHaveAttribute('d');
    expect(path.getAttribute('d')).toContain('M 40,22');
    expect(path.getAttribute('d')).toContain('L 177,17');
  });

  it('combines multiple props correctly', () => {
    const { container } = render(
      <DogSilhouette
        color={colors.pink}
        className="w-[30rem] h-auto -scale-x-100 rotate-[-10deg]"
        style={{ opacity: 0.1 }}
      />
    );
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('fill', colors.pink);
    expect(svg).toHaveClass('w-[30rem]');
    expect(svg).toHaveClass('h-auto');
    expect(svg).toHaveClass('-scale-x-100');
    expect(svg).toHaveClass('rotate-[-10deg]');
    expect(svg).toHaveStyle({ opacity: '0.1' });
  });

  it('supports hex color values', () => {
    const { container } = render(<DogSilhouette color="#FF5733" />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('fill', '#FF5733');
  });

  it('supports color names', () => {
    const { container } = render(<DogSilhouette color="white" />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('fill', 'white');
  });

  it('supports color constants from colors.js', () => {
    const { container } = render(<DogSilhouette color={colors.cyan} />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('fill', colors.cyan);
  });
});
