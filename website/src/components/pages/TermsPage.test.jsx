import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TermsPage from './TermsPage';

describe('TermsPage cancellations', () => {
  it("publishes the owner's no-show wording word for word (ADR 015)", () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>,
    );
    const main = within(screen.getByRole('main'));
    expect(main.getByRole('heading', { name: 'Cancellations & No-Shows' })).toBeInTheDocument();
    for (const line of [
      "We know life doesn't always go to plan! If you need to cancel your dog's appointment, we'd really appreciate as much notice as possible.",
      'You can cancel here any time before the day of your appointment.',
      'Cancellations on the day and missed appointments will be recorded.',
      'Repeated no-shows will require a non-refundable deposit to secure future bookings. This will be taken off the cost of the groom.',
      'Giving us a little notice means we can offer your appointment to another dog who might be waiting for a pamper.',
      'Thank you for your understanding and for supporting our little salon.',
    ]) {
      expect(main.getByText(line)).toBeInTheDocument();
    }
    expect(main.queryByText(/24 hours' notice/)).toBeNull();
    expect(main.queryByText(/case-by-case basis and must be paid/)).toBeNull();
  });
});
