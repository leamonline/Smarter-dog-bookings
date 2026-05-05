import { createContext } from 'react';

export const defaultAuthValue = {
    session: null,
    human: null,
    linkStatus: null,
    linkError: null,
    loading: false,
    signIn: async () => {},
    verifyOtp: async () => {},
    signOut: async () => {},
    refreshHuman: async () => {},
};

export const AuthContext = createContext(defaultAuthValue);
