import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ServicesPage from './ServicesPage';

const renderPage = () =>
  render(
    <MemoryRouter>
      <ServicesPage />
    </MemoryRouter>
  );

describe('ServicesPage', () => {
  it('renders heading and intro copy', () => {
    renderPage();

    expect(screen.getByText(/How we look after your dog/i)).toBeInTheDocument();
    expect(screen.getByText(/Calm, careful grooming/i)).toBeInTheDocument();
  });

  it('renders pricing tier cards', () => {
    renderPage();

    expect(screen.getByText('Full Groom')).toBeInTheDocument();
    expect(screen.getByText('Maintenance Groom')).toBeInTheDocument();
    expect(screen.getByText('De-shedding Groom')).toBeInTheDocument();
  });

  it('renders process timeline section', () => {
    renderPage();

    expect(screen.getByText(/What to expect on the day/i)).toBeInTheDocument();
    expect(screen.getByText(/We take things at your dog's pace/i)).toBeInTheDocument();
  });
});
