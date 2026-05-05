import React, { useState } from 'react';
import AccountLayout from '../AccountLayout';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/colors';
import { validateEmail } from '../../utils/validation';

const REMINDER_HOUR_OPTIONS = [
    { value: 24, label: '24 hours before' },
    { value: 12, label: '12 hours before' },
    { value: 2, label: '2 hours before' },
];

const CHANNELS = [
    { id: 'whatsapp', label: 'WhatsApp' },
    { id: 'sms', label: 'SMS' },
    { id: 'email', label: 'Email' },
];

const inputClass =
    'w-full px-4 py-3 min-h-[48px] rounded-xl border-2 border-gray-100 focus:border-cyan-400 focus:outline-none text-base';

export default function AccountProfilePage() {
    const { human, refreshHuman } = useAuth();
    const buildForm = (h) =>
        h
            ? {
                  name: h.name ?? '',
                  surname: h.surname ?? '',
                  email: h.email ?? '',
                  address: h.address ?? '',
                  customer_notes: h.customer_notes ?? '',
                  reminder_hours: h.reminder_hours ?? 24,
                  reminder_channels: Array.isArray(h.reminder_channels)
                      ? h.reminder_channels
                      : ['whatsapp'],
              }
            : null;

    const [form, setForm] = useState(() => buildForm(human));
    const [seenHumanId, setSeenHumanId] = useState(human?.id ?? null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [savedAt, setSavedAt] = useState(null);

    // Reset the form when the human row changes (e.g. after refreshHuman()).
    if (human?.id !== seenHumanId) {
        setSeenHumanId(human?.id ?? null);
        setForm(buildForm(human));
        setSavedAt(null);
        setError(null);
    }

    if (!human || !form) {
        return <AccountLayout heading="Profile">Loading…</AccountLayout>;
    }

    const handleChange = (field) => (e) =>
        setForm((prev) => ({ ...prev, [field]: e.target.value }));

    const toggleChannel = (id) =>
        setForm((prev) => ({
            ...prev,
            reminder_channels: prev.reminder_channels.includes(id)
                ? prev.reminder_channels.filter((c) => c !== id)
                : [...prev.reminder_channels, id],
        }));

    const handleSave = async (e) => {
        e.preventDefault();
        setError(null);
        setSavedAt(null);

        if (form.email && !validateEmail(form.email)) {
            setError('Please enter a valid email address (or leave it blank).');
            return;
        }
        if (form.reminder_channels.length === 0) {
            setError('Pick at least one reminder channel.');
            return;
        }

        setSaving(true);
        const { error: updateError } = await supabase
            .from('humans')
            .update({
                name: form.name.trim() || 'Customer',
                surname: form.surname.trim() || null,
                email: form.email.trim() || null,
                address: form.address.trim(),
                customer_notes: form.customer_notes.trim(),
                reminder_hours: Number(form.reminder_hours) || 24,
                reminder_channels: form.reminder_channels,
            })
            .eq('id', human.id);
        setSaving(false);

        if (updateError) {
            setError(updateError.message);
            return;
        }
        setSavedAt(new Date());
        await refreshHuman();
    };

    return (
        <AccountLayout heading="Profile + reminders" subheading="Keep your contact details up to date.">
            <form onSubmit={handleSave} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>
                            First name
                        </label>
                        <input className={inputClass} value={form.name} onChange={handleChange('name')} required />
                    </div>
                    <div>
                        <label className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>
                            Surname
                        </label>
                        <input className={inputClass} value={form.surname} onChange={handleChange('surname')} />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>
                        Phone
                    </label>
                    <input
                        className={`${inputClass} bg-gray-50`}
                        value={human.phone ?? ''}
                        readOnly
                        aria-readonly="true"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        Contact us if you need to change the number on file.
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>
                        Email
                    </label>
                    <input
                        type="email"
                        className={inputClass}
                        value={form.email}
                        onChange={handleChange('email')}
                        placeholder="you@example.com"
                    />
                </div>

                <div>
                    <label className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>
                        Address
                    </label>
                    <textarea
                        rows={2}
                        className={inputClass}
                        value={form.address}
                        onChange={handleChange('address')}
                    />
                </div>

                <div>
                    <label className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>
                        Notes for the salon
                    </label>
                    <textarea
                        rows={3}
                        className={inputClass}
                        value={form.customer_notes}
                        onChange={handleChange('customer_notes')}
                        placeholder="Access info, parking notes, preferred contact times…"
                    />
                </div>

                <div>
                    <label className="block text-sm font-bold mb-1" style={{ color: colors.teal }}>
                        Remind me…
                    </label>
                    <select
                        className={inputClass}
                        value={form.reminder_hours}
                        onChange={handleChange('reminder_hours')}
                    >
                        {REMINDER_HOUR_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <p className="text-sm font-bold mb-2" style={{ color: colors.teal }}>
                        Reminder channels
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                        {CHANNELS.map((channel) => {
                            const active = form.reminder_channels.includes(channel.id);
                            return (
                                <label
                                    key={channel.id}
                                    className={`flex items-center gap-2 p-3 rounded-xl border-2 cursor-pointer ${
                                        active ? 'border-cyan-400 bg-cyan-50' : 'border-gray-100 hover:border-gray-200'
                                    }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={active}
                                        onChange={() => toggleChannel(channel.id)}
                                        className="w-4 h-4 accent-cyan-500"
                                    />
                                    <span className="text-sm" style={{ color: colors.teal }}>
                                        {channel.label}
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>

                {error && (
                    <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm" role="alert">
                        {error}
                    </div>
                )}

                {savedAt && (
                    <div
                        className="p-3 rounded-lg text-sm"
                        style={{ backgroundColor: colors.greenLight, color: colors.plum }}
                        role="status"
                    >
                        Saved at {savedAt.toLocaleTimeString('en-GB')}.
                    </div>
                )}

                <button
                    type="submit"
                    disabled={saving}
                    className="w-full py-3 min-h-[48px] rounded-full font-bold disabled:opacity-70"
                    style={{ backgroundColor: colors.green, color: colors.plum }}
                >
                    {saving ? 'Saving…' : 'Save changes'}
                </button>
            </form>
        </AccountLayout>
    );
}
