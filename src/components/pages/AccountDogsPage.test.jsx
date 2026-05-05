import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../../context/authContextValue';

const insertMock = vi.fn();
const dogsThenMock = vi.fn();

const dogsBuilder = {
    select: vi.fn(() => dogsBuilder),
    eq: vi.fn(() => dogsBuilder),
    order: vi.fn(() => dogsBuilder),
    then: (resolve) => dogsThenMock(resolve),
    insert: (...args) => insertMock(...args),
};

vi.mock('../../lib/supabase', () => ({
    supabase: {
        from: (table) => {
            if (table !== 'dogs') throw new Error(`unexpected table ${table}`);
            return dogsBuilder;
        },
    },
}));

import AccountDogsPage from './AccountDogsPage';

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
                <AccountDogsPage />
            </MemoryRouter>
        </AuthContext.Provider>,
    );

describe('AccountDogsPage', () => {
    beforeEach(() => {
        insertMock.mockReset();
        dogsThenMock.mockReset();
    });

    it('lists the customer\'s dogs', async () => {
        dogsThenMock.mockImplementation((resolve) => {
            resolve({
                data: [
                    { id: 'd1', name: 'Barnaby', breed: 'Cockapoo', size: 'medium', age: '4 years', alerts: [] },
                    { id: 'd2', name: 'Rex', breed: 'Husky', size: 'large', alerts: ['anxious at clippers'] },
                ],
                error: null,
            });
        });

        renderPage();

        await waitFor(() => expect(screen.getByText('Barnaby')).toBeInTheDocument());
        expect(screen.getByText('Rex')).toBeInTheDocument();
        expect(screen.getByText(/anxious at clippers/i)).toBeInTheDocument();
    });

    it('shows an empty state when there are no dogs on file', async () => {
        dogsThenMock.mockImplementation((resolve) => {
            resolve({ data: [], error: null });
        });

        renderPage();

        await waitFor(() => {
            expect(screen.getByText(/no dogs on file/i)).toBeInTheDocument();
        });
    });

    it('inserts a new dog with the customer\'s human_id when "Add a dog" is submitted', async () => {
        dogsThenMock.mockImplementation((resolve) => {
            resolve({ data: [], error: null });
        });
        insertMock.mockResolvedValue({ error: null });

        renderPage();

        await waitFor(() => screen.getByRole('button', { name: /\+ add a dog/i }));
        fireEvent.click(screen.getByRole('button', { name: /\+ add a dog/i }));

        fireEvent.change(screen.getByPlaceholderText(/^name$/i), { target: { value: 'Pip' } });
        fireEvent.change(screen.getByPlaceholderText(/^breed$/i), { target: { value: 'Border Terrier' } });
        fireEvent.click(screen.getByRole('button', { name: /save dog/i }));

        await waitFor(() => expect(insertMock).toHaveBeenCalledTimes(1));
        const payload = insertMock.mock.calls[0][0];
        expect(payload).toMatchObject({
            name: 'Pip',
            breed: 'Border Terrier',
            size: 'medium',
            human_id: 'h1',
        });
    });

    it('blocks submission until name and breed are filled in', async () => {
        dogsThenMock.mockImplementation((resolve) => {
            resolve({ data: [], error: null });
        });

        renderPage();

        await waitFor(() => screen.getByRole('button', { name: /\+ add a dog/i }));
        fireEvent.click(screen.getByRole('button', { name: /\+ add a dog/i }));

        // Use submit so HTML5 required="" doesn't short-circuit.
        fireEvent.submit(screen.getByRole('button', { name: /save dog/i }).closest('form'));

        // Insert should never be called — required fields are empty.
        await new Promise((r) => setTimeout(r, 30));
        expect(insertMock).not.toHaveBeenCalled();
    });
});
