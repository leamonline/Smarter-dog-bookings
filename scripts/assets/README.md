# Legacy raster brand assets

These are the pre-reskin logo rasters. They are **inputs to the launch-kit
generators only** — nothing in the deployment references them, and they
deliberately do not live under `public/`, so they are neither served nor
precached onto staff devices.

They are kept because `generate-launch-kit.mjs` and
`generate-premium-launch-kit.mjs` embed them as base64 data URLs inside
generated SVG, with aspect ratios hardcoded to the *old* artwork:
`height = width / 4` for the lockup and `height = width * 1.145` for the
silhouette. The approved masters in `public/app/logos/` are 4.706:1 and 1.0928:1
respectively, so migrating the generators is not a path swap — it needs those
numbers changed and the output eyeballed. That work is outstanding; see the
brand reskin plan.

Do not use these for anything new. `public/app/logos/` holds the masters.
