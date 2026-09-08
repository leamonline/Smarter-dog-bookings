// Shared validation helpers for booking forms

/**
 * Validate UK phone numbers (accepts various formats)
 * @param {string} phone
 * @returns {boolean}
 */
export const validatePhone = (phone) => {
    const phoneRegex = /^(?:(?:\+44)|(?:0))?\s*[1-9]\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
};

/**
 * Validate email address (optional field — empty is valid)
 * @param {string} email
 * @returns {boolean}
 */
export const validateEmail = (email) => {
    if (!email) return true;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};
