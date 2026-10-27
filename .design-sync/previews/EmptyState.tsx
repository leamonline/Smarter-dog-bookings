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

export const NothingHereYet = () => (
  <EmptyState
    mark="dog"
    title="No dogs just yet"
    description="Add a dog and they'll appear here."
    action={<Button size="sm">Add dog</Button>}
  />
);

export const NoMatches = () => (
  <EmptyState
    title='No dogs matching "Bram"'
    description="Check the spelling, or try the owner's name or the breed."
    action={<Button size="sm" variant="ghost">Clear search</Button>}
  />
);

export const Compact = () => (
  <EmptyState size="sm" title="No dogs on file" description="Add a dog to get started." />
);
