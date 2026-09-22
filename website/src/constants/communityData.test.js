import { describe, it, expect } from 'vitest';
import { communityCategories } from './communityData';
import { colors } from './colors';

/**
 * A category's `color` is passed to ListingCard as `accentColor` and used for
 * exactly one thing: the 14px "Visit website" link on a white card. That makes
 * it a text colour, whatever the field is called, so a decorative brand value
 * put here fails WCAG AA silently.
 */

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const channel = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (h) => {
  const [r, g, b] = hex(h).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('community listing link colours', () => {
  it('never routes the surface blue to link text', () => {
    // `cyan` is the hero/tape blue: 3.13:1 as text on white. Its text-safe
    // counterpart `cyanText` is the same hue at 6.16:1. Swapping one for the
    // other here is an accessibility regression that nothing else catches.
    const usingSurfaceBlue = communityCategories.filter((c) => c.color === colors.cyan);
    expect(usingSurfaceBlue).toEqual([]);
  });

  it('gives the dog walks links a colour that clears AA on white', () => {
    const walks = communityCategories.find((c) => c.id === 'dog-walks');
    expect(walks.color).toBe(colors.cyanText);
    expect(contrast(walks.color, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('computes a known ratio correctly, so the helper above is trustworthy', () => {
    // Black on white is 21:1 exactly; white on white is 1:1.
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
  });
});
