import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import emailjs from '@emailjs/browser';
import { colors } from '../constants/colors';
import { trackEvent } from '../utils/analytics';
import { validatePhone, validateEmail } from '../utils/validation';
import { useAuth } from '../hooks/useAuth';
import AuthenticatedBookingForm from './AuthenticatedBookingForm';

const TIME_SLOTS = [
    { id: 'mon-am', label: 'Monday Morning' },
    { id: 'mon-pm', label: 'Monday Afternoon' },
    { id: 'tue-am', label: 'Tuesday Morning' },
    { id: 'tue-pm', label: 'Tuesday Afternoon' },
    { id: 'wed-am', label: 'Wednesday Morning' },
    { id: 'wed-pm', label: 'Wednesday Afternoon' }
];

const VISIT_PLAN_OPTIONS = [
    { value: 'one-off', label: 'One-off visit' },
    { value: 'every-6-weeks', label: 'Every 6 weeks (recommended for curly coats)' },
    { value: 'every-8-weeks', label: 'Every 8 weeks (recommended for double coats)' }
];

const SERVICE_OPTIONS = [
    'Full Groom',
    'Maintenance Groom',
    'De-Shedding Package',
    'Puppy Intro',
];

const VALID_VISIT_PLAN_VALUES = VISIT_PLAN_OPTIONS.map((option) => option.value);
const VALID_TIME_SLOT_IDS = new Set(TIME_SLOTS.map((slot) => slot.id));

const getVisitPlanLabel = (value) => (
    VISIT_PLAN_OPTIONS.find((option) => option.value === value)?.label || VISIT_PLAN_OPTIONS[0].label
);

const INITIAL_FORM_DATA = {
    ownerName: '',
    phone: '',
    email: '',
    dogName: '',
    breed: '',
    service: 'Full Groom',
    visitPlan: 'one-off',
    preferredTimes: [],
    notes: '',
    // Honeypot field - should remain empty
    website: ''
};

const buildInitialFormState = (initialFormData = {}) => {
    const safeInitialData = initialFormData || {};
    const proposedService = safeInitialData.service;
    const proposedVisitPlan = safeInitialData.visitPlan;
    const proposedPreferredTimes = Array.isArray(safeInitialData.preferredTimes)
        ? safeInitialData.preferredTimes.filter((slot) => VALID_TIME_SLOT_IDS.has(slot))
        : [];

    return {
        ...INITIAL_FORM_DATA,
        ...safeInitialData,
        service: SERVICE_OPTIONS.includes(proposedService) ? proposedService : INITIAL_FORM_DATA.service,
        visitPlan: VALID_VISIT_PLAN_VALUES.includes(proposedVisitPlan)
            ? proposedVisitPlan
            : INITIAL_FORM_DATA.visitPlan,
        preferredTimes: proposedPreferredTimes,
    };
};

/**
 * Shared booking form component used by both BookingModal and BookingPage.
 *
 * @param {Object} props
 * @param {string} props.headingTag - HTML heading tag to use ('h1' or 'h2'), defaults to 'h2'
 * @param {string} [props.headingId] - Optional id for the heading element (for aria-labelledby)
 * @param {function} [props.onSuccess] - Called after successful submission
 * @param {function} [props.onClose] - Called when user clicks close/done (modal variant)
 * @param {boolean} [props.showAlternativeContact] - Show WhatsApp/phone alternative contact section
 * @param {'modal'|'page'} [props.variant] - Controls close/navigation behavior
 * @param {Object} [props.initialFormData] - Optional prefill values for the booking form
 * @param {string} [props.prefillSummary] - Optional summary copy to show when prefilled
 */
