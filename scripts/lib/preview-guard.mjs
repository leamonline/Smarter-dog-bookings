// Which data a Vercel build is allowed to bake in (#875).
//
// VITE_ values are fixed at build time. Preview requires sample mode and
// both child builds must drop hosted Supabase bindings. The customer and
// marketing clients initialise separately from the staff sample-data switch.

/** Returns an error message for a forbidden combination, or null when the build may proceed. */
export function previewDataGuard(env) {
  const vercelEnv = env.VERCEL_ENV;
  const offline = env.VITE_FORCE_OFFLINE === "1";
  if (vercelEnv === "preview" && !offline) {
    // Say what the build actually saw: an unset variable and a wrong value
    // ("true", " 1", a quoted "1") need different fixes. Not a secret.
    const seen =
      env.VITE_FORCE_OFFLINE === undefined
        ? "VITE_FORCE_OFFLINE is not set for this build"
        : `VITE_FORCE_OFFLINE is ${JSON.stringify(env.VITE_FORCE_OFFLINE)}, not "1"`;
    return (
      `Refusing to build a Vercel PREVIEW that would connect to production data (${seen}). ` +
      "Set VITE_FORCE_OFFLINE=1 on the Preview environment (Project Settings → " +
      "Environment Variables, Preview only). See #875."
    );
  }
  if (vercelEnv === "preview" && env.SKIP_BUILDS) {
    return "Refusing to reuse existing build output for a Vercel PREVIEW. Build both apps with the Preview environment.";
  }
  if (vercelEnv === "production" && offline) {
    return (
      "Refusing to build PRODUCTION with VITE_FORCE_OFFLINE=1 — the live app would " +
      "serve sample data. Remove the variable from the Production environment. See #875."
    );
  }
  return null;
}


// Set empty values so Vite cannot pick up inherited bindings or .env values.
// This covers the staff, customer and marketing clients in both builds.
export function combinedBuildEnvironment(env) {
  if (env.VERCEL_ENV !== "preview") return env;

  return {
    ...env,
    VITE_SUPABASE_URL: "",
    VITE_SUPABASE_PUBLISHABLE_KEY: "",
    VITE_SUPABASE_ANON_KEY: "",
  };
}
