import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('../customerClient', () => ({ customerSupabase: { rpc } }));
import { londonDate, useHolidayNotices } from './useHolidayNotices';
const notice = { id: 'test', notice_from: '2026-01-01', closed_from: '2026-09-01', reopens_on: '2026-09-22', phase: 'away' };
describe('verified holiday notices', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-05T12:00:00Z')); rpc.mockReset(); });
  afterEach(() => vi.useRealTimers());
  it('uses London dates across the BST midnight boundary', () => {
    expect(londonDate(new Date('2026-09-05T23:30:00Z'))).toBe('2026-09-06');
    expect(londonDate(new Date('2026-12-05T23:30:00Z'))).toBe('2026-12-05');
  });
  it('removes a stale claim when refetch fails', async () => {
    rpc.mockResolvedValueOnce({ data: [notice], error: null }).mockResolvedValue({ data: null, error: { message: 'offline' } });
    const { result } = renderHook(useHolidayNotices);
    await waitFor(() => expect(result.current).toHaveLength(1));
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(result.current).toHaveLength(0));
  });
  it('does not render notices on or after reopening or before the notice start', async () => {
    rpc.mockResolvedValue({ data: [{ ...notice, reopens_on: '2026-09-05' }, { ...notice, notice_from: '2026-09-06' }], error: null });
    const { result } = renderHook(useHolidayNotices);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(result.current).toEqual([]);
  });
});
