import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../../context/authContextValue';
import LoginPage from './LoginPage';

const renderWith = (overrides = {}) => {
    const value = {
        session: null,
        human: null,
        linkStatus: null,
        linkError: null,
        loading: false,
        signIn: vi.fn().mockResolvedValue(undefined),
        verifyOtp: vi.fn().mockResolvedValue({ session: { user: { id: 'u1' } } }),
        signOut: vi.fn(),
        refreshHuman: vi.fn(),
        ...overrides,
    };
    render(
        <MemoryRouter>
            <AuthContext.Provider value={value}>
                <LoginPage />
            </AuthContext.Provider>
        </MemoryRouter>,
    );
    return value;
};

describe('LoginPage', () => {
    beforeEach(() => vi.clearAllMocks());

    it('rejects an invalid UK number without sending an OTP', async () => {
        const ctx = renderWith();
        fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: '12345' } });
        fireEvent.click(screen.getByRole('button', { name: /send me a code on whatsapp/i }));
        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent(/valid UK mobile/i);
        });
        expect(ctx.signIn).not.toHaveBeenCalled();
    });

    it('sends a WhatsApp OTP by default and advances to the code step', async () => {
        const ctx = renderWith();
        fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: '07507 731487' } });
        fireEvent.click(screen.getByRole('button', { name: /send me a code on whatsapp/i }));
        await waitFor(() => {
            expect(ctx.signIn).toHaveBeenCalledWith('+447507731487', 'whatsapp');
        });
        expect(await screen.findByLabelText(/6-digit code/i)).toBeInTheDocument();
        expect(screen.getByText(/on whatsapp/i)).toBeInTheDocument();
    });

    it('falls back to SMS when the customer clicks "Send by SMS instead"', async () => {
        const ctx = renderWith();
        fireEvent.change(screen.getByLabelText(/mobile number/i), { target: { value: '07507 731487' } });
        fireEvent.click(screen.getByRole('button', { name: /send me a code on whatsapp/i }));
        await waitFor(() =>
            expect(ctx.signIn).toHaveBeenCalledWith('+447507731487', 'whatsapp'),
        );

        fireEvent.click(screen.getByRole('button', { name: /send by sms instead/i }));
        await waitFor(() => {
            expect(ctx.signIn).toHaveBeenCalledWith('+447507731487', 'sms');
        });
        expect(await screen.findByText(/texted a code .*via sms/i)).toBeInTheDocument();
    });

    it('shows the ambiguous-match conflict state when the RPC returns ambiguous', () => {
        renderWith({ session: { user: { id: 'u1' } }, linkStatus: 'ambiguous' });
        expect(screen.getByText(/more than one account/i)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /whatsapp/i })).toBeInTheDocument();
    });

    it('shows the claim-conflict state when another user already claimed the number', () => {
        renderWith({ session: { user: { id: 'u1' } }, linkStatus: 'claimed_by_other' });
        expect(screen.getByText(/already linked to another login/i)).toBeInTheDocument();
    });
});
