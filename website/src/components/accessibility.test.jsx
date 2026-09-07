import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';

import SmarterDogHomepage from './SmarterDogHomepage';
import Navigation from './sections/Navigation';
import FooterSection from './sections/FooterSection';
import ServiceCard from './ServiceCard';
import { colors } from '../constants/colors';

describe('Accessibility', () => {
  it('homepage has no axe violations', async () => {
    const { container } = render(
      <MemoryRouter>
        <SmarterDogHomepage />
      </MemoryRouter>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  }, 10000);

  it('navigation has no axe violations', async () => {
    const { container } = render(
      <MemoryRouter>
        <Navigation isLoaded={true} onBookClick={() => {}} />
      </MemoryRouter>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('footer has no axe violations', async () => {
    const { container } = render(
      <MemoryRouter>
        <FooterSection />
      </MemoryRouter>
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('service card has no axe violations', async () => {
    const { container } = render(
      <ServiceCard
        icon="✂️"
        title="Full Groom"
        desc="Complete grooming service"
        bgColor="white"
        accentColor={colors.pink}
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
