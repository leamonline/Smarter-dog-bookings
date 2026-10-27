import { ErrorBanner } from "smarter-dog-ui";

export const Default = () => (
  <ErrorBanner title="Couldn't load appointments" message="Check your connection, then load the day again." />
);

export const WithRetry = () => (
  <ErrorBanner title="Couldn't load the dogs directory" message="Check your connection, then try again."
    retry={() => {}} retryLabel="Reload dogs" onClose={() => {}} />
);
