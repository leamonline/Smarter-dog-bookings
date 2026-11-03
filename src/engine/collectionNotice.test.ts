import { describe, expect, it } from "vitest";
import {
  blocksCollectionNotice,
  collectionNoticeReadiness,
  collectionNoticeRoute,
  releasesHeldNotice,
  type OwnerDayRow,
} from "./collectionNotice";

describe("collectionNoticeRoute", () => {
  const mobile = "07123456789";

  it("uses WhatsApp for an ordinary customer", () => {
    expect(collectionNoticeRoute({ phone: mobile })).toEqual({ channel: "whatsapp" });
  });

  it("falls back to SMS when the number looks like it isn't on WhatsApp, with no SMS tickbox involved", () => {
    // humans.sms defaults to false; SMS is a required operational channel, so it must not matter.
    expect(collectionNoticeRoute({ phone: mobile }, { whatsappUnreachable: true })).toEqual({
      channel: "sms",
      because: "whatsapp_unreachable",
    });
  });

  it("never texts someone who has opted out of SMS, even when WhatsApp can't reach them", () => {
    expect(
      collectionNoticeRoute({ phone: mobile, sms_opted_out: true }, { whatsappUnreachable: true }),
    ).toEqual({ channel: null, reason: "Not on WhatsApp, and opted out of SMS" });
  });

  it("does not override a WhatsApp STOP: texts are paused until staff clarify", () => {
    const route = collectionNoticeRoute({ phone: mobile, whatsapp_opted_out: true });
    expect(route.channel).toBeNull();
    expect((route as { reason: string }).reason).toMatch(/STOP on WhatsApp.*paused/i);
    // ...including when the number also looks unreachable.
    expect(
      collectionNoticeRoute({ phone: mobile, whatsapp_opted_out: true }, { whatsappUnreachable: true }).channel,
    ).toBeNull();
  });

  it("texts a WhatsApp STOP once staff have recorded that SMS is fine", () => {
    expect(
      collectionNoticeRoute({ phone: mobile, whatsapp_opted_out: true, preferred_channel: "sms" }),
    ).toEqual({ channel: "sms", because: "whatsapp_opted_out" });
  });

  it("lets an SMS opt-out beat a recorded SMS preference", () => {
    expect(
      collectionNoticeRoute({ phone: mobile, whatsapp_opted_out: true, preferred_channel: "sms", sms_opted_out: true }),
    ).toEqual({ channel: null, reason: "Opted out of WhatsApp and SMS" });
  });

  it("sends nothing without a usable UK mobile, whichever channel", () => {
    const none = { channel: null, reason: "No mobile number on file" };
    expect(collectionNoticeRoute({ phone: null })).toEqual(none);
    expect(collectionNoticeRoute({ phone: "01632 960123" }, { whatsappUnreachable: true })).toEqual(none);
    expect(collectionNoticeRoute(null)).toEqual(none);
  });
});

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
