import { EmptyState, Button } from "smarter-dog-ui";

export const Default = () => (
  <EmptyState
    icon="🐾"
    title="No bookings yet"
    description="New bookings for this week will show up here."
  />
);

export const WithAction = () => (
  <EmptyState
    icon="📭"
    title="Inbox is empty"
    description="You're all caught up — new WhatsApp messages will appear here."
    action={<Button size="sm">Refresh</Button>}
  />
);

export const Compact = () => (
  <EmptyState size="sm" title="No dogs on file" description="Add a dog to get started." />
);
