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

  // Regression: the marketing site is built by the combined Vercel build
  // alongside the booking app, which supplies the key under the legacy name.
  // Reading only the modern name left this client null in production -- the
  // whole Supabase import tree-shook away and every live read (open days,
  // holiday notices, salon facts) silently fell back to hardcoded defaults.
  it('creates a client from the legacy anon key when the publishable key is absent', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'legacy-anon-key');
    const { supabase } = await import('./supabaseClient');
    expect(supabase).not.toBeNull();
    expect(typeof supabase.rpc).toBe('function');
  });

  it('is still null when the url is set but neither key name is', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const { supabase } = await import('./supabaseClient');
    expect(supabase).toBeNull();
  });
});
