import React, { useEffect, useState } from 'react';
import AccountLayout from '../AccountLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/colors';

const SIZE_OPTIONS = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
];

const inputClass =
    'w-full px-4 py-3 min-h-[48px] rounded-xl border-2 border-gray-100 focus:border-cyan-400 focus:outline-none text-base';

const SUPPORT_WHATSAPP = 'https://wa.me/447507731487';

export default function AccountDogsPage() {
    const { human } = useAuth();
    const [dogs, setDogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [draft, setDraft] = useState({ name: '', breed: '', size: 'medium', age: '', dob: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const humanId = human?.id;

    useEffect(() => {
        if (!humanId) return undefined;
        let active = true;
        supabase
            .from('dogs')
            .select('id, name, breed, size, age, dob, alerts, groom_notes')
            .eq('human_id', humanId)
            .order('name', { ascending: true })
            .then(({ data, error: dogsError }) => {
                if (!active) return;
                if (dogsError) setError(dogsError.message);
                setDogs(data ?? []);
                setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [humanId, refreshKey]);

    const reloadDogs = () => setRefreshKey((k) => k + 1);

    const handleAdd = async (e) => {
        e.preventDefault();
        setError(null);
        if (!draft.name.trim() || !draft.breed.trim()) {
            setError('Please fill in your dog\'s name and breed.');
            return;
        }
        setSaving(true);
        const { error: insertError } = await supabase.from('dogs').insert({
            name: draft.name.trim(),
            breed: draft.breed.trim(),
            size: draft.size,
            age: draft.age.trim() || null,
            dob: draft.dob.trim() || null,
            human_id: human.id,
        });
        setSaving(false);
        if (insertError) {
            setError(insertError.message);
            return;
        }
        setDraft({ name: '', breed: '', size: 'medium', age: '', dob: '' });
        setShowAdd(false);
        reloadDogs();
    };

    return (
        <AccountLayout heading="My dogs" subheading="Add a new dog or review the ones we already know.">
            {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm" role="alert">
                    {error}
                </div>
            )}

            {loading ? (
                <p className="text-sm text-gray-500">Loading…</p>
            ) : dogs.length === 0 ? (
                <p className="text-sm text-gray-600">
                    No dogs on file yet — add your first one below.
                </p>
            ) : (
                <ul className="space-y-3">
                    {dogs.map((dog) => (
                        <li
                            key={dog.id}
                            className="rounded-2xl border border-gray-100 p-4"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="heading-font font-bold text-lg" style={{ color: colors.teal }}>
                                        {dog.name}
                                    </p>
                                    <p className="text-sm text-gray-600">
                                        {dog.breed} · {dog.size}
                                        {dog.age ? ` · ${dog.age}` : ''}
                                    </p>
                                    {dog.alerts?.length > 0 && (
                                        <p className="text-xs mt-2 inline-block px-2 py-1 rounded-full"
                                           style={{ backgroundColor: colors.yellowLight, color: colors.plum }}>
                                            ⚠ {dog.alerts.join(' · ')}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <div className="mt-6">
                {showAdd ? (
                    <form
                        onSubmit={handleAdd}
                        className="rounded-2xl border border-gray-100 p-4 space-y-3"
                    >
                        <p className="heading-font font-bold" style={{ color: colors.teal }}>
                            Add a dog
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <input
                                className={inputClass}
                                placeholder="Name"
                                value={draft.name}
                                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                                required
                            />
                            <input
                                className={inputClass}
                                placeholder="Breed"
                                value={draft.breed}
                                onChange={(e) => setDraft({ ...draft, breed: e.target.value })}
                                required
                            />
                            <select
                                className={inputClass}
                                value={draft.size}
                                onChange={(e) => setDraft({ ...draft, size: e.target.value })}
                            >
                                {SIZE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                            <input
                                className={inputClass}
                                placeholder="Age (e.g. 2 years)"
                                value={draft.age}
                                onChange={(e) => setDraft({ ...draft, age: e.target.value })}
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="submit"
                                disabled={saving}
                                className="px-5 py-2 rounded-full font-bold text-sm disabled:opacity-70"
                                style={{ backgroundColor: colors.green, color: colors.plum }}
                            >
                                {saving ? 'Saving…' : 'Save dog'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowAdd(false)}
                                className="px-5 py-2 rounded-full font-medium text-sm border-2"
                                style={{ borderColor: colors.teal, color: colors.teal }}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                ) : (
                    <button
                        type="button"
                        onClick={() => setShowAdd(true)}
                        className="w-full py-3 rounded-full font-bold border-2"
                        style={{ borderColor: colors.teal, color: colors.teal }}
                    >
                        + Add a dog
                    </button>
                )}
            </div>

            <div
                className="mt-6 rounded-2xl p-4 text-sm"
                style={{ backgroundColor: colors.tealLight, color: colors.teal }}
            >
                <p className="font-bold mb-1">Need to update your dog's details?</p>
                <p>
                    Message us and we'll update them safely — that way grooming notes and care history stay accurate.{' '}
                    <a href={SUPPORT_WHATSAPP} className="underline font-bold">
                        WhatsApp us
                    </a>
                    .
                </p>
            </div>
        </AccountLayout>
    );
}
