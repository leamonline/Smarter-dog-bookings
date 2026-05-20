import { Clock3 } from "lucide-react";
import { CountBadgeCard } from "./CountBadgeCard.jsx";

export function WaitlistCard({ count = 0, onOpen, bare = false }) {
  return (
    <CountBadgeCard
      heading="Waitlist"
      icon={Clock3}
      accent="sky"
      count={count}
      singular="dog waiting"
      plural="dogs waiting"
      ariaLabel={`Waitlist, ${count} ${count === 1 ? "dog" : "dogs"} waiting — click to view`}
      onOpen={onOpen}
      bare={bare}
    />
  );
}
