import { describe, it, expect } from "vitest";
import { smsSegmentInfo, isGsm7Char } from "./segments.js";

describe("isGsm7Char", () => {
  it("accepts plain ASCII and common GSM-7 extras", () => {
    for (const ch of "abcXYZ 0123!?.,@£€é") {
      expect(isGsm7Char(ch)).toBe(true);
    }
  });

  it("accepts tab, LF and CR", () => {
    expect(isGsm7Char("\t")).toBe(true);
    expect(isGsm7Char("\n")).toBe(true);
    expect(isGsm7Char("\r")).toBe(true);
  });

  it("rejects emoji and CJK", () => {
    expect(isGsm7Char("🐶")).toBe(false);
    expect(isGsm7Char("中")).toBe(false);
  });
});

describe("smsSegmentInfo", () => {
  it("reports 0 segments for empty text", () => {
    expect(smsSegmentInfo("")).toEqual({ length: 0, segments: 0, encoding: "GSM-7" });
  });

  it("treats <=160 GSM-7 chars as a single segment", () => {
    const info = smsSegmentInfo("a".repeat(160));
    expect(info).toEqual({ length: 160, segments: 1, encoding: "GSM-7" });
  });

  it("splits GSM-7 at 153 chars/segment past 160", () => {
    const info = smsSegmentInfo("a".repeat(161));
    expect(info.encoding).toBe("GSM-7");
    expect(info.segments).toBe(2);
  });

  it("treats <=70 UCS-2 chars as a single segment", () => {
    const info = smsSegmentInfo("🐶".repeat(35)); // 70 UTF-16 code units
    expect(info.encoding).toBe("UCS-2");
    expect(info.length).toBe(70);
    expect(info.segments).toBe(1);
  });

  it("splits UCS-2 at 67 chars/segment past 70", () => {
    const info = smsSegmentInfo("é".repeat(70) + "中"); // any non-GSM-7 char forces UCS-2
    expect(info.encoding).toBe("UCS-2");
    expect(info.segments).toBe(2);
  });

  it("a single emoji forces UCS-2 encoding", () => {
    expect(smsSegmentInfo("Hi 🐶").encoding).toBe("UCS-2");
  });
});
