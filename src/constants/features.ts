/**
 * Staff-dashboard feature flags.
 *
 * Booking Desk is deliberately on in development so the read-only pilot can
 * be reviewed with the offline sample data. Production stays fail-closed until
 * VITE_BOOKING_WORKSPACE_ENABLED=1 is set on the deployment.
 */
export const FEATURE_FLAGS = Object.freeze({
  booking_workspace_enabled:
    import.meta.env.DEV || import.meta.env.VITE_BOOKING_WORKSPACE_ENABLED === "1",

  /**
   * Render the previous four-zone salon board on `/today` instead of the
   * time-ordered stack that replaced it.
   *
   * Off by default: the stack is the screen now. It exists so a problem found
   * in the salon can be backed out without reverting the code, and is expected
   * to be removed once the stack has run through a few trading days.
   *
   * IT IS A BUILD-TIME FLAG AND NEEDS A REDEPLOY. Vite inlines every
   * `import.meta.env.VITE_*` constant into the bundle, so setting the variable
   * in Vercel changes nothing on its own — the project has to be rebuilt for
   * the new value to reach a browser, and staff have to reload past a precached
   * service worker after that. Budget a few minutes and someone with Vercel
   * access, not seconds.
   *
   * An earlier version of this comment said it could be flipped "without a
   * revert and a redeploy". Only the first half was true. The full procedure is
   * in docs/today-command-centre.md; when the salon is mid-service and the
   * screen is wrong, an instant Vercel rollback to the previous deployment is
   * the faster path.
   */
  legacy_salon_board_enabled: import.meta.env.VITE_LEGACY_SALON_BOARD === "1",
});
