import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import SmarterDogHomepage from './SmarterDogHomepage';

// Mock child components to isolate testing
vi.mock('./sections/AnnouncementBar', () => ({
  default: () => <div data-testid="announcement-bar">AnnouncementBar</div>
}));
vi.mock('./sections/Navigation', () => ({
  default: ({ isLoaded }) => <div data-testid="navigation">Navigation {isLoaded ? 'loaded' : 'loading'}</div>
}));
vi.mock('./sections/HeroSection', () => ({
  default: ({ isLoaded }) => <div data-testid="hero-section">HeroSection {isLoaded ? 'loaded' : 'loading'}</div>
}));
vi.mock('./sections/TrustSection', () => ({
  default: () => <div data-testid="trust-section">TrustSection</div>
}));
vi.mock('./sections/ServicesSection', () => ({
  default: () => <div data-testid="services-section">ServicesSection</div>
}));
vi.mock('./sections/AftercareGuidesSection', () => ({
  default: () => <div data-testid="aftercare-guides-section">AftercareGuidesSection</div>
}));
vi.mock('./sections/GallerySection', () => ({
  default: () => <div data-testid="gallery-section">GallerySection</div>
}));
vi.mock('./sections/TestimonialsSection', () => ({
  default: () => <div data-testid="testimonials-section">TestimonialsSection</div>
}));
vi.mock('./sections/HoundslySection', () => ({
  default: () => <div data-testid="houndsly-section">HoundslySection</div>
}));
vi.mock('./sections/CTASection', () => ({
  default: () => <div data-testid="cta-section">CTASection</div>
}));
vi.mock('./sections/LocationCredibilitySection', () => ({
  default: () => <div data-testid="location-credibility-section">LocationCredibilitySection</div>
}));
vi.mock('./sections/FooterSection', () => ({
  default: () => <div data-testid="footer-section">FooterSection</div>
}));
vi.mock('./SectionDivider', () => ({
  default: () => <div data-testid="section-divider">SectionDivider</div>
}));
vi.mock('./ScrollToTop', () => ({
  default: () => null
}));
vi.mock('../utils/analytics', () => ({
  trackEvent: vi.fn(),
}));

describe('SmarterDogHomepage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('component rendering', () => {
    it('renders without crashing', () => {
      render(<SmarterDogHomepage />);
    });

    it('renders all section components', () => {
      render(<SmarterDogHomepage />);

      expect(screen.getByTestId('navigation')).toBeInTheDocument();
      expect(screen.getByTestId('hero-section')).toBeInTheDocument();
      expect(screen.getByTestId('trust-section')).toBeInTheDocument();
      expect(screen.getByTestId('services-section')).toBeInTheDocument();
      expect(screen.getByTestId('aftercare-guides-section')).toBeInTheDocument();
      expect(screen.getByTestId('gallery-section')).toBeInTheDocument();
      expect(screen.getByTestId('testimonials-section')).toBeInTheDocument();
      expect(screen.getByTestId('houndsly-section')).toBeInTheDocument();
      expect(screen.getByTestId('location-credibility-section')).toBeInTheDocument();
      expect(screen.getByTestId('cta-section')).toBeInTheDocument();
      expect(screen.getByTestId('footer-section')).toBeInTheDocument();
    });

    it('renders sections in correct order', () => {
      const { container } = render(<SmarterDogHomepage />);
      const sections = Array.from(container.querySelectorAll('[data-testid]'));
      const sectionOrder = sections.map(el => el.getAttribute('data-testid'));

      expect(sectionOrder).toEqual([
        'navigation',
        'hero-section',
        'trust-section',
        'services-section',
        'aftercare-guides-section',
        'gallery-section',
        'section-divider',
        'houndsly-section',
        'testimonials-section',
        'location-credibility-section',
        'cta-section',
        'footer-section',
      ]);
    });
  });

  describe('state management', () => {
    it('passes isLoaded as true to Navigation and HeroSection', () => {
      render(<SmarterDogHomepage />);

      // isLoaded is now always true (no timer delay)
      expect(screen.getByTestId('navigation')).toHaveTextContent('loaded');
      expect(screen.getByTestId('hero-section')).toHaveTextContent('loaded');
    });
  });

  describe('integration', () => {
    it('renders complete page structure', () => {
      const { container } = render(<SmarterDogHomepage />);

      // Should have exactly one main container
      expect(container.children).toHaveLength(1);

      // Main container should have the min-h-screen class
      expect(container.firstChild).toHaveClass('min-h-screen');
    });

    it('all sections are rendered inside the main container', () => {
      const { container } = render(<SmarterDogHomepage />);
      const mainDiv = container.firstChild;
      const sections = mainDiv.querySelectorAll('[data-testid]');

      // navigation, hero, trust, services, aftercare, gallery, divider, houndsly, testimonials, location, cta, footer = 12
      expect(sections).toHaveLength(12);
    });
  });
});
