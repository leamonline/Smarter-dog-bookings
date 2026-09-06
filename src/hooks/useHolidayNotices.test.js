import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const notice = { id: 'h1', notice_from: '2026-01-01', closed_from: '2026-09-01', reopens_on: '2026-09-22', phase: 'away' };

describe('useHolidayNotices', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.doUnmock('../lib/supabaseClient');
  });

  it('returns nothing when no Supabase client is configured', async () => {
    vi.doMock('../lib/supabaseClient', () => ({ supabase: null }));
    const { useHolidayNotices } = await import('./useHolidayNotices');
    const { result } = renderHook(() => useHolidayNotices());
    expect(result.current).toEqual([]);
  });

  it('shows a verified notice with the phase for today', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [notice], error: null });
    vi.doMock('../lib/supabaseClient', () => ({ supabase: { rpc } }));
    const { useHolidayNotices } = await import('./useHolidayNotices');
    const { result } = renderHook(() => useHolidayNotices());
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0].phase).toBe('away');
    expect(rpc).toHaveBeenCalledWith('get_public_holiday_notices');
  });

  it('removes a stale claim when a refetch on focus fails', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [notice], error: null })
      .mockResolvedValue({ data: null, error: { message: 'offline' } });
    vi.doMock('../lib/supabaseClient', () => ({ supabase: { rpc } }));
    const { useHolidayNotices } = await import('./useHolidayNotices');
    const { result } = renderHook(() => useHolidayNotices());
    await waitFor(() => expect(result.current).toHaveLength(1));
    act(() => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(result.current).toHaveLength(0));
  });

  it('never shows a notice before its start or on/after reopening, whatever the server said', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ ...notice, reopens_on: '2026-09-05' }, { ...notice, id: 'h2', notice_from: '2026-09-06' }],
      error: null,
    });
    vi.doMock('../lib/supabaseClient', () => ({ supabase: { rpc } }));
    const { useHolidayNotices } = await import('./useHolidayNotices');
    const { result } = renderHook(() => useHolidayNotices());
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });
});
