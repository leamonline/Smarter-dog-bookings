import { MetricBar } from "smarter-dog-ui";

export const Capacity = () => (
  <div style={{ maxWidth: 280 }}>
    <MetricBar
      label="This week"
      value="64%"
      caption="36 of 56 seats booked this week"
      progress={64}
      progressClassName="bg-brand-green"
    />
  </div>
);

export const Revenue = () => (
  <div style={{ maxWidth: 280 }}>
    <MetricBar
      label="Takings"
      subLabel="Mon–Wed"
      value="£1,768"
      caption="82% of a typical week"
      progress={82}
      progressClassName="bg-brand-purple"
    />
  </div>
);

export const Closed = () => (
  <div style={{ maxWidth: 280 }}>
    <MetricBar
      label="Thursday"
      value={<em>closed</em>}
      caption="No appointments — salon closed"
      progress={null}
    />
  </div>
);

export const OverTarget = () => (
  <div style={{ maxWidth: 280 }}>
    <MetricBar
      label="Today"
      value="110%"
      caption="A full house — 14 of 14 dogs booked"
      progress={110}
      progressClassName="bg-brand-mustard"
    />
  </div>
);

export const Loading = () => (
  <div style={{ maxWidth: 280 }}>
    <MetricBar label="This week" value="—" progress={null} loading />
  </div>
);
