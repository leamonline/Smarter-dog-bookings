import { render, fireEvent, screen, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PullToRefresh, usePullToRefresh } from "./PullToRefresh.jsx";

function Progress() {
  const state = usePullToRefresh();
  return <button data-testid="surface" data-progress={state.progress}>Appointment</button>;
}
function setup(onRefresh = vi.fn()) {
  render(<PullToRefresh onRefresh={onRefresh}><Progress /></PullToRefresh>);
  const surface = screen.getByTestId("surface");
  return { surface, onRefresh };
}
function start(surface) { fireEvent.touchStart(surface, { touches: [{ clientX: 20, clientY: 0 }] }); }
function move(surface, y, x = 20) { fireEvent.touchMove(surface, { touches: [{ clientX: x, clientY: y }], cancelable: true }); }

describe("pull-to-refresh gesture", () => {
  it("reports finger-linked progress then settles a short pull without refreshing", () => {
    const { surface, onRefresh } = setup();
    start(surface); move(surface, 30);
    expect(Number(surface.dataset.progress)).toBe(.25);
    move(surface, 60);
    expect(Number(surface.dataset.progress)).toBe(.5);
    fireEvent.touchEnd(surface);
    expect(Number(surface.dataset.progress)).toBe(0);
    expect(onRefresh).not.toHaveBeenCalled();
  });
  it("refreshes once and holds separation until the promise resolves", async () => {
    let finish;
    const { surface, onRefresh } = setup(vi.fn(() => new Promise((resolve) => { finish = resolve; })));
    start(surface); move(surface, 140); fireEvent.touchEnd(surface);
    expect(screen.getByText("Refreshing…")).toBeTruthy();
    start(surface); move(surface, 140); fireEvent.touchEnd(surface);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(Number(surface.dataset.progress)).toBe(0);
  });
  it("cancels on touchcancel and when the finger retreats below the threshold", () => {
    const { surface, onRefresh } = setup();
    start(surface); move(surface, 140); fireEvent.touchCancel(surface);
    expect(Number(surface.dataset.progress)).toBe(0);
    start(surface); move(surface, 140); move(surface, 0); fireEvent.touchEnd(surface);
    expect(onRefresh).not.toHaveBeenCalled();
  });
  it("leaves horizontal, multi-touch and scrolled gestures alone", () => {
    const { surface, onRefresh } = setup();
    start(surface); move(surface, 20, 200); fireEvent.touchEnd(surface);
    start(surface);
    fireEvent.touchMove(surface, { touches: [{ clientX: 20, clientY: 160 }, { clientX: 60, clientY: 160 }] });
    fireEvent.touchEnd(surface);
    surface.parentElement.scrollTop = 20;
    start(surface); move(surface, 160); fireEvent.touchEnd(surface);
    expect(onRefresh).not.toHaveBeenCalled();
    expect(Number(surface.dataset.progress)).toBe(0);
  });
  it("recovers from a rejected refresh and allows keyboard refresh", async () => {
    const { surface, onRefresh } = setup(vi.fn().mockRejectedValue(new Error("offline")));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Refresh appointments" })));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(Number(surface.dataset.progress)).toBe(0);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Refresh appointments" })));
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });
});
