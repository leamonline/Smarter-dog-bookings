import { DayCard, resolveDayStatus } from "smarter-dog-ui";

const noop = () => {};

// DayCard is an <li> positioned by the stack in the real app; in isolation we
// give it a plain <ul> and let it sit in normal flow.
const Stack = ({ children }: { children: React.ReactNode }) => (
  <ul style={{ listStyle: "none", margin: 0, padding: 0, maxWidth: 420 }}>
    {children}
  </ul>
);

export const Expected = () => (
  <Stack>
    <DayCard
      id="1"
      status="Booked"
      tone={resolveDayStatus("Booked")}
      time="08:30"
      dogName="Biscuit"
      subtitle="Cockapoo · Full Groom"
      timing="Due in 20 min"
      balance={{ kind: "due", text: "£38.00" }}
      expanded={false}
      onToggle={noop}
    />
  </Stack>
);

export const ReadyOverdue = () => (
  <Stack>
    <DayCard
      id="2"
      status="Ready for collection"
      tone={resolveDayStatus("Ready for collection")}
      time="10:00"
      dogName="Mabel"
      subtitle="Cavapoo · Bath & Brush"
      timing="Ready 45 min ago"
      urgent
      readyOverdue
      balance={{ kind: "paid" }}
      onTheWay
      expanded={false}
      onToggle={noop}
    />
  </Stack>
);

export const WithSafetyNote = () => (
  <Stack>
    <DayCard
      id="3"
      status="Arrived"
      tone={resolveDayStatus("Arrived")}
      time="09:00"
      dogName="Rex"
      subtitle="German Shepherd · Bath & De-shed"
      timing="In the salon"
      safetyFacts={["Can be nervous with clippers", "Muzzle on request"]}
      balance={{ kind: "unknown" }}
      expanded={false}
      onToggle={noop}
    />
  </Stack>
);

export const Expanded = () => (
  <Stack>
    <DayCard
      id="4"
      status="Arrived"
      tone={resolveDayStatus("Arrived")}
      time="09:30"
      dogName="Luna"
      ownerName="Sarah Jennings"
      subtitle="Miniature Poodle · Full Groom"
      timing="In the salon"
      balance={{ kind: "due", text: "£42.00" }}
      expanded
      onToggle={noop}
    >
      <div style={{ paddingTop: 12, fontSize: 14, lineHeight: 1.5 }}>
        <p style={{ margin: "0 0 8px" }}>Owner: Sarah Jennings · 07700 900782</p>
        <p style={{ margin: 0 }}>
          Notes: matting behind the ears — may need scissoring.
        </p>
      </div>
    </DayCard>
  </Stack>
);

export const NoShow = () => (
  <Stack>
    <DayCard
      id="5"
      status="No-show"
      tone={resolveDayStatus("No-show")}
      time="11:30"
      dogName="Pepper"
      subtitle="Border Terrier · Puppy Groom"
      timing="Didn't arrive"
      dimmed
      expanded={false}
      onToggle={noop}
    />
  </Stack>
);
