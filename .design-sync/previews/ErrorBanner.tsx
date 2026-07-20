import { ErrorBanner } from "smarter-dog-ui";

export const Default = () => (
  <ErrorBanner message="We couldn't load today's bookings — please try again." />
);

export const WithRetry = () => (
  <ErrorBanner
    title="Couldn't send that message"
    message="Check your connection and try again."
    retry={() => {}}
    onClose={() => {}}
  />
);
