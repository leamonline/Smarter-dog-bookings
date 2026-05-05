import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const insertMock = vi.fn();
const dogsThenMock = vi.fn();

const dogsBuilder = {
    select: vi.fn(() => dogsBuilder),
    eq: vi.fn(() => dogsBuilder),
    order: vi.fn(() => dogsBuilder),
    then: (resolve) => dogsThenMock(resolve),
};

const bookingsBuilder = {
    insert: (...args) => insertMock(...args),
};

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: (table) => {
            if (table === 'dogs') return dogsBuilder;
            if (table === 'bookings') return bookingsBuilder;
            throw new Error(`unexpected table ${table}`);
        },
    },
}));

import AuthenticatedBookingForm from './AuthenticatedBookingForm';

const human = {
    id: 'human-1',
    name: 'Jane Doe',
    phone: '07507731487',
};

const fakeDogs = [
    { id: 'dog-1', name: 'Barnaby', breed: 'Cockapoo', size: 'medium' },
    { id: 'dog-2', name: 'Rex', breed: 'Husky', size: 'large' },
];

describe('AuthenticatedBookingForm', () => {
    beforeEach(() => {
        insertMock.mockReset();
        dogsThenMock.mockReset();
        // Initial dogs load — return both dogs.
        dogsThenMock.mockImplementation((resolve) => {
            resolve({ data: fakeDogs, error: null });
            return Promise.resolve();
        });
    });

    const renderForm = () => {
        render(
            <MemoryRouter>
                <AuthenticatedBookingForm human={human} />
            </MemoryRouter>,
        );
    };

    it('uses dog_id and size from the selected dog row, not the form', async () => {
        insertMock.mockResolvedValue({ error: null });
        renderForm();

        await waitFor(() => screen.getByRole('combobox', { name: /which dog/i }));

        // Pick the LARGE dog (Rex). Size must come from the dog row.
        fireEvent.change(screen.getByRole('combobox', { name: /which dog/i }), {
            target: { value: 'dog-2' },
        });

        fireEvent.change(screen.getByLabelText(/date/i), {
            target: { value: '2099-12-31' },
        });
        fireEvent.change(screen.getByLabelText(/^time$/i), {
            target: { value: '11:00' },
        });

        fireEvent.click(screen.getByRole('button', { name: /request this slot/i }));

        await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));

        const payload = insertMock.mock.calls[0][0];
        expect(payload).toMatchObject({
            dog_id: 'dog-2',
            size: 'large',
            booking_date: '2099-12-31',
            slot: '11:00',
            service: 'Full Groom',
            addons: [],
        });
        // Defence: never send a client-supplied human_id (RLS uses joins).
        expect(payload).not.toHaveProperty('human_id');
        // Defence: never send a status — let the DB default ('Not Arrived') win.
        expect(payload).not.toHaveProperty('status');
        expect(payload).not.toHaveProperty('confirmed');
    });

    it('surfaces a capacity error from the bookings insert', async () => {
        insertMock.mockResolvedValue({ error: { message: 'Slot is full' } });
        renderForm();

        await waitFor(() => screen.getByRole('combobox', { name: /which dog/i }));
        fireEvent.change(screen.getByLabelText(/date/i), {
            target: { value: '2099-12-31' },
        });
        fireEvent.change(screen.getByLabelText(/^time$/i), {
            target: { value: '09:00' },
        });
        fireEvent.click(screen.getByRole('button', { name: /request this slot/i }));

        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent(/slot is full/i);
        });
    });

    it('refuses to submit when no slot is chosen', async () => {
        insertMock.mockResolvedValue({ error: null });
        renderForm();

        await waitFor(() => screen.getByRole('combobox', { name: /which dog/i }));
        fireEvent.change(screen.getByLabelText(/date/i), {
            target: { value: '2099-12-31' },
        });
        // Leave slot unchosen — required attribute on the select prevents
        // submit, so insert must never run.
        fireEvent.click(screen.getByRole('button', { name: /request this slot/i }));

        // No alert, no insert.
        await new Promise((r) => setTimeout(r, 30));
        expect(insertMock).not.toHaveBeenCalled();
    });
});
