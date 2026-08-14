import { getCommandPayloadSchema } from "./command-payload-schema";

/**
 * Check-in and check-out ask the employee nothing.
 *
 * The removed field was "Work Mode", a required select that made the employee
 * declare whether they were in the office — the one claim the server must decide
 * for itself from the reported position, because asserting OFFICE from a sofa is
 * how the device-required rule gets bypassed.
 */

describe("attendance command payloads", () => {
  it("asks for no work mode on check in", () => {
    const schema = getCommandPayloadSchema("attendance.checkIn");
    const fieldKeys = (schema?.fields ?? []).map((field) => field.key);

    expect(fieldKeys).not.toContain("attendanceMode");
    expect(fieldKeys).not.toContain("officeLocationId");
  });

  it("asks for no work mode on check out", () => {
    const schema = getCommandPayloadSchema("attendance.checkOut");
    const fieldKeys = (schema?.fields ?? []).map((field) => field.key);

    expect(fieldKeys).not.toContain("attendanceMode");
  });

  it("runs both without opening a form", () => {
    expect(getCommandPayloadSchema("attendance.checkIn")?.autoSubmit).toBe(true);
    expect(getCommandPayloadSchema("attendance.checkOut")?.autoSubmit).toBe(true);
  });

  /*
   * The old rule captured a position only when the work mode was already REMOTE,
   * which is circular: the position is what decides the mode.
   */
  it("captures location unconditionally", () => {
    for (const key of ["attendance.checkIn", "attendance.checkOut"]) {
      const geolocation = getCommandPayloadSchema(key)?.geolocation;
      expect(geolocation?.always).toBe(true);
      expect(geolocation?.requiredWhen).toBeUndefined();
    }
  });

  it("labels its submit button", () => {
    for (const key of ["attendance.checkIn", "attendance.checkOut"]) {
      const schema = getCommandPayloadSchema(key);
      expect(schema?.submitLabel?.trim()).toBeTruthy();
    }
  });
});
