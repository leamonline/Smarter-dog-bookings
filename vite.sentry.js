import { globSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { sentryVitePlugin } from "@sentry/vite-plugin";

/**
 * Sentry release tagging and source-map upload (#994).
 *
 * Everything here is off unless SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT
 * and a release name are ALL present, which in practice means the Vercel
 * Production build. A preview, a local build, CI and E2E carry none of them, so
 * they build exactly as before, with no maps and no network call.
 *
 * Two promises the rest of the system leans on:
 *  - Visitors never receive a .map file. Maps are generated "hidden" (no
 *    sourceMappingURL comment in the bundle) and then deleted from dist/ by
 *    `removeSourceMaps`, whether or not the upload worked.
 *  - Sentry being unreachable never fails a deploy. Upload errors are warnings.
 */

export function resolveSentryBuild(env = process.env) {
  const release = env.VITE_SENTRY_RELEASE || env.VERCEL_GIT_COMMIT_SHA || "";
  const { SENTRY_AUTH_TOKEN: authToken, SENTRY_ORG: org, SENTRY_PROJECT: project } = env;
  const upload = Boolean(authToken && org && project && release);

  return {
    release,
    upload,
    sourcemap: upload ? "hidden" : false,
    plugins: upload
      ? [
          sentryVitePlugin({
            org,
            project,
            authToken,
            // Only for a region-pinned or self-hosted install; an org auth
            // token normally carries its own region.
            ...(env.SENTRY_URL ? { url: env.SENTRY_URL } : {}),
            telemetry: false,
            release: { name: release },
            sourcemaps: { filesToDeleteAfterUpload: ["dist/**/*.map"] },
            errorHandler: (error) => {
              console.warn(`[sentry] source map upload did not complete: ${error?.message ?? error}`);
            },
          }),
          removeSourceMaps(),
        ]
      : [],
  };
}

/**
 * Belt and braces behind the Sentry plugin's own deletion: if an upload fails
 * and the error handler swallows it, the maps would otherwise stay in dist/ and
 * be deployed. Runs on closeBundle, after every writeBundle hook has finished.
 */
export function removeSourceMaps(dir = "dist") {
  return {
    name: "smarterdog-remove-source-maps",
    apply: "build",
    enforce: "post",
    closeBundle() {
      const root = resolve(dir);
      for (const file of globSync("**/*.map", { cwd: root })) {
        rmSync(resolve(root, file), { force: true });
      }
    },
  };
}
