import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import { AuthContext } from '../context/authContextValue';

const renderAt = (path, ctxValue) =>
    render(
        <AuthContext.Provider value={ctxValue}>
            <MemoryRouter initialEntries={[path]}>
                <Routes>
                    <Route
                        path="/account"
                        element={
                            <ProtectedRoute>
                                <div>SECRET CONTENT</div>
                            </ProtectedRoute>
                        }
                    />
                    <Route path="/login" element={<div>LOGIN PAGE</div>} />
                </Routes>
            </MemoryRouter>
        </AuthContext.Provider>,
    );

describe('ProtectedRoute', () => {
    it('redirects to /login when there is no session', () => {
        renderAt('/account', {
            session: null,
            human: null,
            loading: false,
            linkStatus: null,
            linkError: null,
            signIn: async () => {},
            verifyOtp: async () => {},
            signOut: async () => {},
            refreshHuman: async () => {},
        });
        expect(screen.getByText(/LOGIN PAGE/)).toBeInTheDocument();
        expect(screen.queryByText(/SECRET CONTENT/)).not.toBeInTheDocument();
    });

    it('renders children when a session exists', () => {
        renderAt('/account', {
            session: { user: { id: 'u1' } },
            human: { id: 'h1', name: 'Jane' },
            loading: false,
            linkStatus: 'linked',
            linkError: null,
            signIn: async () => {},
            verifyOtp: async () => {},
            signOut: async () => {},
            refreshHuman: async () => {},
        });
        expect(screen.getByText(/SECRET CONTENT/)).toBeInTheDocument();
    });

    it('renders the loading spinner while auth is resolving', () => {
        renderAt('/account', {
            session: null,
            human: null,
            loading: true,
            linkStatus: null,
            linkError: null,
            signIn: async () => {},
            verifyOtp: async () => {},
            signOut: async () => {},
            refreshHuman: async () => {},
        });
        expect(screen.getByText(/Loading/i)).toBeInTheDocument();
        expect(screen.queryByText(/SECRET CONTENT/)).not.toBeInTheDocument();
        expect(screen.queryByText(/LOGIN PAGE/)).not.toBeInTheDocument();
    });
});
