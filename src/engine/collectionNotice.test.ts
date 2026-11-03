import { describe, expect, it } from "vitest";
import {
  blocksCollectionNotice,
  collectionNoticeReadiness,
  releasesHeldNotice,
  type OwnerDayRow,
} from "./collectionNotice";

const row = (id: string, status: string, name: string): OwnerDayRow => ({
  id,
  status,
  dog_name_snapshot: name,
  dogs: { name },
});

describe("collectionNoticeReadiness", () => {
  it("is ready to send for a single dog", () => {
    const r = collectionNoticeReadiness([row("1", "Ready for collection", "Bella")], "1");
    expect(r).toEqual({ readyDogNames: ["Bella"], waitingDogNames: [] });
  });

  it("holds the notice while a sibling is still being groomed", () => {
    const r = collectionNoticeReadiness(
      [row("1", "Ready for collection", "Bella"), row("2", "Arrived", "Max")],
      "1",
    );
    expect(r.waitingDogNames).toEqual(["Max"]);
  });

  it("holds the notice for a sibling whose status is missing, the same as Booked", () => {
    const missing: OwnerDayRow = { id: "2", status: null, dog_name_snapshot: "Max" };
    const r = collectionNoticeReadiness(
      [row("1", "Ready for collection", "Bella"), missing],
      "1",
    );
    expect(r.readyDogNames).toEqual(["Bella"]);
    expect(r.waitingDogNames).toEqual(["Max"]);
  });

  it("holds the notice for a sibling who has not arrived yet", () => {
    const r = collectionNoticeReadiness(
      [row("1", "Arrived", "Bella"), row("2", "Booked", "Max"), row("3", "Reconfirmed", "Alfie")],
      "1",
    );
    expect(r.waitingDogNames).toEqual(["Max", "Alfie"]);
  });

  it("names every dog once the last one is ready", () => {
    const r = collectionNoticeReadiness(
      [row("1", "Ready for collection", "Bella"), row("2", "Arrived", "Max")],
      "2",
    );
    // Max is the booking that just transitioned, so it counts even though
    // its row still says Arrived. Bella is already Ready.
    expect(r).toEqual({ readyDogNames: ["Bella", "Max"], waitingDogNames: [] });
  });

  it("does not name or wait for a dog that has already been collected", () => {
    const r = collectionNoticeReadiness(
      [row("1", "Completed", "Bella"), row("2", "Ready for collection", "Max")],
      "2",
    );
    expect(r).toEqual({ readyDogNames: ["Max"], waitingDogNames: [] });
  });

  it("does not wait for cancelled or no-show dogs", () => {
    const r = collectionNoticeReadiness(
      [
        row("1", "Ready for collection", "Bella"),
        row("2", "Cancelled", "Max"),
        row("3", "No-show", "Alfie"),
      ],
      "1",
    );
    expect(r).toEqual({ readyDogNames: ["Bella"], waitingDogNames: [] });
  });

  it("falls back to the snapshot name and de-duplicates a dog with two bookings", () => {
    const r = collectionNoticeReadiness(
      [
        { id: "1", status: "Ready for collection", dog_name_snapshot: "Bella", dogs: null },
        row("2", "Ready for collection", "Bella"),
      ],
      "1",
    );
    expect(r.readyDogNames).toEqual(["Bella"]);
  });

  it("reads the dog name when PostgREST returns dogs as an array", () => {
    const r = collectionNoticeReadiness(
      [{ id: "1", status: "Ready for collection", dogs: [{ name: "Bella" }] }],
      "1",
    );
    expect(r.readyDogNames).toEqual(["Bella"]);
  });
});

describe("blocksCollectionNotice", () => {
  it.each(["Booked", "Reconfirmed", "Arrived"])("%s holds the notice", (status) => {
    expect(blocksCollectionNotice(status)).toBe(true);
  });
  it.each(["Ready for collection", "Completed", "Cancelled", "No-show"])(
    "%s does not hold the notice",
    (status) => {
      expect(blocksCollectionNotice(status)).toBe(false);
    },
  );
});

describe("releasesHeldNotice", () => {
  const max = { status: "Arrived", ownerId: "human-1", date: "2026-05-18" };

  it.each(["Cancelled", "No-show", "Completed"])("is released when the holder becomes %s", (status) => {
    expect(releasesHeldNotice(max, { ...max, status })).toBe(true);
  });

  it("is released when the holder moves to another day", () => {
    expect(releasesHeldNotice(max, { ...max, date: "2026-05-19" })).toBe(true);
  });

  it("is released when the holder is deleted", () => {
    expect(releasesHeldNotice(max, null)).toBe(true);
  });

  it("is released when the holder is reassigned to another owner", () => {
    expect(releasesHeldNotice(max, { ...max, ownerId: "human-2" })).toBe(true);
  });

  it("is not released by an ordinary edit that keeps the holder in the salon", () => {
    expect(releasesHeldNotice(max, { ...max, status: "Arrived" })).toBe(false);
    expect(releasesHeldNotice({ ...max, status: "Booked" }, { ...max, status: "Arrived" })).toBe(false);
  });

  it("leaves the transition into Ready to its own prompt", () => {
    expect(releasesHeldNotice(max, { ...max, status: "Ready for collection" })).toBe(false);
  });

  it("is not released by a booking that was not holding anything", () => {
    expect(releasesHeldNotice({ ...max, status: "Ready for collection" }, { ...max, status: "Completed" })).toBe(false);
    expect(releasesHeldNotice({ ...max, status: "Cancelled" }, null)).toBe(false);
  });
});
