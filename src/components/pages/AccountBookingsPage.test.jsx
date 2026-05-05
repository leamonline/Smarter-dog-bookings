import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../../context/authContextValue';

const updateMock = vi.fn();
const bookingsThenMock = vi.fn();

const bookingsBuilder = {
    select: vi.fn(() => bookingsBuilder),
    order: vi.fn(() => bookingsBuilder),
    then: (resolve) => bookingsThenMock(resolve),
    update: (payload) => ({
        eq: (col, val) => updateMock(payload, col, val),
    }),
};

vi.mock('../../lib/supabase', () => ({
    supabase: {
        from: (table) => {
            if (table !== 'bookings') throw new Error(`unexpected table ${table}`);
            return bookingsBuilder;
        },
    },
}));

import AccountBookingsPage from './AccountBookingsPage';

const human = { id: 'h1', name: 'Jane Doe' };

const renderPage = () =>
    render(
        <AuthContext.Provider
            value={{
                session: { user: { id: 'u1' } },
                human,
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
                <AccountBookingsPage />
            </MemoryRouter>
        </AuthContext.Provider>,
    );

const today = new Date().toISOString().slice(0, 10);

describe('AccountBookingsPage', () => {
    beforeEach(() => {
        updateMock.mockReset();
        bookingsThenMock.mockReset();
    });

    it('splits bookings into Upcoming and Past sections', async () => {
        bookingsThenMock.mockImplementation((resolve) => {
            resolve({
                data: [
                    {
                        id: 'b1',
                        booking_date: '2099-12-31',
                        slot: '10:00',
                        service: 'Full Groom',
                        status: 'Not Arrived',
                        dog: { name: 'Barnaby' },
                    },
                    {
                        id: 'b2',
                        booking_date: '2000-01-01',
                        slot: '11:00',
                        service: 'Maintenance Groom',
                        status: 'Picked Up',
                        dog: { name: 'Rex' },
                    },
                ],
                error: null,
            });
        });

        renderPage();

        await waitFor(() => expect(screen.getByText(/Barnaby · Full Groom/i)).toBeInTheDocument());
        expect(screen.getByRole('heading', { name: /upcoming/i })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /past/i })).toBeInTheDocument();
        // Past row contains the maintenance booking.
        expect(screen.getByText(/Rex/)).toBeInTheDocument();
    });

    it('replaces Cancel with a "message us" link for same-day bookings', async () => {
        bookingsThenMock.mockImplementation((resolve) => {
            resolve({
                data: [
                    {
                        id: 'b1',
                        booking_date: today,
                        slot: '10:00',
                        service: 'Full Groom',
                        status: 'Not Arrived',
                        dog: { name: 'Barnaby' },
                    },
                ],
                error: null,
            });
        });

        renderPage();

        await waitFor(() => expect(screen.getByText(/Barnaby/)).toBeInTheDocument());
        expect(screen.getByRole('link', { name: /same-day changes/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^cancel$/i })).not.toBeInTheDocument();
    });

    it('cancels a future booking with a Cancelled status update after confirm', async () => {
        bookingsThenMock.mockImplementation((resolve) => {
            resolve({
                data: [
                    {
                        id: 'b1',
                        booking_date: '2099-12-31',
                        slot: '10:00',
                        service: 'Full Groom',
                        status: 'Not Arrived',
                        dog: { name: 'Barnaby' },
                    },
                ],
                error: null,
            });
        });
        updateMock.mockResolvedValue({ error: null });
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

        renderPage();

        await waitFor(() => screen.getByRole('button', { name: /^cancel$/i }));
        fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

        await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1));
        const [payload, col, val] = updateMock.mock.calls[0];
        expect(payload).toMatchObject({ status: 'Cancelled' });
        expect(col).toBe('id');
        expect(val).toBe('b1');

        confirmSpy.mockRestore();
    });

    it('does not cancel when the user clicks Cancel and dismisses the confirm dialog', async () => {
        bookingsThenMock.mockImplementation((resolve) => {
            resolve({
                data: [
                    {
                        id: 'b1',
                        booking_date: '2099-12-31',
                        slot: '10:00',
                        service: 'Full Groom',
                        status: 'Not Arrived',
                        dog: { name: 'Barnaby' },
                    },
                ],
                error: null,
            });
        });
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

        renderPage();

        await waitFor(() => screen.getByRole('button', { name: /^cancel$/i }));
        fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

        await new Promise((r) => setTimeout(r, 30));
        expect(updateMock).not.toHaveBeenCalled();

        confirmSpy.mockRestore();
    });
});
