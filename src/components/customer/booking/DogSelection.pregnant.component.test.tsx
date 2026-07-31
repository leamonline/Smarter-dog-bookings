import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DogSelection } from "./DogSelection";

const noop = () => {};

const dogs = [
  { id: "d1", name: "Alfie", breed: "Poodle", size: "small" as const, reportedSize: null, isPregnant: false },
  { id: "d2", name: "Bella", breed: "Labrador", size: "small" as const, reportedSize: null, isPregnant: true },
];

describe("DogSelection blocks a pregnant dog (preflight UX)", () => {
  it("disables the pregnant dog with an explanation, leaving others selectable", () => {
    render(
      <DogSelection
        dogs={dogs}
        selectedDogs={[]}
        onSelect={noop}
        onNext={noop}
        onDogAdded={noop}
        humanId="h1"
        loading={false}
      />,
    );

    const bella = screen.getByRole("button", { name: /Bella/i });
    expect(bella).toBeDisabled();
    expect(screen.getByRole("note")).toHaveTextContent(
      /pregnant dogs need a quick chat first/i,
    );
    expect(
      screen.getByRole("link", { name: /message us on WhatsApp/i }),
    ).toHaveAttribute("href", "https://wa.me/447873329440");
    expect(screen.queryByText(/call us/i)).not.toBeInTheDocument();

    const alfie = screen.getByRole("button", { name: /Alfie/i });
    expect(alfie).not.toBeDisabled();
  });
});
