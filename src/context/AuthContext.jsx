import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { AuthContext } from './authContextValue';

export { AuthContext };

const initialState = {
    session: null,
    human: null,
    linkStatus: null,
    loading: true,
    linkError: null,
};

export function AuthProvider({ children }) {
    const [state, setState] = useState(initialState);
    // Guard against duplicate link RPC calls when SIGNED_IN fires more than once
    // (session restore, tab focus, refresh).
    const linkingRef = useRef(false);
    const linkedUserIdRef = useRef(null);

    const linkOrCreateHuman = useCallback(async (session, hints = {}) => {
        if (!session?.user) return;
        if (linkingRef.current) return;
        if (linkedUserIdRef.current === session.user.id) return;

        linkingRef.current = true;
        try {
            // Both "+447..." and "447..." normalise correctly server-side via the
            // shared regex; pass whichever we have.
            const phone = hints.phone || session.user.phone || '';
            const { data, error } = await supabase.rpc('link_or_create_customer_human', {
                p_phone: phone,
                p_name: hints.name ?? null,
                p_email: hints.email ?? session.user.email ?? null,
            });

            if (error) {
                setState((prev) => ({
                    ...prev,
                    loading: false,
                    linkError: error.message,
                }));
                return;
            }

            linkedUserIdRef.current = session.user.id;
            setState((prev) => ({
                ...prev,
                human: data?.human ?? null,
                linkStatus: data?.status ?? null,
                linkError: null,
                loading: false,
            }));
        } catch (err) {
            setState((prev) => ({
                ...prev,
                loading: false,
                linkError: err.message ?? 'Failed to link account',
            }));
        } finally {
            linkingRef.current = false;
        }
    }, []);

    useEffect(() => {
        let active = true;

        supabase.auth.getSession().then(({ data }) => {
            if (!active) return;
            const session = data.session ?? null;
            setState((prev) => ({ ...prev, session, loading: Boolean(session) }));
            if (session) linkOrCreateHuman(session);
            else setState((prev) => ({ ...prev, loading: false }));
        });

        const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
            if (!active) return;
            if (event === 'SIGNED_OUT') {
                linkedUserIdRef.current = null;
                setState({ ...initialState, loading: false });
                return;
            }
            setState((prev) => ({ ...prev, session: session ?? null }));
            if (session) linkOrCreateHuman(session);
        });

        return () => {
            active = false;
            subscription.subscription.unsubscribe();
        };
    }, [linkOrCreateHuman]);

    const refreshHuman = useCallback(async () => {
        if (!state.session) return;
        const { data } = await supabase
            .from('humans')
            .select('*')
            .eq('customer_user_id', state.session.user.id)
            .maybeSingle();
        if (data) setState((prev) => ({ ...prev, human: data }));
    }, [state.session]);

    const signIn = useCallback(async (phoneE164, channel = 'sms') => {
        const { error } = await supabase.auth.signInWithOtp({ phone: phoneE164, channel });
        if (error) throw error;
    }, []);

    const verifyOtp = useCallback(async (phoneE164, code, hints = {}) => {
        // type must match the channel the OTP was actually delivered on,
        // otherwise Supabase rejects with token mismatch.
        const type = hints.channel === 'whatsapp' ? 'whatsapp' : 'sms';
        const { data, error } = await supabase.auth.verifyOtp({
            phone: phoneE164,
            token: code,
            type,
        });
        if (error) throw error;
        if (data.session) await linkOrCreateHuman(data.session, hints);
        return data;
    }, [linkOrCreateHuman]);

    const signOut = useCallback(async () => {
        await supabase.auth.signOut();
    }, []);

    const value = useMemo(
        () => ({
            session: state.session,
            human: state.human,
            linkStatus: state.linkStatus,
            linkError: state.linkError,
            loading: state.loading,
            signIn,
            verifyOtp,
            signOut,
            refreshHuman,
        }),
        [state, signIn, verifyOtp, signOut, refreshHuman],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
