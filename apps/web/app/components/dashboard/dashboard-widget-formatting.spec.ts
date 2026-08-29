import { setDefaultFormattingContext } from "@/lib/formatting-context";
import { formatValue } from "./dashboard-widget-renderer";

/**
 * BUG-2010 — the dashboard "Recent changes" widget rendered raw ISO-8601
 * timestamps (`2026-08-29T00:37:42.741Z`) instead of the tenant's configured
 * date/time format, because `formatValue` called
 * `Date.prototype.toLocaleString(undefined, {...})` directly — the visiting
 * browser's locale and local timezone, not the tenant's `MM/dd/yyyy` / 12h /
 * UTC configuration that every other screen honours.
 *
 * BUG-2009 (surface 3) — the same widget's Label column printed the raw enum
 * constant ("DRAFT", "EMPLOYEE_SYSTEM_ACCESS_PROVISIONED") it received.
 *
 * `apps/web` has no jsdom, so this cannot render the widget; `formatValue` is
 * exported from `dashboard-widget-renderer.tsx` specifically so this pure
 * function can be exercised directly.
 */
describe("dashboard widget formatValue", () => {
  afterEach(() => {
    setDefaultFormattingContext(null);
  });

  it("formats an ISO timestamp using the tenant's configured format, not the browser's", () => {
    setDefaultFormattingContext({
      dateFormat: "MM/dd/yyyy",
      timeFormat: "12h",
      timezone: "UTC",
      locale: "en-US",
    });

    const formatted = formatValue("2026-08-29T13:37:42.741Z");

    expect(formatted).not.toBe("2026-08-29T13:37:42.741Z");
    expect(formatted).not.toContain("T");
    expect(formatted).toContain("08/29/2026");
    // 12h format renders an AM/PM marker rather than a 24h hour.
    expect(formatted).toMatch(/[AP]M/);
  });

  it("respects a different configured date format and timezone", () => {
    setDefaultFormattingContext({
      dateFormat: "dd/MM/yyyy",
      timeFormat: "24h",
      timezone: "UTC",
      locale: "en-GB",
    });

    expect(formatValue("2026-08-29T13:37:42.741Z")).toContain("29/08/2026");
  });

  it("formats a date-only ISO string through the same tenant configuration", () => {
    setDefaultFormattingContext({
      dateFormat: "yyyy-MM-dd",
      timezone: "UTC",
      locale: "en-US",
    });

    expect(formatValue("2026-08-29")).toBe("2026-08-29");
  });

  it("humanises a raw enum constant instead of printing it verbatim", () => {
    expect(formatValue("DRAFT")).toBe("Draft");
    expect(formatValue("EMPLOYEE_SYSTEM_ACCESS_PROVISIONED")).toBe(
      "Employee system access provisioned",
    );
  });

  it("leaves an entity display name alone", () => {
    expect(formatValue("Timesheet")).toBe("Timesheet");
    expect(formatValue("Employee")).toBe("Employee");
  });

  it("still handles the non-string cases unchanged", () => {
    expect(formatValue(null)).toBe("-");
    expect(formatValue(undefined)).toBe("-");
    expect(formatValue("")).toBe("-");
    expect(formatValue(1200)).toBe("1,200");
    expect(formatValue(true)).toBe("Yes");
    expect(formatValue(false)).toBe("No");
  });
});
