import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { SALON_FACTS_FALLBACK } from '../constants/salonFacts';

describe('useSalonFacts', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('../lib/supabaseClient');
  });

  it('stays on the fallback when no Supabase client is configured', async () => {
    vi.doMock('../lib/supabaseClient', () => ({ supabase: null }));
    const { useSalonFacts } = await import('./useSalonFacts');
    const { result } = renderHook(() => useSalonFacts());
    expect(result.current).toEqual(SALON_FACTS_FALLBACK);
  });

  it('swaps in live data once the RPC resolves', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        business_name: 'Live Salon',
        business_phone: '+447700900000',
        business_email: 'live@example.com',
        business_address: '1 Live Street',
        business_hours: { Monday: { open: '09:00', close: '17:00', closed: false } },
        closures: [{ date: '2026-12-25', label: 'Christmas' }],
      },
      error: null,
    });
    const rpc = vi.fn().mockReturnValue({ maybeSingle });
    vi.doMock('../lib/supabaseClient', () => ({ supabase: { rpc } }));
    const { useSalonFacts } = await import('./useSalonFacts');
    const { result } = renderHook(() => useSalonFacts());

    expect(result.current).toEqual(SALON_FACTS_FALLBACK);
    await waitFor(() => expect(result.current.businessName).toBe('Live Salon'));
    expect(result.current.businessPhone).toBe('+447700900000');
    expect(result.current.businessAddress).toBe('1 Live Street');
    expect(rpc).toHaveBeenCalledWith('get_public_salon_facts');
  });

  it('falls back per-field when the response is missing or malformed values', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { business_name: 'Live Salon', business_hours: {}, closures: 'not-an-array' },
      error: null,
    });
    const rpc = vi.fn().mockReturnValue({ maybeSingle });
    vi.doMock('../lib/supabaseClient', () => ({ supabase: { rpc } }));
    const { useSalonFacts } = await import('./useSalonFacts');
    const { result } = renderHook(() => useSalonFacts());

    await waitFor(() => expect(result.current.businessName).toBe('Live Salon'));
    expect(result.current.businessPhone).toBe(SALON_FACTS_FALLBACK.businessPhone);
    expect(result.current.businessHours).toEqual(SALON_FACTS_FALLBACK.businessHours);
    expect(result.current.closures).toEqual(SALON_FACTS_FALLBACK.closures);
  });

  it('stays on the fallback when the RPC returns an error', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    const rpc = vi.fn().mockReturnValue({ maybeSingle });
    vi.doMock('../lib/supabaseClient', () => ({ supabase: { rpc } }));
    const { useSalonFacts } = await import('./useSalonFacts');
    const { result } = renderHook(() => useSalonFacts());

    await waitFor(() => expect(maybeSingle).toHaveBeenCalled());
    expect(result.current).toEqual(SALON_FACTS_FALLBACK);
  });

  it('stays on the fallback when the RPC call throws', async () => {
    const maybeSingle = vi.fn().mockRejectedValue(new Error('network down'));
    const rpc = vi.fn().mockReturnValue({ maybeSingle });
    vi.doMock('../lib/supabaseClient', () => ({ supabase: { rpc } }));
    const { useSalonFacts } = await import('./useSalonFacts');
    const { result } = renderHook(() => useSalonFacts());

    await waitFor(() => expect(maybeSingle).toHaveBeenCalled());
    expect(result.current).toEqual(SALON_FACTS_FALLBACK);
  });
});
