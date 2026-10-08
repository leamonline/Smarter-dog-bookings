import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

  it("asks the team to confirm each unsized dog once, and says so", async () => {
    const onRequestSizeCheck = vi.fn().mockResolvedValue(true);
    const props = {
      dogs,
      selectedDogs: [],
      onSelect: noop,
      onNext: noop,
      onDogAdded: noop,
      humanId: "h1",
      loading: false,
      onRequestSizeCheck,
    };
    const { rerender } = render(<DogSelection {...props} />);

    expect(await screen.findAllByText("We're confirming their size")).toHaveLength(2);
    expect(screen.getByRole("note")).toHaveTextContent(/We've asked the team to confirm their sizes/);
    // Still bookable only once staff set the size, and the shortcut stays.
    expect(screen.getByRole("button", { name: /Alfie/i })).toBeDisabled();
    expect(screen.getByRole("link", { name: /message us on WhatsApp/i }).closest("button")).toBeNull();

    rerender(<DogSelection {...props} dogs={[...dogs]} />);
    expect(onRequestSizeCheck.mock.calls.map(([id]) => id).sort()).toEqual(["breed-size", "reported-size"]);
  });

  it("names the dog when only one is waiting", async () => {
    render(
      <DogSelection
        dogs={[dogs[0]]}
        selectedDogs={[]}
        onSelect={noop}
        onNext={noop}
        onDogAdded={noop}
        humanId="h1"
        loading={false}
        onRequestSizeCheck={vi.fn().mockResolvedValue(true)}
      />,
    );

    expect(await screen.findByRole("note")).toHaveTextContent(/confirm Alfie's size/);
  });

  it("does not claim the team was asked when the request failed", async () => {
    const onRequestSizeCheck = vi.fn().mockResolvedValue(false);
    render(
      <DogSelection
        dogs={dogs}
        selectedDogs={[]}
        onSelect={noop}
        onNext={noop}
        onDogAdded={noop}
        humanId="h1"
        loading={false}
        onRequestSizeCheck={onRequestSizeCheck}
      />,
    );

    await waitFor(() => expect(onRequestSizeCheck).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText(/size not confirmed — message us first/i)).toHaveLength(2);
    expect(screen.queryByText(/asked the team/i)).toBeNull();
  });

  it("does not ask about dogs that already have a size", () => {
    const onRequestSizeCheck = vi.fn().mockResolvedValue(true);
    render(
      <DogSelection
        dogs={[{ id: "ok", name: "Coco", breed: "Cockapoo", size: "medium", reportedSize: "medium", isPregnant: false }]}
        selectedDogs={[]}
        onSelect={noop}
        onNext={noop}
        onDogAdded={noop}
        humanId="h1"
        loading={false}
        onRequestSizeCheck={onRequestSizeCheck}
      />,
    );

    expect(onRequestSizeCheck).not.toHaveBeenCalled();
  });

  it("keeps a recorded request when the dog list changes while it is in flight", async () => {
    // e.g. the customer adds another pup before the first request returns.
    let resolveFirst: (ok: boolean) => void = () => {};
    const onRequestSizeCheck = vi.fn((dogId: string) =>
      dogId === "reported-size"
        ? new Promise<boolean>((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve(true),
    );
    const props = {
      selectedDogs: [],
      onSelect: noop,
      onNext: noop,
      onDogAdded: noop,
      humanId: "h1",
      loading: false,
      onRequestSizeCheck,
    };
    const { rerender } = render(<DogSelection {...props} dogs={[dogs[0]]} />);

    rerender(<DogSelection {...props} dogs={dogs} />);
    resolveFirst(true);

    expect(await screen.findAllByText("We're confirming their size")).toHaveLength(2);
    expect(onRequestSizeCheck).toHaveBeenCalledTimes(2);
  });

  it("never promises online booking for a pregnant dog once its size is set", async () => {
    render(
      <DogSelection
        dogs={[{ ...dogs[0], isPregnant: true }]}
        selectedDogs={[]}
        onSelect={noop}
        onNext={noop}
        onDogAdded={noop}
        humanId="h1"
        loading={false}
        onRequestSizeCheck={vi.fn().mockResolvedValue(true)}
      />,
    );

    // The size check is still asked for (staff need the size anyway)…
    expect(await screen.findByText("We're confirming their size")).toBeInTheDocument();
    // …but the size note keeps pointing them to us, not to booking online.
    expect(screen.queryByText(/book online once/i)).toBeNull();
    expect(screen.getAllByRole("note")[0]).toHaveTextContent(/confirm a pup.s size before booking/i);
  });
});

