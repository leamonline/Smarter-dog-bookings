// Brand Colors — Smarter Dog Colour System
//
// The salon's printed flyer: cream paper, charcoal ink, sky blue and sun yellow.
// The same values as the booking app (docs/ux/design-system.md and
// docs/plans/active/2026-11-22-flyer-visual-language.md). Coral, teal, green,
// orange, muted green and blue slate were retired in November 2026.
// Contrast figures are WCAG ratios; body text needs 4.5:1, large text 3:1.

export const colors = {
    // === INK & PAPER ===
    plum: '#1F1F1F',        // Charcoal ink; backwards-compatible name, not actual purple. 16.5:1 on white
    inkMuted: '#57677C',    // The booking app's muted text: 5.8:1 on white, 5.1:1 on offWhite, 5.2:1 on cyanLight
    offWhite: '#F7EFE6',    // Cream paper
    warmBeige: '#FDFBF7',

    // === BLUES ===
    cyan: '#5595DC',        // Flyer sky blue: the hero band, tape, decoration. Charcoal text on it 5.3:1; never small white text (3.1:1)
    cyanText: '#2A62A8',    // Brand blue for type and links: 6.2:1 on white, 5.4:1 on offWhite
    blueBand: '#2A62A8',    // The same brand blue as a full-width band carrying white text (6.2:1): services and the closing CTA
    navy: '#1F4E8C',        // Flyer stripe accent and deep surfaces: white on navy 8.3:1

    // === ACTION ===
    // If it's this colour, it must do something
    yellow: '#FECC13',      // Lead booking actions, the swash and the stripe. Charcoal on yellow 10.9:1
    whatsapp: '#25D366',    // WhatsApp's own green, only on WhatsApp links (with charcoal text)

    // === UTILITY ===
    darkGray: '#4A4A4A',    // Price text

    // === TINTS (cards, bands and chips) ===
    cyanLight: '#EAF4FF',   // Sky tint: the booking app's selected fill, and the Houndsly band
    yellowLight: '#FFF9DB',
};
