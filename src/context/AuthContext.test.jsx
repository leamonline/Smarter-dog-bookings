import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

const rpcMock = vi.fn();
const getSessionMock = vi.fn();
const onAuthStateChangeMock = vi.fn();
const fromMock = vi.fn();
const signInWithOtpMock = vi.fn();
const verifyOtpMock = vi.fn();
const signOutMock = vi.fn();

let authChangeCallback = null;

vi.mock('../lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: (...args) => getSessionMock(...args),
            onAuthStateChange: (cb) => {
                authChangeCallback = cb;
                onAuthStateChangeMock(cb);
                return { data: { subscription: { unsubscribe: vi.fn() } } };
            },
            signInWithOtp: (...args) => signInWithOtpMock(...args),
            verifyOtp: (...args) => verifyOtpMock(...args),
            signOut: (...args) => signOutMock(...args),
        },
        rpc: (...args) => rpcMock(...args),
        from: (...args) => fromMock(...args),
    },
    isSupabaseConfigured: true,
}));

import { AuthProvider } from './AuthContext';
import { AuthContext } from './authContextValue';

const Consumer = ({ onValue }) => {
    const ctx = React.useContext(AuthContext);
    React.useEffect(() => {
        onValue(ctx);
    }, [ctx, onValue]);
    return null;
};

describe('AuthProvider linking', () => {
    beforeEach(() => {
        rpcMock.mockReset();
        getSessionMock.mockReset();
        onAuthStateChangeMock.mockReset();
        fromMock.mockReset();
        signInWithOtpMock.mockReset();
        verifyOtpMock.mockReset();
        signOutMock.mockReset();
        authChangeCallback = null;
    });

    it('calls link_or_create_customer_human exactly once when SIGNED_IN fires twice', async () => {
        const session = { user: { id: 'user-1', phone: '447507731487' } };
        getSessionMock.mockResolvedValue({ data: { session: null } });
        rpcMock.mockResolvedValue({
            data: { status: 'linked', human: { id: 'human-1', name: 'Jane' } },
            error: null,
        });

        render(
            <AuthProvider>
                <Consumer onValue={() => {}} />
            </AuthProvider>,
        );

        await waitFor(() => expect(authChangeCallback).toBeTruthy());

        authChangeCallback('SIGNED_IN', session);
        authChangeCallback('SIGNED_IN', session);
        authChangeCallback('TOKEN_REFRESHED', session);

        await waitFor(() => expect(rpcMock).toHaveBeenCalled());

        expect(rpcMock).toHaveBeenCalledTimes(1);
        expect(rpcMock).toHaveBeenCalledWith('link_or_create_customer_human', expect.objectContaining({
            p_phone: '447507731487',
        }));
    });

    it('exposes ambiguous status from the RPC to consumers', async () => {
        const session = { user: { id: 'user-2', phone: '447111222333' } };
        getSessionMock.mockResolvedValue({ data: { session } });
        rpcMock.mockResolvedValue({
            data: { status: 'ambiguous', human: null },
            error: null,
        });

        const values = [];
        render(
            <AuthProvider>
                <Consumer onValue={(v) => values.push(v)} />
            </AuthProvider>,
        );

        await waitFor(() => {
            expect(values.some((v) => v.linkStatus === 'ambiguous')).toBe(true);
        });
    });

    it('clears state on SIGNED_OUT and allows a fresh link on subsequent SIGNED_IN', async () => {
        const session = { user: { id: 'user-3', phone: '447222333444' } };
        getSessionMock.mockResolvedValue({ data: { session: null } });
        rpcMock.mockResolvedValue({
            data: { status: 'linked', human: { id: 'h3', name: 'Alex' } },
            error: null,
        });

        render(
            <AuthProvider>
                <Consumer onValue={() => {}} />
            </AuthProvider>,
        );

        await waitFor(() => expect(authChangeCallback).toBeTruthy());

        authChangeCallback('SIGNED_IN', session);
        await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

        authChangeCallback('SIGNED_OUT', null);
        authChangeCallback('SIGNED_IN', session);

        await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(2));
    });

    it('exposes signIn / verifyOtp / signOut handlers that delegate to supabase.auth', async () => {
        getSessionMock.mockResolvedValue({ data: { session: null } });
        signInWithOtpMock.mockResolvedValue({ error: null });
        verifyOtpMock.mockResolvedValue({ data: { session: null }, error: null });
        signOutMock.mockResolvedValue({ error: null });

        const captured = [];
        render(
            <AuthProvider>
                <Consumer onValue={(v) => captured.push(v)} />
            </AuthProvider>,
        );

        await waitFor(() => expect(captured.length).toBeGreaterThan(0));
        const ctx = captured[captured.length - 1];

        await ctx.signIn('+447111111111');
        expect(signInWithOtpMock).toHaveBeenCalledWith({
            phone: '+447111111111',
            channel: 'whatsapp',
        });

        await ctx.signIn('+447111111111', 'sms');
        expect(signInWithOtpMock).toHaveBeenLastCalledWith({
            phone: '+447111111111',
            channel: 'sms',
        });

        // verifyOtp without channel hint defaults to whatsapp.
        await ctx.verifyOtp('+447111111111', '123456', { name: 'Anon' });
        expect(verifyOtpMock).toHaveBeenLastCalledWith(
            expect.objectContaining({ phone: '+447111111111', token: '123456', type: 'whatsapp' }),
        );

        // verifyOtp with channel:'sms' passes type='sms' to Supabase.
        await ctx.verifyOtp('+447111111111', '654321', { channel: 'sms' });
        expect(verifyOtpMock).toHaveBeenLastCalledWith(
            expect.objectContaining({ token: '654321', type: 'sms' }),
        );

        await ctx.signOut();
        expect(signOutMock).toHaveBeenCalledTimes(1);
    });

    it('signIn surfaces supabase errors as thrown exceptions', async () => {
        getSessionMock.mockResolvedValue({ data: { session: null } });
        signInWithOtpMock.mockResolvedValue({ error: { message: 'rate limited' } });

        const captured = [];
        render(
            <AuthProvider>
                <Consumer onValue={(v) => captured.push(v)} />
            </AuthProvider>,
        );

        await waitFor(() => expect(captured.length).toBeGreaterThan(0));
        const ctx = captured[captured.length - 1];

        await expect(ctx.signIn('+447111111111')).rejects.toMatchObject({ message: 'rate limited' });
    });
});
