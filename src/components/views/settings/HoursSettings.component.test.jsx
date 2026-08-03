import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";

import { HoursSettings } from "./HoursSettings.jsx";

const config = {
  businessHours: { Monday: { open: "09:00", close: "17:00", closed: false } },
  closures: [{ date: "2026-12-25", label: "Christmas Day" }],
};

describe("HoursSettings editable schedule", () => {
  it("shows persisted hours/closures and saves an hours edit through onUpdateConfig", async () => {
    const user = userEvent.setup();
    const onUpdateConfig = vi.fn().mockResolvedValue({ ok: true });
    const { container } = render(
      <HoursSettings config={config} onUpdateConfig={onUpdateConfig} canEdit />,
    );
    const times = container.querySelectorAll('input[type="time"]');

    expect(times.length).toBeGreaterThan(0);
    expect(times[0]).toHaveValue("09:00");
    expect(times[0]).not.toBeDisabled();
    expect(screen.getByText("2026-12-25 — Christmas Day")).toBeInTheDocument();

    fireEvent.change(times[0], { target: { value: "08:30" } });
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(onUpdateConfig).toHaveBeenCalled();
    const updater = onUpdateConfig.mock.calls.at(-1)[0];
    expect(updater(config).businessHours.Monday.open).toBe("08:30");
    expect(await screen.findByText("✓ Saved")).toBeInTheDocument();
  });

  it("adds and removes closures before saving", async () => {
    const user = userEvent.setup();
    const onUpdateConfig = vi.fn().mockResolvedValue({ ok: true });
    render(<HoursSettings config={config} onUpdateConfig={onUpdateConfig} canEdit />);

    fireEvent.change(screen.getByLabelText("New closure date"), {
      target: { value: "2027-01-01" },
    });
    await user.click(screen.getByRole("button", { name: "+ Add" }));
    expect(screen.getByText("2027-01-01")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove closure 2026-12-25" }));
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(onUpdateConfig).toHaveBeenCalled();
    const updater = onUpdateConfig.mock.calls.at(-1)[0];
    expect(updater(config).closures).toEqual([{ date: "2027-01-01", label: "" }]);
  });

  it("toggles a day between open and closed", async () => {
    const user = userEvent.setup();
    const onUpdateConfig = vi.fn().mockResolvedValue({ ok: true });
    render(<HoursSettings config={config} onUpdateConfig={onUpdateConfig} canEdit />);

    await user.click(screen.getByRole("button", { name: "Close Monday" }));
    await user.click(screen.getByRole("button", { name: /save/i }));

    const updater = onUpdateConfig.mock.calls.at(-1)[0];
    expect(updater(config).businessHours.Monday.closed).toBe(true);
  });

  it("disables editing and saving when the signed-in user can't edit settings", () => {
    const { container } = render(
      <HoursSettings config={config} onUpdateConfig={vi.fn()} canEdit={false} />,
    );

    for (const time of container.querySelectorAll('input[type="time"]')) {
      expect(time).toBeDisabled();
    }
    expect(container.querySelector('input[type="date"]')).toBeDisabled();
    expect(screen.getByLabelText("Closure label (optional)")).toBeDisabled();
    expect(screen.getByRole("button", { name: "+ Add" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });
});
