import { MenuItem } from "smarter-dog-ui";

const noop = () => {};

const Menu = ({ children }: { children: React.ReactNode }) => (
  <div
    role="menu"
    style={{ width: 220, padding: "4px 0", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 }}
  >
    {children}
  </div>
);

export const Default = () => (
  <Menu>
    <MenuItem onClick={noop}>Edit details</MenuItem>
    <MenuItem onClick={noop}>Copy phone number</MenuItem>
    <MenuItem onClick={noop} disabled>Merge (needs two records)</MenuItem>
  </Menu>
);

export const WithDangerRow = () => (
  <Menu>
    <MenuItem onClick={noop}>Move booking</MenuItem>
    <MenuItem tone="danger" onClick={noop}>Cancel booking</MenuItem>
  </Menu>
);
