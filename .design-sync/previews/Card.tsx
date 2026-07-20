import { Card } from "smarter-dog-ui";

export const Default = () => (
  <Card>
    <div style={{ fontWeight: 700, color: "#2D004B" }}>Bella</div>
    <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
      Medium · Full Groom · Mon 08:30
    </div>
  </Card>
);

export const Interactive = () => (
  <Card interactive accent="#FECC13">
    <div style={{ fontWeight: 700, color: "#2D004B" }}>Milo</div>
    <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
      Large · Bath &amp; Brush · Tue 09:00
    </div>
  </Card>
);

export const Elevations = () => (
  <div style={{ display: "flex", gap: 16 }}>
    <Card elevation="resting" padding="compact">
      Resting
    </Card>
    <Card elevation="hover" padding="compact">
      Hover
    </Card>
  </div>
);
