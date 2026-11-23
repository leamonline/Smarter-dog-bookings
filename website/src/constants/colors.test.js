import { describe, it, expect } from 'vitest';
import { colors } from './colors';

// The website uses the salon flyer's palette, the same values as the booking
// app (docs/plans/active/2026-11-22-flyer-visual-language.md). These tests pin
// the values, keep the retired colours out, and keep every contrast figure
// quoted in colors.js true.

const channel = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const WHITE = '#FFFFFF';

describe('colors constants', () => {
  it('pins the flyer palette', () => {
    expect(colors).toEqual({
      plum: '#1F1F1F',
      inkMuted: '#57677C',
      offWhite: '#F7EFE6',
      warmBeige: '#FDFBF7',
      cyan: '#5595DC',
      cyanText: '#2A62A8',
      blueBand: '#2A62A8',
      navy: '#1F4E8C',
      yellow: '#FECC13',
      whatsapp: '#25D366',
      darkGray: '#4A4A4A',
      cyanLight: '#EAF4FF',
      yellowLight: '#FFF9DB',
    });
  });

  it('matches the booking app values for ink, paper, blues, yellow and muted text', () => {
    // src/index.css in the booking app: --color-brand-ink, --color-brand-paper,
    // --color-brand-cyan(-light/-dark), --color-brand-yellow, --color-sd-sky-tint
    // and --color-text-muted. Change them together or not at all.
    expect([colors.plum, colors.offWhite, colors.cyanText, colors.cyan, colors.navy, colors.yellow, colors.cyanLight, colors.inkMuted])
      .toEqual(['#1F1F1F', '#F7EFE6', '#2A62A8', '#5595DC', '#1F4E8C', '#FECC13', '#EAF4FF', '#57677C']);
  });

  it('keeps the retired colours out', () => {
    for (const name of ['teal', 'pink', 'orange', 'green', 'mutedGreen', 'blueSlate', 'pinkLight', 'greenLight', 'tealLight']) {
      expect(colors, `${name} was retired in November 2026`).not.toHaveProperty(name);
    }
    const retired = ['#E7546C', '#E8506A', '#2A6F6B', '#2D8B7A', '#00D94A', '#FF6B00', '#7AB8A8', '#4A6FA5'];
    for (const value of Object.values(colors)) expect(retired).not.toContain(value.toUpperCase());
  });

  it('uses uppercase six-digit hex values throughout', () => {
    for (const value of Object.values(colors)) expect(value).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('gives each value one name, apart from the declared alias', () => {
    // blueBand is cyanText under its surface role, so a band and a link can be
    // told apart in the markup. Any other repeat is a mistake.
    const aliases = { blueBand: 'cyanText' };
    for (const [alias, canonical] of Object.entries(aliases)) expect(colors[alias]).toBe(colors[canonical]);
    const values = Object.entries(colors).filter(([name]) => !(name in aliases)).map(([, v]) => v);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe('published contrast ratios', () => {
  // [foreground, background, ratio quoted in colors.js]. A retuned colour fails
  // here until its comment is corrected too.
  it.each([
    ['plum on white', colors.plum, WHITE, 16.5],
    ['plum on yellow', colors.plum, colors.yellow, 10.9],
    ['plum on sky blue', colors.plum, colors.cyan, 5.3],
    ['inkMuted on white', colors.inkMuted, WHITE, 5.8],
    ['inkMuted on offWhite', colors.inkMuted, colors.offWhite, 5.1],
    ['inkMuted on cyanLight', colors.inkMuted, colors.cyanLight, 5.2],
    ['cyanText on white', colors.cyanText, WHITE, 6.2],
    ['cyanText on offWhite', colors.cyanText, colors.offWhite, 5.4],
    ['white on blueBand', WHITE, colors.blueBand, 6.2],
    ['white on navy', WHITE, colors.navy, 8.3],
    ['white on sky blue (large text only)', WHITE, colors.cyan, 3.1],
  ])('%s', (_label, fg, bg, quoted) => {
    expect(contrast(fg, bg)).toBeCloseTo(quoted, 1);
  });

  it('keeps every text pairing the site relies on at AA for body text', () => {
    const bodyPairs = [
      [colors.plum, colors.whatsapp],
      [colors.cyanText, colors.cyanLight],
      [colors.plum, colors.yellowLight],
      [colors.cyanText, colors.yellowLight],
    ];
    for (const [fg, bg] of bodyPairs) expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it('computes a known ratio correctly, so the figures above are trustworthy', () => {
    expect(contrast('#000000', WHITE)).toBeCloseTo(21, 1);
  });
});
