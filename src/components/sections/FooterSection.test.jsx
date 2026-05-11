import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FooterSection from './FooterSection';

const renderFooter = () =>
  render(
    <MemoryRouter>
      <FooterSection />
    </MemoryRouter>
  );

describe('FooterSection', () => {
  it('renders logo and business description', () => {
    renderFooter();

    expect(screen.getByAltText('Smarter Dog Grooming Salon')).toBeInTheDocument();
    expect(screen.getByText(/Over 40 years of happy dogs/i)).toBeInTheDocument();
  });

  it('renders opening hours and address', () => {
    renderFooter();

    expect(screen.getByRole('heading', { name: 'Opening hours' })).toBeInTheDocument();
    expect(screen.getByText('Mon–Wed')).toBeInTheDocument();
    expect(screen.getByText('Thu–Sun')).toBeInTheDocument();
    expect(screen.getByText('183 Kings Road')).toBeInTheDocument();
    expect(screen.getByText('OL6 8HD')).toBeInTheDocument();
  });

  it('renders contact methods', () => {
    renderFooter();

    expect(screen.getByRole('link', { name: 'leam@smarterdog.co.uk' })).toHaveAttribute('href', 'mailto:leam@smarterdog.co.uk');
    expect(screen.getByRole('link', { name: /Message 07507 731487/i })).toHaveAttribute('href', 'sms:07507731487');
    expect(screen.getByRole('link', { name: /WhatsApp Available/i })).toHaveAttribute('href', 'https://wa.me/447507731487');
  });

  it('renders legal links', () => {
    renderFooter();

    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Matted coats' })).toHaveAttribute('href', '/matted-coat-policy');
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
  });
});
