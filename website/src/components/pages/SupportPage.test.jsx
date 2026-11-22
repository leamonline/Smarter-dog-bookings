import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';
import { MemoryRouter } from 'react-router-dom';
import SupportPage from './SupportPage';
import { SALON_FACTS_FALLBACK, whatsAppUrl } from '../../constants/salonFacts';

function renderPage() {
  return render(
    <MemoryRouter>
      <SupportPage />
    </MemoryRouter>,
  );
}

describe('SupportPage', () => {
  it('publishes the approved contact details from the shared salon facts', () => {
    renderPage();
    const main = within(screen.getByRole('main'));

    expect(screen.getByRole('heading', { level: 1, name: 'App support — Smarter Dog Grooming' })).toBeInTheDocument();
    expect(main.getByRole('link', { name: SALON_FACTS_FALLBACK.businessEmail })).toHaveAttribute(
      'href',
      `mailto:${SALON_FACTS_FALLBACK.businessEmail}`,
    );
    expect(main.getByRole('heading', { name: 'WhatsApp' })).toBeInTheDocument();
    const whatsApp = main.getByRole('link', { name: '07873 329440' });
    expect(whatsApp).toHaveAttribute('href', whatsAppUrl(SALON_FACTS_FALLBACK.businessPhone));
    expect(whatsApp.getAttribute('href')).toBe('https://wa.me/447873329440');
    expect(whatsApp.getAttribute('href')).not.toMatch(/^tel:/);
    expect(main.getByText(/messages only — there is no phone line/)).toBeInTheDocument();

    for (const line of ['Smarter Dog Grooming Salon', '183 Kings Road', 'Ashton-under-Lyne', 'OL6 8HD']) {
      expect(main.getByText(line)).toBeInTheDocument();
    }
  });

  it('keeps the approved account, privacy and hours wording, without a phone call or a deletion placeholder', () => {
    const { container } = renderPage();
    const main = within(screen.getByRole('main'));

    expect(main.getByText(/Monday to Wednesday, 8:30am to 3:00pm/)).toBeInTheDocument();
    expect(main.getByRole('link', { name: 'smarterdog.co.uk' })).toHaveAttribute('href', '/');
    expect(main.getByText(/keep your dogs’ details and appointments/)).toBeInTheDocument();
    expect(main.getByText(/You sign in with your mobile number and a password, or with a one-time code sent by SMS/)).toBeInTheDocument();
    expect(main.getByText('To delete your customer account, email or message us and we will help.')).toBeInTheDocument();
    expect(main.getByRole('link', { name: 'smarterdog.co.uk/privacy' })).toHaveAttribute('href', '/privacy');
    expect(main.getByText('Thank you for visiting us.')).toBeInTheDocument();

    const mainEl = screen.getByRole('main');
    expect(mainEl.innerHTML).not.toMatch(/tel:/i);
    expect(mainEl.textContent).not.toMatch(/In-app path/);
    expect(mainEl.textContent).not.toMatch(/Delete account/);
    expect(mainEl.textContent).not.toMatch(/\[/);
    for (const link of within(mainEl).getAllByRole('link')) {
      expect(link.getAttribute('href') || '').not.toMatch(/^tel:/i);
    }
    expect(screen.queryByRole('link', { name: /call/i })).not.toBeInTheDocument();
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
  });

  it('has no automatically detectable accessibility violations', async () => {
    const { container } = renderPage();
    expect(await axe(container)).toHaveNoViolations();
  });
});
