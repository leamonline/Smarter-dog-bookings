import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('supabaseClient', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is null when the Supabase env vars are not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    const { supabase } = await import('./supabaseClient');
    expect(supabase).toBeNull();
  });

  it('creates a real client when both env vars are configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');
    const { supabase } = await import('./supabaseClient');
    expect(supabase).not.toBeNull();
    expect(typeof supabase.rpc).toBe('function');
  });
});
