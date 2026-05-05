import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../../context/authContextValue';

const updateCallMock = vi.fn();

vi.mock('../../lib/supabase', () => ({
    supabase: {
        from: (table) => {
            if (table !== 'humans') throw new Error(`unexpected table ${table}`);
            return {
                update: (payload) => ({
                    eq: (col, val) => updateCallMock(payload, col, val),
                }),
            };
        },
    },
}));

import AccountProfilePage from './AccountProfilePage';

const baseHuman = {
    id: 'h1',
    name: 'Jane',
    surname: 'Doe',
    email: 'jane@example.com',
    address: '12 Boxer Street',
    customer_notes: 'Prefers afternoons',
    phone: '07507731487',
    reminder_hours: 24,
    reminder_channels: ['whatsapp'],
};

const renderPage = (humanOverrides = {}, refreshHuman = vi.fn()) => {
    const ctx = {
        session: { user: { id: 'u1' } },
        human: { ...baseHuman, ...humanOverrides },
        loading: false,
        linkStatus: 'linked',
        linkError: null,
        signIn: vi.fn(),
        verifyOtp: vi.fn(),
        signOut: vi.fn(),
        refreshHuman,
    };
    render(
        <AuthContext.Provider value={ctx}>
            <MemoryRouter>
                <AccountProfilePage />
            </MemoryRouter>
        </AuthContext.Provider>,
    );
    return { ctx, refreshHuman };
};

describe('AccountProfilePage', () => {
    beforeEach(() => {
        updateCallMock.mockReset();
    });

    it('pre-fills the form from the human row and shows phone read-only', () => {
        renderPage();
        expect(screen.getByDisplayValue('Jane')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
        expect(screen.getByDisplayValue('jane@example.com')).toBeInTheDocument();
        const phoneInput = screen.getByDisplayValue('07507731487');
        expect(phoneInput).toHaveAttribute('readonly');
    });

    it('saves the editable subset of fields and refreshes the human row', async () => {
        updateCallMock.mockResolvedValue({ error: null });
        const refreshHuman = vi.fn();
        renderPage({}, refreshHuman);

        fireEvent.change(screen.getByDisplayValue('Jane'), { target: { value: 'Janet' } });
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

        await waitFor(() => expect(updateCallMock).toHaveBeenCalledTimes(1));
        const [payload, col, val] = updateCallMock.mock.calls[0];
        expect(payload).toMatchObject({
            name: 'Janet',
            surname: 'Doe',
            email: 'jane@example.com',
            customer_notes: 'Prefers afternoons',
            reminder_hours: 24,
            reminder_channels: ['whatsapp'],
        });
        expect(col).toBe('id');
        expect(val).toBe('h1');
        await waitFor(() => expect(refreshHuman).toHaveBeenCalledTimes(1));
    });

    it('rejects an invalid email without calling update', async () => {
        renderPage();
        // Use a value that bypasses the input[type=email] browser validation
        // but still fails the JS regex (no TLD).
        fireEvent.change(screen.getByDisplayValue('jane@example.com'), {
            target: { value: 'a@b' },
        });
        fireEvent.submit(screen.getByDisplayValue('a@b').closest('form'));
        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent(/valid email/i);
        });
        expect(updateCallMock).not.toHaveBeenCalled();
    });

    it('refuses to save when no reminder channel is selected', async () => {
        renderPage();
        // Untick the only channel.
        fireEvent.click(screen.getByLabelText(/whatsapp/i));
        fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent(/at least one reminder channel/i);
        });
        expect(updateCallMock).not.toHaveBeenCalled();
    });
});
