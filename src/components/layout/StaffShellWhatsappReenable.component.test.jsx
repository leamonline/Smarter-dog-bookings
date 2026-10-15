// The app wiring behind "Switch WhatsApp back on": after a re-enable, the
// profile card and the inbox both hand the switched-on record ids to
// useHumans' cache patch. Each hop is an optional call (`?.`), so a dropped
// prop fails silently; these pin the two hops in the shell.
import { Suspense } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ humanCard: null, inbox: null }));

vi.mock("../modals/HumanCardModal.jsx", () => ({
  HumanCardModal: (props) => {
    captured.humanCard = props;
    return <div>Profile card</div>;
  },
}));

vi.mock("../views/inbox/InboxView.jsx", () => ({
  InboxView: (props) => {
    captured.inbox = props;
    return <div>Inbox</div>;
  },
}));

const { StaffModals } = await import("./StaffModals.jsx");
const { StaffRoutes } = await import("./StaffRoutes.jsx");

const markWhatsappReenabled = vi.fn();
const data = {
  humansApi: { markWhatsappReenabled },
  dogsApi: {},
  bookingsApi: {},
  configApi: {},
  loadErrors: {},
};

describe("staff shell: WhatsApp re-enable wiring", () => {
  it("StaffModals hands the profile card useHumans' cache patch", async () => {
    render(
      <StaffModals
        data={data}
        nav={{}}
        modals={{ selectedHumanId: "human-1" }}
        session={{}}
        ui={{ pathname: "/humans/human-1" }}
      />,
    );
    expect(await screen.findByText("Profile card")).toBeInTheDocument();
    expect(captured.humanCard.humanId).toBe("human-1");
    expect(captured.humanCard.onWhatsappReenabled).toBe(markWhatsappReenabled);
  });

  it("StaffRoutes hands the inbox useHumans' cache patch", async () => {
    const onOpenHuman = vi.fn();
    render(
      <MemoryRouter initialEntries={["/inbox"]}>
        <Suspense fallback={null}>
          <StaffRoutes data={data} nav={{}} ui={{ onOpenHuman, onOpenDog: vi.fn() }} />
        </Suspense>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Inbox")).toBeInTheDocument();
    expect(captured.inbox.onWhatsappReenabled).toBe(markWhatsappReenabled);
    expect(captured.inbox.onOpenHuman).toBe(onOpenHuman);
  });
});
