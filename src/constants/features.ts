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
});
