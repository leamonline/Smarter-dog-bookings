import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AccountLayout from '../AccountLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/colors';

const formatDate = (iso) => {
    if (!iso) return '';
    const date = new Date(iso);
    return date.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
};

export default function AccountPage() {
    const { human } = useAuth();
    const [nextBooking, setNextBooking] = useState(null);
    const [dogCount, setDogCount] = useState(null);

    useEffect(() => {
        if (!human) return;
        let active = true;

        Promise.all([
            supabase
                .from('bookings')
                .select('id, booking_date, slot, service, status, dog:dogs(name, breed)')
                .gte('booking_date', new Date().toISOString().slice(0, 10))
                .neq('status', 'Cancelled')
                .order('booking_date', { ascending: true })
                .limit(1)
                .maybeSingle(),
            supabase.from('dogs').select('id', { count: 'exact', head: true }),
        ]).then(([bookingRes, dogRes]) => {
            if (!active) return;
            setNextBooking(bookingRes.data ?? null);
            setDogCount(dogRes.count ?? 0);
        });

        return () => {
            active = false;
        };
    }, [human]);

    return (
        <AccountLayout subheading="Your dashboard, dog profiles and bookings, all in one place.">
            <section className="space-y-6">
                <div
                    className="rounded-2xl p-5"
                    style={{ backgroundColor: colors.tealLight, color: colors.teal }}
                >
                    <h2 className="heading-font font-bold text-lg mb-2">Next visit</h2>
                    {nextBooking ? (
                        <div className="space-y-1 text-sm">
                            <p>
                                <span className="font-bold">{nextBooking.dog?.name ?? 'Your dog'}</span>
                                {nextBooking.dog?.breed ? ` · ${nextBooking.dog.breed}` : ''}
                            </p>
                            <p>
                                {formatDate(nextBooking.booking_date)} · {nextBooking.slot}
                            </p>
                            <p>{nextBooking.service}</p>
                            <p className="text-xs mt-2 opacity-80">Status: {nextBooking.status}</p>
                        </div>
                    ) : (
                        <p className="text-sm">
                            No upcoming visits.{' '}
                            <Link to="/book" className="underline font-bold">
                                Book one now
                            </Link>
                            .
                        </p>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Link
                        to="/account/dogs"
                        className="rounded-2xl p-5 border border-gray-100 hover:shadow-md transition-shadow"
                        style={{ color: colors.teal }}
                    >
                        <p className="text-3xl font-bold heading-font">{dogCount ?? '—'}</p>
                        <p className="text-sm font-bold">{dogCount === 1 ? 'Dog on file' : 'Dogs on file'}</p>
                        <p className="text-xs text-gray-500 mt-1">Tap to view or add a new dog →</p>
                    </Link>
                    <Link
                        to="/account/bookings"
                        className="rounded-2xl p-5 border border-gray-100 hover:shadow-md transition-shadow"
                        style={{ color: colors.teal }}
                    >
                        <p className="font-bold heading-font">My bookings</p>
                        <p className="text-xs text-gray-500 mt-1">Upcoming + past visits →</p>
                    </Link>
                    <Link
                        to="/account/profile"
                        className="rounded-2xl p-5 border border-gray-100 hover:shadow-md transition-shadow"
                        style={{ color: colors.teal }}
                    >
                        <p className="font-bold heading-font">Profile + reminders</p>
                        <p className="text-xs text-gray-500 mt-1">Update your details →</p>
                    </Link>
                </div>

                <Link
                    to="/book"
                    className="block w-full text-center py-4 rounded-full font-bold text-base hover:scale-[1.02] transition-transform"
                    style={{ backgroundColor: colors.green, color: colors.plum }}
                >
                    Book a visit
                </Link>
            </section>
        </AccountLayout>
    );
}