const AnonymousBookingForm = ({
    headingTag = 'h2',
    headingId,
    onSuccess,
    onClose,
    showAlternativeContact = false,
    variant = 'page',
    initialFormData,
    prefillSummary = '',
}) => {
    const HeadingTag = headingTag;
    const [step, setStep] = useState('form');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [fieldErrors, setFieldErrors] = useState({});
    const [formData, setFormData] = useState(() => buildInitialFormState(initialFormData));
    const [previousInitialFormData, setPreviousInitialFormData] = useState(initialFormData);
    const getFieldErrorId = (fieldName) => `${fieldName}-error`;

    if (initialFormData !== previousInitialFormData) {
        setPreviousInitialFormData(initialFormData);
        setFormData(buildInitialFormState(initialFormData));
        setFieldErrors({});
        setError(null);
        setStep('form');
    }

    const validateForm = () => {
        const errors = {};

        if (!validatePhone(formData.phone)) {
            errors.phone = 'Please enter a valid UK phone number';
        }

        if (!validateEmail(formData.email)) {
            errors.email = 'Please enter a valid email address';
        }

        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Spam check (honeypot)
        if (formData.website) {
            if (import.meta.env.DEV) console.log("Bot detected");
            return;
        }

        if (!validateForm()) {
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
            const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
            const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

            if (!serviceId || !templateId || !publicKey) {
                if (import.meta.env.DEV) {
                    console.warn('EmailJS not configured. Dev mode — simulating success.');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    throw new Error('Booking system is temporarily unavailable. Please call us directly.');
                }
            } else {
                await emailjs.send(
                    serviceId,
                    templateId,
                    {
                        to_name: "Smarter Dog Grooming",
                        from_name: formData.ownerName,
                        from_email: formData.email,
                        phone: formData.phone,
                        dog_name: formData.dogName,
                        breed: formData.breed,
                        service: formData.service,
                        visit_plan: getVisitPlanLabel(formData.visitPlan),
                        preferred_time: formData.preferredTimes.join(', '),
                        notes: formData.notes,
                        message: `New booking request for ${formData.dogName} (${formData.breed}). Service: ${formData.service}. Visit plan: ${getVisitPlanLabel(formData.visitPlan)}. Preferred times: ${formData.preferredTimes.join(', ')}. Notes: ${formData.notes}`
                    },
                    publicKey
                );
            }

            trackEvent('Conversion', 'Submit Booking Request', formData.service);
            setStep('success');
            onSuccess?.();
        } catch (err) {
            console.error('Failed to send email:', err);
            setError(err.message || 'Something went wrong. Please try again or call us directly.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        if (fieldErrors[name]) {
            setFieldErrors(prev => ({
                ...prev,
                [name]: undefined
            }));
        }
    };

    const handleCheckboxChange = (timeSlot) => {
        setFormData(prev => ({
            ...prev,
            preferredTimes: prev.preferredTimes.includes(timeSlot)
                ? prev.preferredTimes.filter(t => t !== timeSlot)
                : [...prev.preferredTimes, timeSlot]
        }));
    };

    // Success step
    if (step === 'success') {
        return (
            <div className="p-12 text-center">
                <div className="text-6xl mb-6 animate-bounce-slow">🎉</div>
                <HeadingTag
                    className="heading-font font-bold text-3xl mb-4"
                    style={{ color: colors.teal }}
                >
                    Request Received!
                </HeadingTag>
                <p className="body-font text-lg text-gray-600 mb-8">
                    Thanks {formData.ownerName}! We'll check the diary for {formData.dogName} and text you shortly to confirm a slot.
                </p>
                {variant === 'modal' && onClose ? (
                    <button
                        onClick={onClose}
                        className="px-8 py-3 rounded-full font-bold text-white transition-all hover:scale-105"
                        style={{ backgroundColor: colors.teal }}
                    >
                        Close
                    </button>
                ) : (
                    <Link
                        to="/"
                        className="inline-block px-8 py-3 rounded-full font-bold text-white transition-all hover:scale-105"
                        style={{ backgroundColor: colors.teal }}
                    >
                        Back to Home
                    </Link>
                )}
            </div>
        );
    }

    // Form step
    return (
        <div className="p-8">
            <div className="text-center mb-8">
                <span
                    className="inline-block px-4 py-2 rounded-full text-lg font-bold mb-4"
                    style={{ backgroundColor: colors.cyan + '20', color: colors.teal }}
                >
                    📅 Request Appointment
                </span>
                <HeadingTag
                    id={headingId}
                    className="heading-font font-bold text-3xl mb-2"
                    style={{ color: colors.teal }}
                >
                    Let's get you booked in!
                </HeadingTag>
                <p className="body-font text-sm text-gray-600">
                    We'll check our diary and get back to you ASAP.
                </p>
                {showAlternativeContact && (
                    <p className="body-font text-xs text-gray-500 mt-2">
                        Usually within a few hours during opening times.
                    </p>
                )}
            </div>

            {prefillSummary && (
                <div
                    className="mb-5 p-4 rounded-2xl border text-sm"
                    style={{
                        backgroundColor: colors.greenLight,
                        borderColor: colors.green,
                        color: colors.plum,
                    }}
                >
                    <p className="font-semibold mb-1">AI concierge recommendation</p>
                    <p>{prefillSummary}</p>
                </div>
            )}

            {error && (
                <div
                    className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm text-center"
                    role="alert"
                    aria-live="assertive"
                >
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                <p className="sr-only" aria-live="polite">
                    {Object.keys(fieldErrors).length > 0
                        ? 'Please check the highlighted fields before submitting.'
                        : ''}
                </p>
                {/* Honeypot Field - Hidden from users */}
                <div className="hidden" aria-hidden="true">
                    <label htmlFor="website">Website</label>
                    <input
                        type="text"
                        id="website"
                        name="website"
                        value={formData.website}
                        onChange={handleChange}
                        tabIndex="-1"
                        autoComplete="off"
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="ownerName" className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>Your Name</label>
                        <input
                            id="ownerName"
                            required
                            type="text"
                            name="ownerName"
                            value={formData.ownerName}
                            onChange={handleChange}
                            className="w-full px-4 py-3 min-h-[48px] rounded-xl border-2 border-gray-100 focus:border-cyan-400 focus:outline-none transition-colors text-base"
                            placeholder="Jane Doe"
                        />
                    </div>
                    <div>
                        <label htmlFor="phone" className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>Phone</label>
                        <input
                            id="phone"
                            required
                            type="tel"
                            name="phone"
                            value={formData.phone}
                            onChange={handleChange}
                            className={`w-full px-4 py-3 min-h-[48px] rounded-xl border-2 focus:outline-none transition-colors text-base ${fieldErrors.phone ? 'border-red-400 bg-red-50' : 'border-gray-100 focus:border-cyan-400'}`}
                            placeholder="07123..."
                            aria-invalid={Boolean(fieldErrors.phone)}
                            aria-describedby={fieldErrors.phone ? getFieldErrorId('phone') : undefined}
                        />
                        {fieldErrors.phone && (
                            <p
                                id={getFieldErrorId('phone')}
                                className="text-red-500 text-sm mt-1"
                                role="alert"
                                aria-live="assertive"
                            >
                                {fieldErrors.phone}
                            </p>
                        )}
                    </div>
                </div>

                <div>
                    <label htmlFor="email" className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>Email (Optional)</label>
                    <input
                        id="email"
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        className={`w-full px-4 py-3 min-h-[48px] rounded-xl border-2 focus:outline-none transition-colors text-base ${fieldErrors.email ? 'border-red-400 bg-red-50' : 'border-gray-100 focus:border-cyan-400'}`}
                        placeholder="jane@example.com"
                        aria-invalid={Boolean(fieldErrors.email)}
                        aria-describedby={fieldErrors.email ? getFieldErrorId('email') : undefined}
                    />
                    {fieldErrors.email && (
                        <p
                            id={getFieldErrorId('email')}
                            className="text-red-500 text-sm mt-1"
                            role="alert"
                            aria-live="assertive"
                        >
                            {fieldErrors.email}
                        </p>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="dogName" className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>Dog's Name</label>
                        <input
                            id="dogName"
                            required
                            type="text"
                            name="dogName"
                            value={formData.dogName}
                            onChange={handleChange}
                            className="w-full px-4 py-3 min-h-[48px] rounded-xl border-2 border-gray-100 focus:border-cyan-400 focus:outline-none transition-colors text-base"
                            placeholder="Barnaby"
                        />
                    </div>
                    <div>
                        <label htmlFor="breed" className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>Breed</label>
                        <input
                            id="breed"
                            type="text"
                            name="breed"
                            value={formData.breed}
                            onChange={handleChange}
                            className="w-full px-4 py-3 min-h-[48px] rounded-xl border-2 border-gray-100 focus:border-cyan-400 focus:outline-none transition-colors text-base"
                            placeholder="Cockapoo"
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="service" className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>Service Required</label>
                    <select
                        id="service"
                        name="service"
                        value={formData.service}
                        onChange={handleChange}
                        className="w-full px-4 py-3 min-h-[48px] rounded-xl border-2 border-gray-100 focus:border-cyan-400 focus:outline-none transition-colors bg-white text-base"
                    >
                        <option value="Full Groom">Full Groom (Bath, Cut, Nails, Ears)</option>
                        <option value="Maintenance Groom">Maintenance Groom (Bath & Tidy)</option>
                        <option value="De-Shedding Package">De-Shedding Package</option>
                        <option value="Puppy Intro">Puppy Intro (Under 6 months)</option>
                    </select>
                </div>

                <div>
                    <label htmlFor="visitPlan" className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>
                        Visit Schedule
                    </label>
                    <select
                        id="visitPlan"
                        name="visitPlan"
                        value={formData.visitPlan}
                        onChange={handleChange}
                        className="w-full px-4 py-3 min-h-[48px] rounded-xl border-2 border-gray-100 focus:border-cyan-400 focus:outline-none transition-colors bg-white text-base"
                    >
                        {VISIT_PLAN_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    {formData.visitPlan !== 'one-off' && (
                        <p className="text-sm mt-2" style={{ color: colors.teal }}>
                            We will prioritize keeping a recurring slot around this rhythm.
                        </p>
                    )}
                </div>

                <div>
                    <label className="block text-sm font-bold mb-2" style={{ color: colors.teal }}>Preferred Days/Times</label>
                    <div className="grid grid-cols-2 gap-2">
                        {TIME_SLOTS.map(slot => (
                            <label
                                key={slot.id}
                                className={`flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${formData.preferredTimes.includes(slot.id)
                                    ? 'border-cyan-400 bg-cyan-50'
                                    : 'border-gray-100 hover:border-gray-200'
                                    }`}
                            >
                                <input
                                    type="checkbox"
                                    checked={formData.preferredTimes.includes(slot.id)}
                                    onChange={() => handleCheckboxChange(slot.id)}
                                    className="w-4 h-4 accent-cyan-500"
                                />
                                <span className="text-sm" style={{ color: colors.teal }}>{slot.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div>
                    <label htmlFor="notes" className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>Any Notes?</label>
                    <textarea
                        id="notes"
                        name="notes"
                        value={formData.notes}
                        onChange={handleChange}
                        rows={showAlternativeContact ? "3" : "2"}
                        className="w-full px-4 py-3 min-h-[48px] rounded-xl border-2 border-gray-100 focus:border-cyan-400 focus:outline-none transition-colors resize-none text-base"
                        placeholder="Nervous dog? Medical issues? Preferred style? Let us know."
                    />
                </div>

                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-4 min-h-[56px] rounded-xl font-bold text-lg transition-all hover:scale-[1.02] hover:shadow-lg mt-4 disabled:opacity-70 disabled:cursor-not-allowed"
                    style={{ backgroundColor: colors.green, color: colors.plum }}
                >
                    {isSubmitting ? 'Sending...' : 'Send Request'}
                </button>
            </form>

            {showAlternativeContact && (
                <div className="mt-8 pt-6 border-t border-gray-100 text-center">
                    <p className="body-font text-sm text-gray-500 mb-3">
                        Prefer to contact us directly?
                    </p>
                    <div className="flex flex-wrap justify-center gap-3">
                        <a
                            href="https://wa.me/447507731487"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all hover:scale-105"
                            style={{ backgroundColor: '#25D366', color: colors.plum }}
                        >
                            💬 WhatsApp
                        </a>
                        <a
                            href="sms:07507731487"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border-2 transition-all hover:scale-105"
                            style={{ borderColor: colors.teal, color: colors.teal }}
                        >
                            💬 Message 07507 731487
                        </a>
                    </div>
                </div>
            )}
        </div>
    );
};

const BookingForm = (props) => {
    const { session, human } = useAuth();

    // Two distinct submit paths, branched at the top — the anonymous EmailJS
    // flow stays unchanged for v1; only signed-in customers hit the DB.
    if (session && human) {
        return <AuthenticatedBookingForm {...props} human={human} />;
    }
    return <AnonymousBookingForm {...props} />;
};

export default BookingForm;
