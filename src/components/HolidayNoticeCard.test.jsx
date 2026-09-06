import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';

const notice = { id: 'h1', notice_from: '2026-01-01', closed_from: '2026-09-14', reopens_on: '2026-09-22', phase: 'upcoming' };

describe('HolidayNoticeCard', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('../lib/supabaseClient');
  });

  it('renders nothing without a verified notice', async () => {
    vi.doMock('../lib/supabaseClient', () => ({ supabase: { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) } }));
    const { default: HolidayNoticeCard } = await import('./HolidayNoticeCard');
    const { container } = render(<HolidayNoticeCard onBookClick={() => {}} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('shows the upcoming holiday with a heading, the dates and a booking action', async () => {
    const onBookClick = vi.fn();
    vi.doMock('../lib/supabaseClient', () => ({ supabase: { rpc: vi.fn().mockResolvedValue({ data: [notice], error: null }) } }));
    const { default: HolidayNoticeCard } = await import('./HolidayNoticeCard');
    const { container } = render(<HolidayNoticeCard onBookClick={onBookClick} />);

    expect(await screen.findByRole('heading', { name: 'Upcoming holiday' })).toBeInTheDocument();
    expect(screen.getByText(/closed from Monday, 14 September 2026/)).toBeInTheDocument();
    expect(screen.getByText(/We reopen on Tuesday, 22 September 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Book for our return' }));
    expect(onBookClick).toHaveBeenCalledWith('Holiday Notice');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('switches to the away wording during the closure', async () => {
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
    vi.doMock('../lib/supabaseClient', () => ({ supabase: { rpc: vi.fn().mockResolvedValue({ data: [notice], error: null }) } }));
    const { default: HolidayNoticeCard } = await import('./HolidayNoticeCard');
    render(<HolidayNoticeCard onBookClick={() => {}} />);
    expect(await screen.findByRole('heading', { name: 'We’re taking a little break' })).toBeInTheDocument();
    expect(screen.queryByText(/closed from/)).not.toBeInTheDocument();
  });
});
