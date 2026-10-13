import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useProfileRouting } from "./useProfileRouting";

function ProfileRoutingHarness() {
  const [selectedDogId, setSelectedDogId] = useState<string | null>(null);
  const [selectedHumanId, setSelectedHumanId] = useState<string | null>(null);
  const profile = useProfileRouting({
    selectedDogId,
    setSelectedDogId,
    selectedHumanId,
    setSelectedHumanId,
  });

  return (
    <Routes>
      <Route
        path="/humans"
        element={<HumanDirectory onOpen={() => profile.openHuman("human-1")} />}
      />
      <Route
        path="/humans/:id"
        element={<HumanProfile onClose={profile.closeHumanProfile} />}
      />
    </Routes>
  );
}

function HumanDirectory({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" data-profile-human-id="human-1" onClick={onOpen}>
      View human profile
    </button>
  );
}

function HumanProfile({ onClose }: { onClose: () => void }) {
  return <button type="button" onClick={onClose}>Close profile</button>;
}

describe("useProfileRouting", () => {
  it("restores focus to the remounted directory trigger after closing a routed profile", async () => {
    render(
      <MemoryRouter initialEntries={["/humans"]}>
        <ProfileRoutingHarness />
      </MemoryRouter>,
    );

    const originalTrigger = screen.getByRole("button", { name: "View human profile" });
    originalTrigger.focus();
    fireEvent.click(originalTrigger);
    fireEvent.click(await screen.findByRole("button", { name: "Close profile" }));

    const remountedTrigger = await screen.findByRole("button", { name: "View human profile" });
    expect(remountedTrigger).not.toBe(originalTrigger);
    await waitFor(() => expect(remountedTrigger).toHaveFocus());
  });
});
