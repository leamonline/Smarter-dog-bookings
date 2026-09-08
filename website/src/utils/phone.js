// Phone normalisation helpers for UK numbers.
// Mirrors the regex used by humans.phone_normalised and link_or_create_customer_human.
// The DB always re-normalises independently — these helpers exist for UI display
// and for building the E.164 string Supabase Auth's signInWithOtp requires.

const stripNoise = (input) => String(input ?? '').replace(/[^0-9+]/g, '');

/**
 * Canonical local form, e.g. "07507731487". Matches the DB's phone_normalised column.
 * @param {string} input
 * @returns {string}
 */
export const normalisePhoneLocalUK = (input) => {
    const stripped = stripNoise(input);
    return stripped.replace(/^(\+?44|0044)/, '0');
};

/**
 * E.164 form for Supabase Auth, e.g. "+447507731487".
 * Returns null when the input does not look like a UK mobile/landline.
 * @param {string} input
 * @returns {string | null}
 */
export const normalisePhoneE164UK = (input) => {
    const local = normalisePhoneLocalUK(input);
    if (!local) return null;
    if (!/^0\d{9,10}$/.test(local)) return null;
    return `+44${local.slice(1)}`;
};
