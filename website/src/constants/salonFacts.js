// Fallback values match what's live on the site today. Used immediately on
// render and kept if the Supabase fetch fails or is slow -- the marketing
// site should never look broken because of a network hiccup.
export const SALON_FACTS_FALLBACK = {
    businessName: 'Smarter Dog Grooming Salon',
    businessPhone: '+447873329440', // WhatsApp-only -- always render as a wa.me link, never tel:
    businessEmail: 'bookings@smarterdog.co.uk',
    businessAddress: '183 Kings Road, Ashton-under-Lyne, OL6 8HD',
    businessHours: {
        Monday: { open: '08:30', close: '15:00', closed: false },
        Tuesday: { open: '08:30', close: '15:00', closed: false },
        Wednesday: { open: '08:30', close: '15:00', closed: false },
        Thursday: { open: '', close: '', closed: true },
        Friday: { open: '', close: '', closed: true },
        Saturday: { open: '', close: '', closed: true },
        Sunday: { open: '', close: '', closed: true },
    },
    closures: [],
};

// Normalises to the international format wa.me requires. Handles both a
// UK national number as typed into the Settings form (e.g. "07873 329440")
// and an already-international one (e.g. "+447873329440") -- the owner's
// free-text entry isn't guaranteed to be in either form specifically.
export const toWhatsAppDigits = (phone) => {
    const digits = String(phone || '').replace(/[^0-9]/g, '');
    return digits.startsWith('0') ? `44${digits.slice(1)}` : digits;
};

export const whatsAppUrl = (phone) => `https://wa.me/${toWhatsAppDigits(phone)}`;
