import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  available: true,
  enabledArg: undefined,
  team: {
    members: null,
    loading: false,
    loadError: "",
    reload: () => {},
    invite: () => {},
  },
}));

vi.mock("../../../supabase/hooks/useStaffTeam", () => ({
  isTeamBackendAvailable: () => state.available,
  useStaffTeam: (enabled) => {
    state.enabledArg = enabled;
    return state.team;
  },
}));

import { TeamSettings } from "./TeamSettings.jsx";

const owner = { id: "s-owner", role: "owner", display_name: "Leam" };
const staff = { id: "s-staff", role: "staff", display_name: "Sam" };

const members = [
  { id: "s-owner", userId: "u1", role: "owner", displayName: "Leam", createdAt: "2026-01-01" },
  { id: "s-staff", userId: "u2", role: "staff", displayName: "Sam", createdAt: "2026-02-01" },
];

async function fill(user, { name = "Alex Jones", email = "alex@example.com" } = {}) {
  await user.type(screen.getByLabelText("Name"), name);
  await user.type(screen.getByLabelText("Email address"), email);
}

beforeEach(() => {
  state.available = true;
  state.enabledArg = undefined;
  state.team = {
    members,
    loading: false,
    loadError: "",
    reload: vi.fn(),
    invite: vi.fn().mockResolvedValue({ ok: true }),
  };
});

describe("TeamSettings", () => {
  it("shows a non-owner a notice and no form, and never loads the team", () => {
    render(<TeamSettings staffProfile={staff} />);

    expect(screen.getByText(/only an owner can add staff/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send invite/i })).not.toBeInTheDocument();
    expect(state.enabledArg).toBe(false);
  });

  it("shows an owner the form and the current team, marking who is who", () => {
    render(<TeamSettings staffProfile={owner} />);

    expect(state.enabledArg).toBe(true);
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Role")).toHaveValue("staff");

    const list = screen.getByRole("list");
    expect(within(list).getByText("Leam")).toBeInTheDocument();
    expect(within(list).getByText("You")).toBeInTheDocument();
    expect(within(list).getByText("Sam")).toBeInTheDocument();
    expect(within(list).getByText("Owner")).toBeInTheDocument();
    expect(within(list).getByText("Staff")).toBeInTheDocument();
  });

  it("asks for a name and a valid email before sending anything", async () => {
    const user = userEvent.setup();
    render(<TeamSettings staffProfile={owner} />);

    await user.click(screen.getByRole("button", { name: /send invite/i }));
    expect(screen.getByText("Enter their name")).toBeInTheDocument();
    expect(screen.getByText("Enter their email address")).toBeInTheDocument();

    await fill(user, { name: "Alex", email: "not-an-email" });
    await user.click(screen.getByRole("button", { name: /send invite/i }));
    expect(screen.getByText("That email doesn't look right")).toBeInTheDocument();
    expect(state.team.invite).not.toHaveBeenCalled();
  });

  it("sends a staff invite with trimmed values, then confirms and clears the form", async () => {
    const user = userEvent.setup();
    render(<TeamSettings staffProfile={owner} />);

    await fill(user, { name: "  Alex Jones  ", email: "  alex@example.com " });
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    expect(state.team.invite).toHaveBeenCalledTimes(1);
    expect(state.team.invite).toHaveBeenCalledWith({
      email: "alex@example.com",
      displayName: "Alex Jones",
      role: "staff",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Invite sent to alex@example.com. They'll get an email to choose a password.",
    );
    expect(screen.getByLabelText("Name")).toHaveValue("");
    expect(screen.getByLabelText("Email address")).toHaveValue("");
  });

  it("will not make someone an owner without a second, deliberate confirmation", async () => {
    const user = userEvent.setup();
    render(<TeamSettings staffProfile={owner} />);

    await fill(user);
    await user.selectOptions(screen.getByLabelText("Role"), "owner");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    expect(screen.getByText(/make alex jones an owner/i)).toBeInTheDocument();
    expect(state.team.invite).not.toHaveBeenCalled();

    // Backing out sends nothing and keeps what was typed.
    await user.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(state.team.invite).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveValue("Alex Jones");

    await user.click(screen.getByRole("button", { name: /send invite/i }));
    await user.click(screen.getByRole("button", { name: /make owner/i }));
    expect(state.team.invite).toHaveBeenCalledWith({
      email: "alex@example.com",
      displayName: "Alex Jones",
      role: "owner",
    });
  });

  it("shows the reason when the invite is refused and keeps what was typed", async () => {
    const user = userEvent.setup();
    state.team.invite = vi.fn().mockResolvedValue({
      ok: false,
      message: "A login already exists for that email, so it hasn't been changed.",
    });
    render(<TeamSettings staffProfile={owner} />);

    await fill(user);
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A login already exists for that email");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveValue("alex@example.com");
  });

  it("explains itself in sample-data mode instead of offering a form that cannot work", () => {
    state.available = false;
    state.team.members = null;
    render(<TeamSettings staffProfile={owner} />);

    expect(screen.getByText("Adding staff isn't available with sample data.")).toBeInTheDocument();
    expect(screen.getByText("The team list isn't available with sample data.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("lets an owner retry when the team list fails to load", async () => {
    const user = userEvent.setup();
    state.team.members = null;
    state.team.loadError = "Couldn't load the team. Try again in a moment.";
    render(<TeamSettings staffProfile={owner} />);

    expect(screen.getByText(/couldn't load the team/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(state.team.reload).toHaveBeenCalledTimes(1);
  });
});
