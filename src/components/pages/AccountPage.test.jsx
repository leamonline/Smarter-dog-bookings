import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../../context/authContextValue';

const bookingMaybeSingle = vi.fn();
const dogsHeadSelect = vi.fn();

vi.mock('../../lib/supabase', () => ({
    supabase: {
        from: (table) => {
            if (table === 'bookings') {
                const b = {
                    select: vi.fn(() => b),
                    gte: vi.fn(() => b),
                    neq: vi.fn(() => b),
                    order: vi.fn(() => b),
                    limit: vi.fn(() => b),
                    maybeSingle: () => bookingMaybeSingle(),
                };
                return b;
            }
            if (table === 'dogs') {
                return { select: () => dogsHeadSelect() };
            }
            throw new Error(`unexpected table ${table}`);
        },
    },
}));

import AccountPage from './AccountPage';

const human = { id: 'h1', name: 'Jane Doe' };

const ctxValue = {
    session: { user: { id: 'u1' } },
    human,
    loading: false,
    linkStatus: 'linked',
    linkError: null,
    signIn: vi.fn(),
    verifyOtp: vi.fn(),
    signOut: vi.fn(),
    refreshHuman: vi.fn(),
};

const renderPage = () =>
    render(
        <AuthContext.Provider value={ctxValue}>
            <MemoryRouter>
                <AccountPage />
            </MemoryRouter>
        </AuthContext.Provider>,
    );

describe('AccountPage', () => {
    beforeEach(() => {
        bookingMaybeSingle.mockReset();
        dogsHeadSelect.mockReset();
    });

    it('shows the next upcoming booking when one exists', async () => {
        bookingMaybeSingle.mockResolvedValue({
            data: {
                id: 'b1',
                booking_date: '2099-12-31',
                slot: '10:00',
                service: 'Full Groom',
                status: 'Not Arrived',
                dog: { name: 'Barnaby', breed: 'Cockapoo' },
            },
            error: null,
        });
        dogsHeadSelect.mockResolvedValue({ count: 2, error: null });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText(/Barnaby/)).toBeInTheDocument();
        });
        expect(screen.getByText(/Full Groom/)).toBeInTheDocument();
        expect(screen.getByText(/10:00/)).toBeInTheDocument();
    });

    it('falls back to a "book one now" prompt when there is no next booking', async () => {
        bookingMaybeSingle.mockResolvedValue({ data: null, error: null });
        dogsHeadSelect.mockResolvedValue({ count: 0, error: null });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText(/no upcoming visits/i)).toBeInTheDocument();
        });
        expect(screen.getByRole('link', { name: /book one now/i })).toBeInTheDocument();
    });

    it('renders the dog count from the head:true select', async () => {
        bookingMaybeSingle.mockResolvedValue({ data: null, error: null });
        dogsHeadSelect.mockResolvedValue({ count: 3, error: null });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText('3')).toBeInTheDocument();
        });
        expect(screen.getByText(/Dogs on file/)).toBeInTheDocument();
    });
});
