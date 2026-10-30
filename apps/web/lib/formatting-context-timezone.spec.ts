import { formatDate, formatTime } from "./formatting-context";

/**
 * DP-QA-012: a tenant whose stored timezone is not a real zone used to throw
 * "RangeError: Invalid time zone specified" from every formatted date.
 */
describe("formatting with an invalid stored timezone", () => {
  const bad = { timezone: "Not/AZone" } as never;
  const when = "2026-10-30T12:00:00Z";

  it("does not throw when formatting a date", () => {
    expect(() => formatDate(when, bad)).not.toThrow();
    expect(formatDate(when, bad)).not.toBe("");
  });

  it("does not throw when formatting a time", () => {
    expect(() => formatTime(when, bad)).not.toThrow();
  });

  it("still honours a valid zone", () => {
    const karachi = formatTime(when, { timezone: "Asia/Karachi" } as never);
    const utc = formatTime(when, { timezone: "UTC" } as never);
    expect(karachi).not.toBe(utc);
  });
});
