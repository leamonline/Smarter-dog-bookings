import { describe, it, expect } from 'vitest';
import { whatsAppUrl, toWhatsAppDigits, SALON_FACTS_FALLBACK } from './salonFacts';

describe('toWhatsAppDigits / whatsAppUrl', () => {
    it('converts a UK national number (as typed into Settings) to international', () => {
        expect(toWhatsAppDigits('07873329440')).toBe('447873329440');
        expect(toWhatsAppDigits('07873 329440')).toBe('447873329440');
        expect(whatsAppUrl('07873329440')).toBe('https://wa.me/447873329440');
    });

    it('leaves an already-international number unchanged', () => {
        expect(toWhatsAppDigits('+447873329440')).toBe('447873329440');
        expect(whatsAppUrl('+447873329440')).toBe('https://wa.me/447873329440');
    });

    it('handles the fallback constant correctly', () => {
        expect(whatsAppUrl(SALON_FACTS_FALLBACK.businessPhone)).toBe('https://wa.me/447873329440');
    });

    it('returns an empty digits string for a missing/blank number', () => {
        expect(toWhatsAppDigits('')).toBe('');
        expect(toWhatsAppDigits(null)).toBe('');
    });
});
