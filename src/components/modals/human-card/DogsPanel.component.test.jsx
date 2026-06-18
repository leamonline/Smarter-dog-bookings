// Regression test for the "Trusted to drop off / pick up" list. A dog a
// person is trusted on is owned by someone else, so it lives under that
// owner's id in dogsByHumanId (loaded by HumanCardModal's ensureDogsForHumans
// effect) — not in the paginated `dogs` map. The panel must surface it from
// dogsByHumanId by trusted-contact id, otherwise the link shows nowhere.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DogsPanel } from "./DogsPanel.jsx";

const steve = {
  id: "steve-1",
  fullName: "Steve Hughes",
  trustedContacts: [
    { id: "natalie-1", fullName: "Natalie Hughes", relationship: "" },
  ],
  trustedIds: ["Natalie Hughes"],
};

const shelby = {
  id: "dog-shelby",
  name: "Shelby",
  breed: "Whippet",
  size: "S",
  _humanId: "natalie-1",
  humanId: "Natalie Hughes",
};

describe("DogsPanel trusted dogs", () => {
  it("lists a trusted owner's dog from dogsByHumanId under the trusted heading", () => {
    render(
      <DogsPanel
        human={steve}
        humanFullName="Steve Hughes"
        dogs={{}}
        dogsByHumanId={{ "natalie-1": [shelby] }}
        bookingsByDate={{}}
      />,
    );

    expect(screen.getByText("Shelby")).toBeInTheDocument();
    expect(screen.getByText(/Trusted to drop off/i)).toBeInTheDocument();
    // Not falsely reported as having no dogs.
    expect(screen.queryByText(/No dogs linked yet/i)).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no owned or trusted dogs", () => {
    render(
      <DogsPanel
        human={{ id: "x", fullName: "Nobody", trustedContacts: [], trustedIds: [] }}
        humanFullName="Nobody"
        dogs={{}}
        dogsByHumanId={{}}
        bookingsByDate={{}}
      />,
    );

    expect(screen.getByText(/No dogs linked yet/i)).toBeInTheDocument();
  });
});
