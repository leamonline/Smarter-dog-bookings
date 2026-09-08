import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServiceCard from './ServiceCard';
import { colors } from '../constants/colors';

describe('ServiceCard', () => {
  const defaultProps = {
    icon: '✂️',
    title: 'Full Groom',
    desc: 'Complete grooming service',
    bgColor: 'white',
    accentColor: colors.pink,
  };

  it('renders with all required props', () => {
    render(<ServiceCard {...defaultProps} />);

    expect(screen.getByText('✂️')).toBeInTheDocument();
    expect(screen.getByText('Full Groom')).toBeInTheDocument();
    expect(screen.getByText('Complete grooming service')).toBeInTheDocument();
  });

  it('applies correct background color via inline style', () => {
    const { container } = render(<ServiceCard {...defaultProps} />);
    const card = container.firstChild;

    expect(card).toHaveAttribute('style');
    expect(card.style.backgroundColor).toBe('white');
  });

  it('applies correct accent color to decorative circle', () => {
    const { container } = render(<ServiceCard {...defaultProps} />);
    const decorativeCircle = container.querySelector('.absolute.-top-10.-right-10');

    expect(decorativeCircle).toBeInTheDocument();
    expect(decorativeCircle).toHaveStyle({ backgroundColor: colors.pink });
  });

  it('displays icon in white background container', () => {
    const { container } = render(<ServiceCard {...defaultProps} />);
    const iconContainer = container.querySelector('.w-24.h-24.rounded-2xl');

    expect(iconContainer).toBeInTheDocument();
    expect(iconContainer.style.backgroundColor).toBe('white');
    expect(iconContainer).toHaveTextContent('✂️');
  });

  it('applies teal color to title from colors constants', () => {
    render(<ServiceCard {...defaultProps} />);
    const title = screen.getByText('Full Groom');

    expect(title).toHaveStyle({ color: colors.teal });
  });

  it('applies teal color to description from colors constants', () => {
    render(<ServiceCard {...defaultProps} />);
    const description = screen.getByText('Complete grooming service');

    expect(description).toHaveStyle({ color: colors.teal });
  });

  it('has hover transition classes', () => {
    const { container } = render(<ServiceCard {...defaultProps} />);
    const card = container.firstChild;

    expect(card).toHaveClass('transition-all');
    expect(card).toHaveClass('duration-300');
    expect(card).toHaveClass('hover:shadow-xl');
    expect(card).toHaveClass('hover:-translate-y-2');
  });

  it('has rounded corners with correct radius', () => {
    const { container } = render(<ServiceCard {...defaultProps} />);
    const card = container.firstChild;

    expect(card).toHaveClass('rounded-3xl');
  });

  it('has proper padding', () => {
    const { container } = render(<ServiceCard {...defaultProps} />);
    const card = container.firstChild;

    expect(card).toHaveClass('p-8');
  });

  it('renders with custom background color', () => {
    const customProps = { ...defaultProps, bgColor: colors.yellowLight };
    const { container } = render(<ServiceCard {...customProps} />);
    const card = container.firstChild;

    expect(card).toHaveStyle({ backgroundColor: colors.yellowLight });
  });

  it('renders with custom accent color', () => {
    const customProps = { ...defaultProps, accentColor: colors.cyan };
    const { container } = render(<ServiceCard {...customProps} />);
    const decorativeCircle = container.querySelector('.absolute.-top-10.-right-10');

    expect(decorativeCircle).toHaveStyle({ backgroundColor: colors.cyan });
  });

  it('renders with different icon', () => {
    const customProps = { ...defaultProps, icon: '🛁' };
    render(<ServiceCard {...customProps} />);

    expect(screen.getByText('🛁')).toBeInTheDocument();
  });

  it('has relative positioning for overflow context', () => {
    const { container } = render(<ServiceCard {...defaultProps} />);
    const card = container.firstChild;

    expect(card).toHaveClass('relative');
    expect(card).toHaveClass('overflow-hidden');
  });

  it('decorative circle has correct opacity', () => {
    const { container } = render(<ServiceCard {...defaultProps} />);
    const decorativeCircle = container.querySelector('.absolute.-top-10.-right-10');

    expect(decorativeCircle).toHaveClass('opacity-20');
  });

  it('icon container has z-index for layering', () => {
    const { container } = render(<ServiceCard {...defaultProps} />);
    const iconContainer = container.querySelector('.w-24.h-24.rounded-2xl');

    expect(iconContainer).toHaveClass('z-10');
  });

  it('title has z-index for layering', () => {
    render(<ServiceCard {...defaultProps} />);
    const title = screen.getByText('Full Groom');

    expect(title).toHaveClass('z-10');
  });

  it('description has z-index for layering', () => {
    render(<ServiceCard {...defaultProps} />);
    const description = screen.getByText('Complete grooming service');

    expect(description).toHaveClass('z-10');
  });
});
