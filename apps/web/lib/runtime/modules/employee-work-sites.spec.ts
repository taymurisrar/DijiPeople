import {
  buildWorkSiteAssignPayload,
  mapEmployeeWorkSiteRows,
  omitPrimaryLocationFromEmployeeUpdate,
} from "./employee-work-sites";

/*
 * ITEM-0179 — work sites moved from an in-form widget to a Work Sites
 * related-records tab. The widget said "No work site assignments yet" for an
 * employee whose Location was Head Office, edited validity with a request that
 * could clear the primary flag, and left Location as a second, unsynchronised
 * way to change the primary site.
 */

const HEAD_OFFICE = "11111111-1111-4111-8111-111111111111";
const WAREHOUSE = "22222222-2222-4222-8222-222222222222";
const OLD_SITE = "33333333-3333-4333-8333-333333333333";

/** `AttendanceOperationsService.listEmployeeWorkSites`. */
function listResponse(overrides: Record<string, unknown> = {}) {
  return {
    employeeId: "emp-1",
    primaryLocationId: HEAD_OFFICE,
    authorized: [],
    assignments: [],
    ...overrides,
  };
}

describe("work-site rows", () => {
  it("lists active assignments, primary first, keyed by location", () => {
    const rows = mapEmployeeWorkSiteRows(
      listResponse({
        assignments: [
          {
            id: "a2",
            locationId: WAREHOUSE,
            location: { id: WAREHOUSE, name: "Warehouse", isActive: true },
            isPrimary: false,
            status: "ACTIVE",
            validFrom: "2026-01-01T00:00:00.000Z",
            validTo: null,
          },
          {
            id: "a1",
            locationId: HEAD_OFFICE,
            location: { id: HEAD_OFFICE, name: "Head Office", isActive: true },
            isPrimary: true,
            status: "ACTIVE",
            validFrom: null,
            validTo: null,
          },
          {
            id: "a3",
            locationId: OLD_SITE,
            location: { id: OLD_SITE, name: "Old Site", isActive: true },
            isPrimary: false,
            status: "INACTIVE",
          },
        ],
      }),
    );

    expect(rows.map((row) => row.locationName)).toEqual([
      "Head Office",
      "Warehouse",
    ]);
    expect(rows[0]).toMatchObject({
      id: HEAD_OFFICE,
      isPrimary: true,
      isDerived: false,
    });
    expect(rows[1]?.validFrom).toBe("2026-01-01T00:00:00.000Z");
  });

  it("shows the Location an employee is authorised for when there are no rows", () => {
    // The owner's record: Head Office as Location, no assignment rows, and the
    // widget claimed there were no work sites at all.
    const rows = mapEmployeeWorkSiteRows(
      listResponse({
        authorized: [
          {
            locationId: HEAD_OFFICE,
            name: "Head Office",
            isPrimary: true,
            derivedFromPrimaryLocation: true,
          },
        ],
      }),
    );

    expect(rows).toEqual([
      {
        id: HEAD_OFFICE,
        locationId: HEAD_OFFICE,
        locationName: "Head Office",
        isPrimary: true,
        validFrom: null,
        validTo: null,
        isDerived: true,
      },
    ]);
  });

  it("is empty for an unreadable response", () => {
    // A 403 for a viewer without attendanceDevices.read reaches here as [].
    expect(mapEmployeeWorkSiteRows([])).toEqual([]);
  });
});

describe("work-site assign payload", () => {
  it("sends null rather than empty strings for missing dates", () => {
    const payload = buildWorkSiteAssignPayload({
      locationId: WAREHOUSE,
      validFrom: "",
      validTo: undefined,
    });

    expect(payload).toEqual({
      locationId: WAREHOUSE,
      validFrom: null,
      validTo: null,
    });
  });

  it("does not send a primary flag when only dates change", () => {
    // Sending isPrimary=false here is what cleared the primary flag.
    const payload = buildWorkSiteAssignPayload(
      { validFrom: "2026-02-01", validTo: "2026-12-31T00:00:00.000Z" },
      {
        locationId: HEAD_OFFICE,
        existing: {
          id: HEAD_OFFICE,
          locationId: HEAD_OFFICE,
          locationName: "Head Office",
          isPrimary: true,
          validFrom: null,
          validTo: null,
          isDerived: false,
        },
      },
    );

    expect(payload).toEqual({
      locationId: HEAD_OFFICE,
      validFrom: "2026-02-01",
      validTo: "2026-12-31",
    });
    expect(payload).not.toHaveProperty("isPrimary");
  });

  it("keeps a derived row primary when it is given dates", () => {
    const payload = buildWorkSiteAssignPayload(
      { validFrom: "2026-02-01" },
      {
        locationId: HEAD_OFFICE,
        existing: {
          id: HEAD_OFFICE,
          locationId: HEAD_OFFICE,
          locationName: "Head Office",
          isPrimary: true,
          validFrom: null,
          validTo: null,
          isDerived: true,
        },
      },
    );

    expect(payload.isPrimary).toBe(true);
  });

  it("never carries a tenant or employee id", () => {
    const payload = buildWorkSiteAssignPayload({
      locationId: WAREHOUSE,
      tenantId: "other-tenant",
      employeeId: "emp-2",
    });

    expect(Object.keys(payload).sort()).toEqual([
      "locationId",
      "validFrom",
      "validTo",
    ]);
  });
});

describe("employee update and the primary site", () => {
  it("drops locationId so only Make primary can change it", () => {
    expect(
      omitPrimaryLocationFromEmployeeUpdate({
        firstName: "Zaid",
        locationId: WAREHOUSE,
      }),
    ).toEqual({ firstName: "Zaid" });
  });
});
