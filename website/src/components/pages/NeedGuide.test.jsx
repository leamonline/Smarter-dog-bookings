import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NeedGuide from './NeedGuide';
import { linkLabelFor } from '../../content/linkLabel';
import { NEED_PAGES, SALON_FACTS_NOTE } from '../../content/needPages';

function renderPage(path) {
  const page = NEED_PAGES.find((candidate) => candidate.path === path);
  return render(
    <MemoryRouter>
      <NeedGuide page={page} />
    </MemoryRouter>,
  );
}

describe('need pages', () => {
  it('renders each approved page, its question, and the shared footer', () => {
    for (const page of NEED_PAGES) {
      const { unmount } = renderPage(page.path);
      expect(screen.getByRole('heading', { level: 1, name: page.faqs[0].name })).toBeInTheDocument();
      expect(screen.getByText(/there's no phone line/)).toBeInTheDocument();
      expect(screen.getByText(/Free street parking on Kings Road and the side streets/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '07873 329440' })).toHaveAttribute('href', 'https://wa.me/447873329440');
      unmount();
    }
    expect(SALON_FACTS_NOTE).toContain('message only, there\'s no phone line');
  });

  it('keeps the testimonials word for word, including Liam', () => {
    renderPage('/senior-blind-deaf-dog-grooming');
    expect(screen.getByText(/Sam & Liam are the best – so caring and they genuinely love the dogs they groom/)).toBeInTheDocument();
    expect(screen.getByText(/Cassie is 17 now, blind and deaf/)).toBeInTheDocument();
    expect(screen.getByText(/he would cope – but he did/)).toBeInTheDocument();
  });

  it('does not name any other grooming business', () => {
    renderPage('/independent-dog-groomer-vs-chain');
    expect(screen.getByText(/Sam & Liam are the best – so caring/)).toBeInTheDocument();
    expect(screen.getByText(/4\.9 on Google, and 500\+ reviews across all review sites/)).toBeInTheDocument();
    expect(screen.queryByText(/Pets at Home/i)).not.toBeInTheDocument();
  });

  it('gives every link visible text, including a book link whose words were stored on book', () => {
    expect(linkLabelFor({ book: 'book online' })).toBe('book online');
    expect(linkLabelFor({ text: 'book online', book: true })).toBe('book online');
    expect(linkLabelFor({ link: '/matted-coat-policy', text: 'matted coat policy' })).toBe('matted coat policy');
    expect(linkLabelFor({ href: 'https://houndsly.co.uk' })).toBe('https://houndsly.co.uk');
    expect(linkLabelFor({ book: true })).toBe('');

    for (const page of NEED_PAGES) {
      const { unmount } = renderPage(page.path);
      const links = screen.getAllByRole('link');
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        expect(link, `${page.path} ${link.getAttribute('href')}`).toHaveAccessibleName(/\S/);
      }
      unmount();
    }

    renderPage('/dog-de-shedding-ashton-under-lyne');
    const bookingLinks = screen.getAllByRole('link', { name: 'book online' });
    expect(bookingLinks.some((link) => link.getAttribute('href') === 'https://smarterdog.co.uk/book/login')).toBe(true);
  });

  it('links the matted-coat policy and names De-shed', () => {
    const { unmount } = renderPage('/doodle-grooming-matted-coats');
    expect(screen.getByRole('link', { name: 'matted coat policy' })).toHaveAttribute('href', '/matted-coat-policy');
    expect(screen.getAllByText(/from £46/).length).toBeGreaterThan(0);
    unmount();

    renderPage('/dog-de-shedding-ashton-under-lyne');
    expect(screen.getByText(/Bath & De-shed from £38/)).toBeInTheDocument();
    expect(screen.getByText(/not Ashton-in-Makerfield/)).toBeInTheDocument();
  });
});
