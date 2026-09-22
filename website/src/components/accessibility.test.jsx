import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';

import SmarterDogHomepage from './SmarterDogHomepage';
import Navigation from './sections/Navigation';
import FooterSection from './sections/FooterSection';
import ServiceCard from './ServiceCard';
import ErrorBoundary from './ErrorBoundary';
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
describe('Error boundary contrast', () => {
  // The fallback used to dim its copy with `opacity` on the parent <p>. Opacity
  // on a parent creates a compositing group its children cannot escape, so the
  // WhatsApp link composited to ~#7C9AC1 — 2.54:1 on the cream, well under the
  // 4.5:1 AA floor — no matter what colour the link itself was set to. Pin it:
  // de-emphasis here is size and weight, never transparency.
  function Boom() {
    throw new Error('boom');
  }

  function renderFallback() {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      return render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      );
    } finally {
      spy.mockRestore();
    }
  }

  it('renders the fallback without dimming any text with opacity', () => {
    const { container, getByText } = renderFallback();

    expect(getByText('Something went wrong')).toBeTruthy();

    const dimmed = [...container.querySelectorAll('*')].filter((el) => {
      const value = el.style?.opacity;
      return value !== undefined && value !== '' && Number(value) < 1;
    });
    expect(dimmed).toEqual([]);
  });

  it('fallback has no axe violations', async () => {
    const { container } = renderFallback();
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
