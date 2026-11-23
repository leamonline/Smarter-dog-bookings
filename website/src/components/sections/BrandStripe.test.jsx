import React from 'react';
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { BrandStripe } from './Navigation';
import { colors } from '../../constants/colors';

describe('BrandStripe', () => {
  it('draws the flyer stripe: nine segments, two of them double width', () => {
    const { container } = render(<BrandStripe />);
    const segments = container.querySelectorAll('[data-brand-stripe] > span');
    expect(segments).toHaveLength(9);
    const wide = [...segments].map((s, i) => (s.style.flexGrow === '2.1' ? i : null)).filter((i) => i !== null);
    expect(wide).toEqual([1, 5]);
  });

  it('colours the segments blue, yellow and navy in the flyer order', () => {
    const { container } = render(<BrandStripe />);
    const fills = [...container.querySelectorAll('[data-brand-stripe] > span')].map((s) => s.style.backgroundColor);
    const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
    const [b, y, n] = [rgb(colors.cyan), rgb(colors.yellow), rgb(colors.navy)];
    expect(fills).toEqual([b, b, y, b, n, b, b, b, y]);
  });

  it('is decoration only, hidden from assistive technology', () => {
    const { container } = render(<BrandStripe />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});
