import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AIConciergeSection from './AIConciergeSection';

describe('AIConciergeSection', () => {
    it('renders concierge heading and recommendation panel', () => {
        render(<AIConciergeSection onBookClick={() => { }} />);

        expect(screen.getByRole('heading', { name: /Not sure what to book/i })).toBeInTheDocument();
        expect(screen.getByText(/Suggested plan:/i)).toBeInTheDocument();
    });

    it('opens booking with concierge prefill data', () => {
        const handleBookClick = vi.fn();
        render(<AIConciergeSection onBookClick={handleBookClick} />);

        fireEvent.change(screen.getByLabelText(/Dog's name/i), { target: { value: 'Milo' } });
        fireEvent.change(screen.getByLabelText(/^Breed$/i), { target: { value: 'Golden Retriever' } });
        fireEvent.click(screen.getByRole('button', { name: 'Reduce shedding' }));
        fireEvent.click(screen.getByRole('button', { name: 'A bit nervous' }));
        fireEvent.click(screen.getByRole('button', { name: /Use this and book now/i }));

        expect(handleBookClick).toHaveBeenCalledTimes(1);
        expect(handleBookClick).toHaveBeenCalledWith(
            'AI Concierge',
            expect.objectContaining({
                prefill: expect.objectContaining({
                    dogName: 'Milo',
                    breed: 'Golden Retriever',
                    service: 'De-shedding Groom',
                    visitPlan: 'every-8-weeks',
                    preferredTimes: ['mon-am', 'tue-am'],
                }),
            })
        );
    });
});
