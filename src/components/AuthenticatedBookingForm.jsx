import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { colors } from '../constants/colors';
import { trackEvent } from '../utils/analytics';
import { supabase } from '../lib/supabase';

const SLOT_OPTIONS = [
    '08:30', '09:00', '09:30', '10:00', '10:30',
    '11:00', '11:30', '12:00', '12:30', '13:00',
];

const SERVICE_OPTIONS = [
    'Full Groom',
    'Maintenance Groom',
    'De-Shedding Package',
    'Puppy Intro',
];

const SIZE_OPTIONS = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
];

const inputClass =
    'w-full px-4 py-3 min-h-[48px] rounded-xl border-2 border-gray-100 focus:border-cyan-400 focus:outline-none text-base';

const todayISO = () => new Date().toISOString().slice(0, 10);

const NEW_DOG_ID = '__new__';

const AuthenticatedBookingForm = ({
    headingTag = 'h2',
    headingId,
    onSuccess,
    onClose,
    variant = 'page',
    prefillSummary = '',
    human,
}) => {
    const HeadingTag = headingTag;
    const [dogs, setDogs] = useState([]);
    const [dogsLoading, setDogsLoading] = useState(true);

    const [step, setStep] = useState('form');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const [selectedDogId, setSelectedDogId] = useState('');
    const [newDog, setNewDog] = useState({ name: '', breed: '', size: 'medium' });
    const [service, setService] = useState(SERVICE_OPTIONS[0]);
    const [bookingDate, setBookingDate] = useState('');
    const [slot, setSlot] = useState('');
    const [notes, setNotes] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        if (!human?.id) return undefined;
        let active = true;
        supabase
            .from('dogs')
            .select('id, name, breed, size')
            .eq('human_id', human.id)
            .order('name')
            .then(({ data, error: dogsError }) => {
                if (!active) return;
                if (dogsError) setError(dogsError.message);
                const list = data ?? [];
                setDogs(list);
                setDogsLoading(false);
                setSelectedDogId((current) => current || (list[0]?.id ?? NEW_DOG_ID));
            });
        return () => {
            active = false;
        };
    }, [human?.id, refreshKey]);

    const isAddingNewDog = selectedDogId === NEW_DOG_ID;
    const selectedDog = dogs.find((d) => d.id === selectedDogId) || null;

    const submitAuthenticatedBooking = async (e) => {
        e.preventDefault();
        setError(null);

        if (!bookingDate || bookingDate < todayISO()) {
            setError('Please pick a date today or later.');
            return;
        }
        if (!SLOT_OPTIONS.includes(slot)) {
            setError('Please choose a time slot.');
            return;
        }

        setSubmitting(true);
        try {
            // Create the dog first if needed, so the booking always has a real
            // dogs row to attach to. dog_id and size always come from the dog
            // row — never trust client-supplied size for an existing dog.
            let dogRow = selectedDog;
            if (isAddingNewDog) {
                if (!newDog.name.trim() || !newDog.breed.trim()) {
                    throw new Error('Please fill in your dog\'s name and breed.');
                }
                const { data: inserted, error: dogError } = await supabase
                    .from('dogs')
                    .insert({
                        name: newDog.name.trim(),
                        breed: newDog.breed.trim(),
                        size: newDog.size,
                        human_id: human.id,
                    })
                    .select('id, name, breed, size')
                    .single();
                if (dogError) throw dogError;
                dogRow = inserted;
            }

            if (!dogRow) {
                throw new Error('Please choose a dog or add a new one.');
            }

            const { error: bookingError } = await supabase.from('bookings').insert({
                booking_date: bookingDate,
                slot,
                dog_id: dogRow.id,
                size: dogRow.size,
                service,
                addons: [],
            });
            if (bookingError) throw bookingError;

            trackEvent('Conversion', 'Submit Booking Request (Authed)', service);
            setStep('success');
            onSuccess?.();
            // Refresh dog list for next time (so newly-added dog is visible
            // if the user opens the form again).
            setRefreshKey((k) => k + 1);
            setNotes('');
        } catch (err) {
            const message = err?.message || 'Something went wrong. Please try again.';
            setError(message);
        } finally {
            setSubmitting(false);
        }
    };

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
                    Thanks {human.name}! We've added it to the diary and will text you to confirm.
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
                        to="/account/bookings"
                        className="inline-block px-8 py-3 rounded-full font-bold text-white transition-all hover:scale-105"
                        style={{ backgroundColor: colors.teal }}
                    >
                        See my bookings
                    </Link>
                )}
            </div>
        );
    }

    return (
        <div className="p-8">
            <div className="text-center mb-6">
                <span
                    className="inline-block px-4 py-2 rounded-full text-lg font-bold mb-4"
                    style={{ backgroundColor: colors.cyan + '20', color: colors.teal }}
                >
                    📅 Book your visit
                </span>
                <HeadingTag
                    id={headingId}
                    className="heading-font font-bold text-3xl mb-2"
                    style={{ color: colors.teal }}
                >
                    Booking as {human.name?.split(' ')[0] || 'you'}
                </HeadingTag>
                <p className="body-font text-sm text-gray-600">
                    {human.phone ? `We'll text you on ${human.phone} once it's confirmed.` : 'We\'ll be in touch to confirm.'}
                </p>
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
                <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm" role="alert">
                    {error}
                </div>
            )}

            <form onSubmit={submitAuthenticatedBooking} className="space-y-4">
                <div>
                    <label htmlFor="dog" className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>
                        Which dog?
                    </label>
                    <select
                        id="dog"
                        value={selectedDogId}
                        onChange={(e) => setSelectedDogId(e.target.value)}
                        className={inputClass}
                        disabled={dogsLoading}
                    >
                        {dogs.map((d) => (
                            <option key={d.id} value={d.id}>
                                {d.name} · {d.breed} ({d.size})
                            </option>
                        ))}
                        <option value={NEW_DOG_ID}>+ Add a new dog</option>
                    </select>
                </div>

                {isAddingNewDog && (
                    <div className="rounded-2xl border border-gray-100 p-4 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <input
                                className={inputClass}
                                placeholder="Name"
                                value={newDog.name}
                                onChange={(e) => setNewDog({ ...newDog, name: e.target.value })}
                                required
                            />
                            <input
                                className={inputClass}
                                placeholder="Breed"
                                value={newDog.breed}
                                onChange={(e) => setNewDog({ ...newDog, breed: e.target.value })}
                                required
                            />
                        </div>
                        <select
                            className={inputClass}
                            value={newDog.size}
                            onChange={(e) => setNewDog({ ...newDog, size: e.target.value })}
                        >
                            {SIZE_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div>
                    <label htmlFor="service" className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>
                        Service
                    </label>
                    <select
                        id="service"
                        value={service}
                        onChange={(e) => setService(e.target.value)}
                        className={inputClass}
                    >
                        {SERVICE_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="date" className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>
                            Date
                        </label>
                        <input
                            id="date"
                            type="date"
                            min={todayISO()}
                            value={bookingDate}
                            onChange={(e) => setBookingDate(e.target.value)}
                            className={inputClass}
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="slot" className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>
                            Time
                        </label>
                        <select
                            id="slot"
                            value={slot}
                            onChange={(e) => setSlot(e.target.value)}
                            className={inputClass}
                            required
                        >
                            <option value="">Pick a time…</option>
                            {SLOT_OPTIONS.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <label htmlFor="authed-notes" className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>
                        Anything we should know?
                    </label>
                    <textarea
                        id="authed-notes"
                        rows={2}
                        className={inputClass}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Mention anything that might affect grooming today (optional)"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        These notes go to the salon by message — your dog's permanent grooming notes
                        are managed by staff in your{' '}
                        <Link to="/account/profile" className="underline" style={{ color: colors.teal }}>
                            profile
                        </Link>.
                    </p>
                </div>

                <button
                    type="submit"
                    disabled={submitting || dogsLoading}
                    className="w-full py-4 min-h-[56px] rounded-xl font-bold text-lg transition-all hover:scale-[1.02] hover:shadow-lg mt-2 disabled:opacity-70"
                    style={{ backgroundColor: colors.green, color: colors.plum }}
                >
                    {submitting ? 'Sending request…' : 'Request this slot'}
                </button>
            </form>
        </div>
    );
};

export default AuthenticatedBookingForm;
