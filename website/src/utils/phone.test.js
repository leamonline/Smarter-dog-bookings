import { describe, it, expect } from 'vitest';
import { normalisePhoneLocalUK, normalisePhoneE164UK } from './phone';

describe('normalisePhoneLocalUK', () => {
    it.each([
        ['07507 731487', '07507731487'],
        ['07507-731-487', '07507731487'],
        ['07507.731.487', '07507731487'],
        ['(07507) 731 487', '07507731487'],
        ['+44 7507 731487', '07507731487'],
        ['+447507731487', '07507731487'],
        ['447507731487', '07507731487'],
        ['0044 7507 731487', '07507731487'],
        ['00447507731487', '07507731487'],
        ['  07507 731 487  ', '07507731487'],
    ])('normalises %s -> %s', (input, expected) => {
        expect(normalisePhoneLocalUK(input)).toBe(expected);
    });

    it('handles empty / nullish input', () => {
        expect(normalisePhoneLocalUK('')).toBe('');
        expect(normalisePhoneLocalUK(null)).toBe('');
        expect(normalisePhoneLocalUK(undefined)).toBe('');
    });
});

describe('normalisePhoneE164UK', () => {
    it('returns +44 form for valid UK mobiles', () => {
        expect(normalisePhoneE164UK('07507 731487')).toBe('+447507731487');
        expect(normalisePhoneE164UK('+447507731487')).toBe('+447507731487');
        expect(normalisePhoneE164UK('0044 7507 731487')).toBe('+447507731487');
    });

    it('returns null for nonsense input', () => {
        expect(normalisePhoneE164UK('')).toBeNull();
        expect(normalisePhoneE164UK('hello')).toBeNull();
        expect(normalisePhoneE164UK('07')).toBeNull();
    });
});
