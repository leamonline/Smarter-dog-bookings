// Brand Colors — Smarter Dog Colour System
// Rule: Colour communicates emotion. Emotion must follow intention.

export const colors = {
    // === ANCHORS (Typography & Foundations) ===
    plum: '#1F1F1F',        // Charcoal ink; the key name predates the 2026 reskin (#896)
    teal: '#2A6F6B',        // Primary text on light backgrounds
    offWhite: '#F7EFE6',    // Cream paper
    warmBeige: '#FDFBF7',

    // === CALM (Trust, Safety, Reviews) ===
    // Use for: Hero, Stats, Reviews, Footer
    cyan: '#5595DC',        // Primary calm colour — surfaces, tape and strokes only (3.1:1 as text)
    cyanText: '#2A62A8',    // The same blue for type and links: 6.2:1 on white, 5.4:1 on offWhite

    // === ACTION (CTAs Only — never decorative) ===
    // If it's this colour, it must do something
    green: '#00D94A',       // Primary action button
    yellow: '#FFCC00',      // Secondary action / accents

    // === JOY (Personality, Warmth) ===
    // Never stacked back-to-back. Joy must be brief to feel special.
    pink: '#E8506A',        // Services, CTA sections (softened ~15% for warmth over urgency)
    orange: '#FF6B00',      // Highlight accents only

    // === CARE (Natural, Gentle — Houndsly) ===
    // Never used in urgent CTAs. Signals care, not urgency.
    mutedGreen: '#7AB8A8',  // Houndsly, sustainability

    // === UTILITY (Backgrounds & Text) ===
    blueSlate: '#4A6FA5',   // Timeline section background
    darkGray: '#4A4A4A',    // Price text

    // === TINTS (Cards & elements only) ===
    cyanLight: '#E0EFFF',
    greenLight: '#E3FCE8',
    tealLight: '#E8F5F5',
    pinkLight: '#FFE3EB',
    yellowLight: '#FFF9DB',
};
