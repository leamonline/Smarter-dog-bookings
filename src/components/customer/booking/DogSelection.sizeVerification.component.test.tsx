import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CustomerDog } from "../../../supabase/repositories/dogsRepo";
import { DogSelection } from "./DogSelection";

const noop = () => {};

const dogs: CustomerDog[] = [
  {
    id: "reported-size",
    name: "Alfie",
    breed: "Unknown breed",
    size: null,
    reportedSize: "small",
    isPregnant: false,
  },
  {
    id: "breed-size",
    name: "Bella",
    breed: "Labrador",
    size: null,
    reportedSize: null,
    isPregnant: false,
  },
];

describe("DogSelection requires staff-confirmed size", () => {
  it("keeps dogs disabled when only a reported or breed-derived size exists", () => {
    const onSelect = vi.fn();

    render(
      <DogSelection
        dogs={dogs}
        selectedDogs={[]}
        onSelect={onSelect}
        onNext={noop}
        onDogAdded={noop}
        humanId="h1"
        loading={false}
      />,
    );

    expect(screen.getByRole("button", { name: /Alfie/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Bella/i })).toBeDisabled();
    expect(screen.getAllByText(/size not confirmed/i)).toHaveLength(2);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("offers a way to get the size confirmed, reachable outside the disabled row", () => {
    // Telling someone to "message us first" without giving them the means is a
    // dead end. The link must also sit OUTSIDE the disabled button, or keyboard
    // and switch users can never reach it.
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

    const link = screen.getByRole("link", { name: /message us on WhatsApp/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", expect.stringContaining("wa.me"));
    expect(link.closest("button")).toBeNull();
  });

  it("stays quiet when every dog has a confirmed size", () => {
    render(
      <DogSelection
        dogs={[{ id: "ok", name: "Coco", breed: "Cockapoo", size: "medium", reportedSize: "medium", isPregnant: false }]}
        selectedDogs={[]}
        onSelect={noop}
        onNext={noop}
        onDogAdded={noop}
        humanId="h1"
        loading={false}
      />,
    );

    expect(screen.queryByText(/confirm a pup.s size/i)).toBeNull();
  });
});
