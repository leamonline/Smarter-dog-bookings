import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

describe('useOpenDays', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('../lib/supabaseClient');
  });

  it('stays empty when no Supabase client is configured', async () => {
    vi.doMock('../lib/supabaseClient', () => ({ supabase: null }));
    const { useOpenDays } = await import('./useOpenDays');
    const { result } = renderHook(() => useOpenDays());
    expect(result.current).toEqual({});
  });

  it('builds an overrides map from the RPC rows once resolved', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        { setting_date: '2026-08-06', is_open: true },
        { setting_date: '2026-08-05', is_open: false },
      ],
      error: null,
    });
    vi.doMock('../lib/supabaseClient', () => ({ supabase: { rpc } }));
    const { useOpenDays } = await import('./useOpenDays');
    const { result } = renderHook(() => useOpenDays());

    expect(result.current).toEqual({});
    await waitFor(() =>
      expect(result.current).toEqual({ '2026-08-06': true, '2026-08-05': false }),
    );
    expect(rpc).toHaveBeenCalledWith('get_public_open_days');
  });

  it('stays empty when the RPC returns an error', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    vi.doMock('../lib/supabaseClient', () => ({ supabase: { rpc } }));
    const { useOpenDays } = await import('./useOpenDays');
    const { result } = renderHook(() => useOpenDays());

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(result.current).toEqual({});
  });

  it('stays empty when the RPC call throws', async () => {
    const rpc = vi.fn().mockRejectedValue(new Error('network down'));
    vi.doMock('../lib/supabaseClient', () => ({ supabase: { rpc } }));
    const { useOpenDays } = await import('./useOpenDays');
    const { result } = renderHook(() => useOpenDays());

    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(result.current).toEqual({});
  });
});
