import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ServicesSection from './ServicesSection';
import { colors } from '../../constants/colors';

describe('ServicesSection', () => {
  it('renders section heading', () => {
    render(<ServicesSection />);
    expect(screen.getByText('How we care for your dog')).toBeInTheDocument();
  });

  it('renders core service cards', () => {
    render(<ServicesSection />);

    expect(screen.getByText('Full Groom')).toBeInTheDocument();
    expect(screen.getByText('Maintenance Groom')).toBeInTheDocument();
    expect(screen.getByText('De-shedding Groom')).toBeInTheDocument();
    expect(screen.getByText('Puppy Intro')).toBeInTheDocument();
  });

  it('renders additional services', () => {
    render(<ServicesSection />);

    expect(screen.getByText('Ear Cleaning')).toBeInTheDocument();
    expect(screen.getByText('Anal Gland Expression')).toBeInTheDocument();
    expect(screen.getByText('Nail Clipping')).toBeInTheDocument();
  });

  it('uses brand pink background on main section', () => {
    const { container } = render(<ServicesSection />);
    const section = container.querySelector('section');
    expect(section).toHaveStyle({ backgroundColor: colors.pink });
  });
});
