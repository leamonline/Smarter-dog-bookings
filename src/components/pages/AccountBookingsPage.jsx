import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AccountLayout from '../AccountLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/colors';

const SUPPORT_WHATSAPP = 'https://wa.me/447507731487';

const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
};

const todayLocalISO = () => new Date().toISOString().slice(0, 10);

export default function AccountBookingsPage() {
    const { human } = useAuth();
    const [bookings, setBookings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [cancellingId, setCancellingId] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const humanId = human?.id;

    useEffect(() => {
        if (!humanId) return undefined;
        let active = true;
        supabase
            .from('bookings')
            .select(
                'id, booking_date, slot, service, status, addons, payment, deposit_amount, dog:dogs(name, breed, size)',
            )
            .order('booking_date', { ascending: false })
            .then(({ data, error: fetchError }) => {
                if (!active) return;
                if (fetchError) setError(fetchError.message);
                setBookings(data ?? []);
                setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [humanId, refreshKey]);

    const reload = () => setRefreshKey((k) => k + 1);

    const today = todayLocalISO();
    const upcoming = useMemo(
        () => bookings.filter((b) => b.booking_date >= today && b.status !== 'Cancelled'),
        [bookings, today],
    );
    const past = useMemo(
        () => bookings.filter((b) => b.booking_date < today || b.status === 'Cancelled'),
        [bookings, today],
    );

    const handleCancel = async (booking) => {
        if (!window.confirm(`Cancel ${booking.dog?.name ?? 'your dog'}'s ${formatDate(booking.booking_date)} appointment?`)) {
            return;
        }
        setCancellingId(booking.id);
        const { error: cancelError } = await supabase
            .from('bookings')
            .update({ status: 'Cancelled', cancel_reason: 'Customer cancelled via website' })
            .eq('id', booking.id);
        setCancellingId(null);
        if (cancelError) {
            setError(cancelError.message);
            return;
        }
        reload();
    };

    return (
        <AccountLayout heading="My bookings" subheading="Upcoming visits and past appointments.">
            {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm" role="alert">
                    {error}
                </div>
            )}

            {loading ? (
                <p className="text-sm text-gray-500">Loading…</p>
            ) : (
                <div className="space-y-8">
                    <section>
                        <h2 className="heading-font font-bold text-lg mb-3" style={{ color: colors.teal }}>
                            Upcoming
                        </h2>
                        {upcoming.length === 0 ? (
                            <p className="text-sm text-gray-600">
                                No upcoming visits.{' '}
                                <Link to="/book" className="underline font-bold" style={{ color: colors.teal }}>
                                    Book one
                                </Link>
                                .
                            </p>
                        ) : (
                            <ul className="space-y-3">
                                {upcoming.map((b) => {
                                    const isToday = b.booking_date === today;
                                    return (
                                        <li
                                            key={b.id}
                                            className="rounded-2xl border border-gray-100 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
                                        >
                                            <div>
                                                <p className="heading-font font-bold" style={{ color: colors.teal }}>
                                                    {b.dog?.name ?? 'Your dog'} · {b.service}
                                                </p>
                                                <p className="text-sm text-gray-600">
                                                    {formatDate(b.booking_date)} · {b.slot}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Status: {b.status}
                                                    {b.deposit_amount ? ` · Deposit £${b.deposit_amount}` : ''}
                                                </p>
                                            </div>
                                            {isToday ? (
                                                <a
                                                    href={SUPPORT_WHATSAPP}
                                                    className="text-sm font-bold underline"
                                                    style={{ color: colors.teal }}
                                                >
                                                    For same-day changes, message us →
                                                </a>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => handleCancel(b)}
                                                    disabled={cancellingId === b.id}
                                                    className="px-4 py-2 rounded-full text-sm font-bold border-2 disabled:opacity-70"
                                                    style={{ borderColor: colors.pink, color: colors.pink }}
                                                >
                                                    {cancellingId === b.id ? 'Cancelling…' : 'Cancel'}
                                                </button>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>

                    <section>
                        <h2 className="heading-font font-bold text-lg mb-3" style={{ color: colors.teal }}>
                            Past
                        </h2>
                        {past.length === 0 ? (
                            <p className="text-sm text-gray-600">No past visits yet.</p>
                        ) : (
                            <ul className="space-y-2">
                                {past.slice(0, 25).map((b) => (
                                    <li
                                        key={b.id}
                                        className="rounded-xl border border-gray-100 p-3 text-sm"
                                    >
                                        <span className="font-bold" style={{ color: colors.teal }}>
                                            {b.dog?.name ?? 'Your dog'}
                                        </span>{' '}
                                        · {b.service} · {formatDate(b.booking_date)} · {b.slot}{' '}
                                        <span className="text-gray-500">({b.status})</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            )}
        </AccountLayout>
    );
}
