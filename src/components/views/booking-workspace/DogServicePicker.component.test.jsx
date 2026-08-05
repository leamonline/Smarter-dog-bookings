import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DogServicePicker } from "./DogServicePicker.jsx";

const DOGS = [
  { id: "d1", name: "Alfie", breed: "Cockapoo", size: "small" },
  { id: "d2", name: "Bella", breed: "Cocker", size: "medium" },
  { id: "d3", name: "Rex", breed: "Rottweiler", size: "large" },
  { id: "d4", name: "Pip", breed: null, size: null },
];

function renderPicker(props = {}) {
  const onToggleDog = vi.fn();
  const onSetService = vi.fn();
  render(
    <DogServicePicker
      dogs={DOGS}
      selectedDogIds={[]}
      servicesByDogId={{}}
      lastServiceByDogId={{}}
      onToggleDog={onToggleDog}
      onSetService={onSetService}
      {...props}
    />,
  );
  return { onToggleDog, onSetService };
}

describe("DogServicePicker", () => {
  it("lists every dog with breed and size", () => {
    renderPicker();
    const alfie = screen.getByRole("checkbox", { name: /Alfie/ });
    expect(alfie).toBeInTheDocument();
    expect(screen.getByText(/Cockapoo/)).toBeInTheDocument();
    expect(screen.getAllByText(/small/i).length).toBeGreaterThan(0);
  });

  it("shows the last service when one is known", () => {
    renderPicker({ lastServiceByDogId: { d1: "bath-and-brush" } });
    expect(screen.getByText(/Last: Bath & Brush/)).toBeInTheDocument();
  });

  it("selects a dog on click", async () => {
    const user = userEvent.setup();
    const { onToggleDog } = renderPicker();
    await user.click(screen.getByRole("checkbox", { name: /Alfie/ }));
    expect(onToggleDog).toHaveBeenCalledWith("d1");
  });

  it("marks a dog with no size as needing one and prevents selection", async () => {
    const user = userEvent.setup();
    const { onToggleDog } = renderPicker();
    const pip = screen.getByRole("checkbox", { name: /Pip/ });
    expect(pip).toBeDisabled();
    expect(screen.getByText("Size needed")).toBeInTheDocument();
    await user.click(pip);
    expect(onToggleDog).not.toHaveBeenCalled();
  });

  it("shows a service selector only for selected dogs", () => {
    renderPicker({
      selectedDogIds: ["d1"],
      servicesByDogId: { d1: "full-groom" },
    });
    expect(screen.getByLabelText("Service for Alfie")).toBeInTheDocument();
    expect(screen.queryByLabelText("Service for Bella")).not.toBeInTheDocument();
  });

  it("lets staff override the service", async () => {
    const user = userEvent.setup();
    const { onSetService } = renderPicker({
      selectedDogIds: ["d1"],
      servicesByDogId: { d1: "full-groom" },
    });
    await user.selectOptions(
      screen.getByLabelText("Service for Alfie"),
      "bath-and-deshed",
    );
    expect(onSetService).toHaveBeenCalledWith("d1", "bath-and-deshed");
  });

  // PRICING marks puppy-groom as unavailable at large.
  it("omits a service that is not offered at the dog's size", () => {
    renderPicker({
      selectedDogIds: ["d3"],
      servicesByDogId: { d3: "full-groom" },
    });
    const select = screen.getByLabelText("Service for Rex");
    expect(within(select).queryByRole("option", { name: "Puppy Groom" })).toBeNull();
    expect(within(select).getByRole("option", { name: "Full Groom" })).toBeInTheDocument();
  });

  it("renders an empty state when the customer has no dogs", () => {
    render(
      <DogServicePicker
        dogs={[]}
        selectedDogIds={[]}
        servicesByDogId={{}}
        onToggleDog={vi.fn()}
        onSetService={vi.fn()}
      />,
    );
    expect(screen.getByText(/No dogs on file/i)).toBeInTheDocument();
  });

  it("groups the dogs in a labelled fieldset for screen readers", () => {
    renderPicker();
    expect(screen.getByRole("group", { name: /Choose dogs/i })).toBeInTheDocument();
  });

  it("handles four dogs and long names without dropping any", () => {
    const many = [
      { id: "a", name: "Bartholomew Fitzwilliam III", breed: "Bernese Mountain Dog", size: "large" },
      { id: "b", name: "Persephone", breed: "Cavalier King Charles Spaniel", size: "small" },
      { id: "c", name: "Clementine", breed: "Cockapoo", size: "medium" },
      { id: "d", name: "Dougal", breed: "Terrier", size: "small" },
    ];
    render(
      <DogServicePicker
        dogs={many}
        selectedDogIds={[]}
        servicesByDogId={{}}
        onToggleDog={vi.fn()}
        onSetService={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(
      screen.getByRole("checkbox", { name: /Bartholomew Fitzwilliam III/ }),
    ).toBeInTheDocument();
  });
});
