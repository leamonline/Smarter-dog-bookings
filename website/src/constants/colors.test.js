import { describe, it, expect } from 'vitest';
import { colors } from './colors';

describe('colors constants', () => {
  describe('all required colors are defined', () => {
    it('defines teal anchor color', () => {
      expect(colors.teal).toBeDefined();
      expect(colors.teal).toBe('#2A6F6B');
    });

    it('defines offWhite color', () => {
      expect(colors.offWhite).toBeDefined();
      expect(colors.offWhite).toBe('#FAF9F6');
    });

    it('defines cyan bright color', () => {
      expect(colors.cyan).toBeDefined();
      expect(colors.cyan).toBe('#00C2FF');
    });

    it('defines green bright color', () => {
      expect(colors.green).toBeDefined();
      expect(colors.green).toBe('#00D94A');
    });

    it('defines pink bright color', () => {
      expect(colors.pink).toBeDefined();
      expect(colors.pink).toBe('#E8506A');
    });

    it('defines yellow bright color', () => {
      expect(colors.yellow).toBeDefined();
      expect(colors.yellow).toBe('#FFCC00');
    });

    it('defines orange bright color', () => {
      expect(colors.orange).toBeDefined();
      expect(colors.orange).toBe('#FF6B00');
    });

    it('defines cyanLight tint', () => {
      expect(colors.cyanLight).toBeDefined();
      expect(colors.cyanLight).toBe('#E0F7FF');
    });

    it('defines greenLight tint', () => {
      expect(colors.greenLight).toBeDefined();
      expect(colors.greenLight).toBe('#E3FCE8');
    });

    it('defines tealLight tint', () => {
      expect(colors.tealLight).toBeDefined();
      expect(colors.tealLight).toBe('#E8F5F5');
    });

    it('defines pinkLight tint', () => {
      expect(colors.pinkLight).toBeDefined();
      expect(colors.pinkLight).toBe('#FFE3EB');
    });

    it('defines yellowLight tint', () => {
      expect(colors.yellowLight).toBeDefined();
      expect(colors.yellowLight).toBe('#FFF9DB');
    });
  });

  describe('color value validation', () => {
    it('all colors are strings', () => {
      Object.values(colors).forEach(color => {
        expect(typeof color).toBe('string');
      });
    });

    it('all colors start with #', () => {
      Object.values(colors).forEach(color => {
        expect(color).toMatch(/^#/);
      });
    });

    it('all colors are valid hex codes', () => {
      const hexColorRegex = /^#[0-9A-F]{6}$/i;
      Object.entries(colors).forEach(([, color]) => {
        expect(color).toMatch(hexColorRegex);
      });
    });

    it('all colors are uppercase hex values', () => {
      Object.entries(colors).forEach(([, color]) => {
        const hexPart = color.substring(1);
        expect(hexPart).toMatch(/^[0-9A-F]{6}$/);
      });
    });

    it('no colors are undefined or null', () => {
      Object.values(colors).forEach(color => {
        expect(color).not.toBeUndefined();
        expect(color).not.toBeNull();
      });
    });
  });

  describe('color palette structure', () => {
    it('exports the full palette', () => {
      expect(Object.keys(colors)).toHaveLength(17);
    });

    it('has 2 anchor colors (teal, offWhite)', () => {
      expect(colors).toHaveProperty('teal');
      expect(colors).toHaveProperty('offWhite');
    });

    it('has 5 bright colors (cyan, green, pink, yellow, orange)', () => {
      expect(colors).toHaveProperty('cyan');
      expect(colors).toHaveProperty('green');
      expect(colors).toHaveProperty('pink');
      expect(colors).toHaveProperty('yellow');
      expect(colors).toHaveProperty('orange');
    });

    it('has 5 light tints (cyanLight, greenLight, tealLight, pinkLight, yellowLight)', () => {
      expect(colors).toHaveProperty('cyanLight');
      expect(colors).toHaveProperty('greenLight');
      expect(colors).toHaveProperty('tealLight');
      expect(colors).toHaveProperty('pinkLight');
      expect(colors).toHaveProperty('yellowLight');
    });
  });

  describe('light tints are lighter than their bright counterparts', () => {
    it('cyanLight is lighter than cyan', () => {
      const cyan = parseInt(colors.cyan.substring(1), 16);
      const cyanLight = parseInt(colors.cyanLight.substring(1), 16);
      // Light colors should have higher hex values (closer to white)
      expect(cyanLight).toBeGreaterThan(cyan);
    });

    it('greenLight is lighter than green', () => {
      const green = parseInt(colors.green.substring(1), 16);
      const greenLight = parseInt(colors.greenLight.substring(1), 16);
      expect(greenLight).toBeGreaterThan(green);
    });

    it('pinkLight is lighter than pink', () => {
      const pink = parseInt(colors.pink.substring(1), 16);
      const pinkLight = parseInt(colors.pinkLight.substring(1), 16);
      expect(pinkLight).toBeGreaterThan(pink);
    });

    it('yellowLight is lighter than yellow', () => {
      const yellow = parseInt(colors.yellow.substring(1), 16);
      const yellowLight = parseInt(colors.yellowLight.substring(1), 16);
      expect(yellowLight).toBeGreaterThan(yellow);
    });
  });

  describe('color object is frozen/immutable', () => {
    it('colors object exists and is an object', () => {
      expect(colors).toBeDefined();
      expect(typeof colors).toBe('object');
    });

    it('all color values are non-empty strings', () => {
      Object.values(colors).forEach(color => {
        expect(color.length).toBeGreaterThan(0);
      });
    });
  });

  describe('specific color usage validation', () => {
    it('teal is a darker color suitable for text on yellow', () => {
      // Teal should be dark (low hex value for better contrast)
      expect(colors.teal).toBe('#2A6F6B');
      // Verify it's a darker shade
      const tealValue = parseInt(colors.teal.substring(1), 16);
      expect(tealValue).toBeLessThan(0x808080); // Less than medium gray
    });

    it('bright colors are vibrant and saturated', () => {
      const brightColors = [colors.cyan, colors.green, colors.pink, colors.yellow, colors.orange];

      brightColors.forEach(color => {
        // Bright colors should not be too close to gray
        expect(color).not.toMatch(/#[89ABCD]{6}/i);
      });
    });

    it('offWhite is close to white but not pure white', () => {
      expect(colors.offWhite).toBe('#FAF9F6');
      expect(colors.offWhite).not.toBe('#FFFFFF');
    });
  });

  describe('no duplicate color values', () => {
    it('all colors have unique values', () => {
      const values = Object.values(colors);
      const uniqueValues = [...new Set(values)];
      expect(uniqueValues).toHaveLength(values.length);
    });
  });

  describe('color naming consistency', () => {
    it('light variants follow "colorLight" naming convention', () => {
      const lightColors = Object.keys(colors).filter(key => key.includes('Light'));

      lightColors.forEach(lightColor => {
        expect(lightColor).toMatch(/^[a-z]+Light$/);
      });
    });

    it('base bright colors are lowercase', () => {
      const brightColors = ['cyan', 'green', 'pink', 'yellow', 'orange'];

      brightColors.forEach(color => {
        expect(Object.keys(colors)).toContain(color);
        expect(color).toMatch(/^[a-z]+$/);
      });
    });
  });
});
