import React, { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { colors } from '../../constants/colors';
import { validatePhone } from '../../utils/validation';
import { normalisePhoneE164UK } from '../../utils/phone';

const SUPPORT_WHATSAPP = 'https://wa.me/447507731487';
const SUPPORT_TEL = 'tel:07507731487';

const LinkConflictHelp = ({ heading, body }) => (
    <div
        className="rounded-2xl border p-4 text-sm space-y-2"
        style={{ backgroundColor: colors.pinkLight, borderColor: colors.pink, color: colors.plum }}
    >
        <p className="font-bold">{heading}</p>
        <p>{body}</p>
        <div className="flex flex-wrap gap-2 pt-2">
            <a
                href={SUPPORT_WHATSAPP}
                className="px-4 py-2 rounded-full text-sm font-bold"
                style={{ backgroundColor: '#25D366', color: colors.plum }}
            >
                💬 WhatsApp us
            </a>
            <a
                href={SUPPORT_TEL}
                className="px-4 py-2 rounded-full text-sm font-bold border-2"
                style={{ borderColor: colors.teal, color: colors.teal }}
            >
                📞 Call us
            </a>
        </div>
    </div>
);

export default function LoginPage() {
    const { session, signIn, verifyOtp, linkStatus, linkError } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [step, setStep] = useState('phone');
    const [phoneInput, setPhoneInput] = useState('');
    const [phoneE164, setPhoneE164] = useState('');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const search = new URLSearchParams(location.search);
    const next = search.get('next') || '/account';

    useEffect(() => {
        if (session && (linkStatus === 'linked' || linkStatus === 'existing' || linkStatus === 'created')) {
            navigate(next, { replace: true });
        }
    }, [session, linkStatus, navigate, next]);

    if (session && (linkStatus === 'linked' || linkStatus === 'existing' || linkStatus === 'created')) {
        return <Navigate to={next} replace />;
    }

    const handleSendCode = async (e) => {
        e.preventDefault();
        setError(null);

        if (!validatePhone(phoneInput)) {
            setError('Please enter a valid UK mobile number.');
            return;
        }
        const e164 = normalisePhoneE164UK(phoneInput);
        if (!e164) {
            setError("That doesn't look like a UK mobile we can text.");
            return;
        }

        setSubmitting(true);
        try {
            await signIn(e164);
            setPhoneE164(e164);
            setStep('code');
        } catch (err) {
            setError(err?.message || 'Could not send code. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleVerify = async (e) => {
        e.preventDefault();
        setError(null);

        if (!/^\d{6}$/.test(code)) {
            setError('Enter the 6-digit code we just texted you.');
            return;
        }

        setSubmitting(true);
        try {
            await verifyOtp(phoneE164, code, { name: name.trim(), email: email.trim() });
        } catch (err) {
            setError(err?.message || 'That code did not work. Try again or request a new one.');
        } finally {
            setSubmitting(false);
        }
    };

    const linkConflict = linkStatus === 'ambiguous' || linkStatus === 'claimed_by_other';

    return (
        <div
            className="min-h-screen flex items-center justify-center px-4 py-12"
            style={{ backgroundColor: colors.warmBeige }}
        >
            <div className="w-full max-w-md bg-white rounded-3xl shadow-lg p-8">
                <div className="text-center mb-6">
                    <Link to="/" className="text-sm font-medium" style={{ color: colors.teal }}>
                        ← Back to homepage
                    </Link>
                </div>
                <h1
                    className="heading-font font-bold text-3xl mb-2 text-center"
                    style={{ color: colors.teal }}
                >
                    {step === 'phone' ? 'Sign in to your account' : 'Enter your code'}
                </h1>
                <p className="body-font text-sm text-center text-gray-600 mb-6">
                    {step === 'phone'
                        ? 'Pop in your mobile number — we\'ll text you a 6-digit code.'
                        : `We just texted a code to ${phoneE164}. Codes expire after a few minutes.`}
                </p>

                {linkConflict && (
                    <div className="mb-5">
                        <LinkConflictHelp
                            heading={
                                linkStatus === 'ambiguous'
                                    ? 'We found more than one account for that number'
                                    : 'That number is already linked to another login'
                            }
                            body={
                                linkStatus === 'ambiguous'
                                    ? "It looks like we have a couple of profiles on that number. Drop us a message and we'll tidy it up so you can sign in safely."
                                    : "If you think that's a mistake, get in touch and we'll sort it out for you."
                            }
                        />
                    </div>
                )}

                {linkError && !linkConflict && (
                    <div className="mb-5 p-3 rounded-lg bg-red-50 text-red-600 text-sm" role="alert">
                        {linkError}
                    </div>
                )}

                {error && (
                    <div className="mb-5 p-3 rounded-lg bg-red-50 text-red-600 text-sm" role="alert">
                        {error}
                    </div>
                )}

                {step === 'phone' && (
                    <form onSubmit={handleSendCode} className="space-y-4">
                        <div>
                            <label htmlFor="phone" className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>
                                Mobile number
                            </label>
                            <input
                                id="phone"
                                type="tel"
                                inputMode="tel"
                                autoComplete="tel"
                                required
                                value={phoneInput}
                                onChange={(e) => setPhoneInput(e.target.value)}
                                placeholder="07123 456789"
                                className="w-full px-4 py-3 min-h-[48px] rounded-xl border-2 border-gray-100 focus:border-cyan-400 focus:outline-none text-base"
                            />
                        </div>
                        <details className="text-sm">
                            <summary className="cursor-pointer" style={{ color: colors.teal }}>
                                First time? Tell us your name (optional)
                            </summary>
                            <div className="mt-3 space-y-3">
                                <input
                                    type="text"
                                    autoComplete="name"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Your name"
                                    className="w-full px-4 py-3 min-h-[48px] rounded-xl border-2 border-gray-100 focus:border-cyan-400 focus:outline-none text-base"
                                />
                                <input
                                    type="email"
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Email (optional)"
                                    className="w-full px-4 py-3 min-h-[48px] rounded-xl border-2 border-gray-100 focus:border-cyan-400 focus:outline-none text-base"
                                />
                                <p className="text-xs text-gray-500">
                                    Existing customers — leave these blank, we'll match you by phone.
                                </p>
                            </div>
                        </details>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full py-3 min-h-[48px] rounded-full font-bold text-base disabled:opacity-70"
                            style={{ backgroundColor: colors.green, color: colors.plum }}
                        >
                            {submitting ? 'Sending…' : 'Text me a code'}
                        </button>
                    </form>
                )}

                {step === 'code' && (
                    <form onSubmit={handleVerify} className="space-y-4">
                        <div>
                            <label htmlFor="code" className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>
                                6-digit code
                            </label>
                            <input
                                id="code"
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                pattern="\d{6}"
                                maxLength={6}
                                required
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                                placeholder="123456"
                                className="w-full px-4 py-3 min-h-[48px] rounded-xl border-2 border-gray-100 focus:border-cyan-400 focus:outline-none text-base tracking-widest text-center"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full py-3 min-h-[48px] rounded-full font-bold text-base disabled:opacity-70"
                            style={{ backgroundColor: colors.green, color: colors.plum }}
                        >
                            {submitting ? 'Checking…' : 'Sign in'}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setStep('phone');
                                setCode('');
                                setError(null);
                            }}
                            className="w-full text-sm font-medium underline"
                            style={{ color: colors.teal }}
                        >
                            Use a different number
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
