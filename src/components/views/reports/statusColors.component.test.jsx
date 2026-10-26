// The reports show a booking status in the same colour the day screen does. The
// status colours are a frozen operational palette resolved in one place
// (resolveDayStatus); this stops the reports growing their own copy again.
import { describe, expect, it } from "vitest";
import { BOOKING_STATUS } from "../../../constants/salon";
import { resolveDayStatus } from "../../ui";
import { STATUS_COLORS } from "./ReportWidgets.jsx";

describe("report status colours", () => {
  it.each([BOOKING_STATUS.ARRIVED, BOOKING_STATUS.READY_FOR_COLLECTION])(
    "%s uses the edge colour the day screen shows",
    (status) => {
      expect(STATUS_COLORS[status]).toBe(resolveDayStatus(status).edge);
    },
  );

  it("keeps Arrived and Ready distinct from each other and from the neutral Booked", () => {
    const colours = [BOOKING_STATUS.BOOKED, BOOKING_STATUS.ARRIVED, BOOKING_STATUS.READY_FOR_COLLECTION].map(
      (status) => STATUS_COLORS[status],
    );
    expect(new Set(colours).size).toBe(3);
  });
});
