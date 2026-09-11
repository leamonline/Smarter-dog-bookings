// The bundle-size report (rollup-plugin-visualizer) lists the site's whole
// dependency tree and every module's size. It was written into dist/, so every
// publish shipped it to a public URL — internal build detail nobody chose to
// disclose. Nothing else catches that regression: a plain build simply gains a
// file, quietly, and the deploy carries it up.
//
// These tests pin both halves of the fix in vite.config.js — the ANALYZE gate,
// and the report living outside the published output — so either one failing
// alone is a red test rather than a silent republish.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadConfig = () => import('./vite.config.js');

const pluginNames = async () => {
  const { default: config } = await loadConfig();
  return (config.plugins ?? []).flat(Infinity).filter(Boolean).map((plugin) => plugin.name);
};

describe('website build output', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('does not generate the bundle report during a plain build', async () => {
    vi.stubEnv('ANALYZE', undefined);

    expect(await pluginNames()).not.toContain('visualizer');
  });

  it('generates it when ANALYZE is set, which is what build:analyze does', async () => {
    vi.stubEnv('ANALYZE', 'true');

    expect(await pluginNames()).toContain('visualizer');
  });

  it('writes the report outside the published build output', async () => {
    const { BUNDLE_REPORT_FILE } = await loadConfig();

    expect(BUNDLE_REPORT_FILE).not.toMatch(/(^|\/)dist(\/|$)/);
  });

  it('treats only an explicit ANALYZE=true as an analysis build', async () => {
    const { isAnalyzeBuild } = await loadConfig();

    expect(isAnalyzeBuild({})).toBe(false);
    expect(isAnalyzeBuild({ ANALYZE: '' })).toBe(false);
    expect(isAnalyzeBuild({ ANALYZE: 'false' })).toBe(false);
    expect(isAnalyzeBuild({ ANALYZE: 'true' })).toBe(true);
  });
});
