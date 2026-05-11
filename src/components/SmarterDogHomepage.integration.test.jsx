import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SmarterDogHomepage from './SmarterDogHomepage';

const renderHomepage = () =>
  render(
    <MemoryRouter>
      <SmarterDogHomepage />
    </MemoryRouter>
  );

describe('SmarterDogHomepage integration', () => {
  it('renders primary homepage sections', () => {
    const { container } = renderHomepage();

    expect(container.querySelector('nav')).toBeInTheDocument();
    expect(screen.getByText(/Come scruffy/i)).toBeInTheDocument();
    expect(screen.getByText(/How we care for your dog/i)).toBeInTheDocument();
    expect(screen.getByText(/Post-groom care guides/i)).toBeInTheDocument();
    expect(screen.getByText(/Strike a pose, wet nose/i)).toBeInTheDocument();
    expect(screen.getByText(/Dogs who wouldn't go anywhere else/i)).toBeInTheDocument();
    expect(screen.getByText(/Easy To Find/i)).toBeInTheDocument();
    expect(container.querySelector('footer')).toBeInTheDocument();
  });

  it('renders trust stats', () => {
    renderHomepage();

    expect(screen.getByText('Since 1982')).toBeInTheDocument();
    expect(screen.getByText('Thousands')).toBeInTheDocument();
    expect(screen.getByText('4.9★')).toBeInTheDocument();
    expect(screen.getByText('of happy pups')).toBeInTheDocument();
  });

  it('renders key navigation links', () => {
    renderHomepage();

    expect(screen.getByRole('link', { name: 'Services' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Houndsly' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Our Approach' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'FAQ' })).toBeInTheDocument();
  });

  it('opens and closes booking modal', () => {
    renderHomepage();

    const bookButton = screen.getAllByRole('button', { name: /Book your visit/i })[0];
    fireEvent.click(bookButton);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Let's get you booked in!/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Close modal/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows contact details in footer', () => {
    renderHomepage();

    expect(screen.getByText('leam@smarterdog.co.uk')).toBeInTheDocument();
    expect(screen.getAllByText(/07507 731487/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ashton-under-Lyne').length).toBeGreaterThan(0);
    expect(screen.getByText('OL6 8HD')).toBeInTheDocument();
  });
});
