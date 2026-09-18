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
   * Off by default: the stack is the screen now. This exists so that a problem
   * found in the salon can be backed out by setting one deployment variable,
   * without a revert and a redeploy, and it is expected to be removed once the
   * stack has run through a few trading days.
   */
  legacy_salon_board_enabled: import.meta.env.VITE_LEGACY_SALON_BOARD === "1",
});
