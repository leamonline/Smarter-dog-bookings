import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AccountLayout from './AccountLayout';
import { AuthContext } from '../context/authContextValue';

const renderLayout = (overrides = {}) => {
    const ctx = {
        session: { user: { id: 'u1' } },
        human: { id: 'h1', name: 'Jane Doe' },
        loading: false,
        linkStatus: 'linked',
        linkError: null,
        signIn: vi.fn(),
        verifyOtp: vi.fn(),
        signOut: vi.fn().mockResolvedValue(undefined),
        refreshHuman: vi.fn(),
        ...overrides,
    };
    render(
        <AuthContext.Provider value={ctx}>
            <MemoryRouter initialEntries={['/account']}>
                <Routes>
                    <Route
                        path="/account"
                        element={
                            <AccountLayout heading="My account" subheading="hello">
                                <p>BODY CONTENT</p>
                            </AccountLayout>
                        }
                    />
                    <Route path="/" element={<div>HOME</div>} />
                </Routes>
            </MemoryRouter>
        </AuthContext.Provider>,
    );
    return ctx;
};

describe('AccountLayout', () => {
    it('renders heading, subheading and child content', () => {
        renderLayout();
        expect(screen.getByRole('heading', { name: /my account/i })).toBeInTheDocument();
        expect(screen.getByText(/hello/i)).toBeInTheDocument();
        expect(screen.getByText(/BODY CONTENT/)).toBeInTheDocument();
    });

    it('falls back to "Hi, {firstName}" when no heading is supplied', () => {
        render(
            <AuthContext.Provider
                value={{
                    session: { user: { id: 'u1' } },
                    human: { id: 'h1', name: 'Marcus Aurelius' },
                    loading: false,
                    linkStatus: 'linked',
                    linkError: null,
                    signIn: vi.fn(),
                    verifyOtp: vi.fn(),
                    signOut: vi.fn(),
                    refreshHuman: vi.fn(),
                }}
            >
                <MemoryRouter>
                    <AccountLayout>
                        <p />
                    </AccountLayout>
                </MemoryRouter>
            </AuthContext.Provider>,
        );
        expect(screen.getByRole('heading', { name: /hi, marcus/i })).toBeInTheDocument();
    });

    it('renders all four tabs', () => {
        renderLayout();
        const nav = screen.getByRole('navigation', { name: /account navigation/i });
        expect(nav).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /^profile$/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /^dogs$/i })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /^bookings$/i })).toBeInTheDocument();
    });

    it('signs out and navigates to homepage when Sign out is clicked', async () => {
        const ctx = renderLayout();
        fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
        await waitFor(() => expect(ctx.signOut).toHaveBeenCalledTimes(1));
    });
});
