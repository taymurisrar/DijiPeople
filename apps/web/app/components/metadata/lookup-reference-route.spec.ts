import {
  isReadOnlyLookupReferenceModule,
  resolveLookupReferenceRoute,
} from "./lookup-reference-route";

describe("resolveLookupReferenceRoute", () => {
  it("resolves a settings-runtime style entity name (lowercase, plural, settings_ prefixed)", () => {
    expect(resolveLookupReferenceRoute("settings_countries")).toEqual({
      basePath: "/settings/regional/geography/countries",
      moduleKey: "countries",
    });
  });

  it("resolves an underscore-separated entity name to its hyphenated destination", () => {
    expect(resolveLookupReferenceRoute("settings_employee_levels")).toEqual({
      basePath: "/settings/people/workforce/employee-levels",
      moduleKey: "employee-levels",
    });
  });

  /*
   * ITEM-0163 / BUG-3376 — before this fix, every bespoke Employee lookup
   * field (`employee-metadata.adapter.ts`'s `lookupEntity`) silently rendered
   * no link at all: the old map matched the raw entity string with no
   * normalization, and every one of these is singular/camelCase where the
   * map's keys were plural/lowercase.
   */
  it.each([
    ["team", "/settings/general-setup/organization/teams"],
    ["department", "/settings/general-setup/organization/departments"],
    ["designation", "/settings/people/workforce/designations"],
    ["location", "/settings/people/work-management/locations"],
    ["organization", "/settings/general-setup/organization/organizations"],
    ["businessUnit", "/settings/general-setup/organization/business-units"],
    ["workSchedule", "/settings/people/work-management/work-schedules"],
    ["employeeLevel", "/settings/people/workforce/employee-levels"],
    ["user", "/settings/security-access/identities/users"],
    ["stateProvince", "/settings/regional/geography/states"],
    ["country", "/settings/regional/geography/countries"],
    ["city", "/settings/regional/geography/cities"],
    ["employee", "/employees"],
  ])(
    "resolves the bespoke employee-domain spelling %s",
    (entityLogicalName, expectedBasePath) => {
      expect(resolveLookupReferenceRoute(entityLogicalName)?.basePath).toBe(
        expectedBasePath,
      );
    },
  );

  it("keeps roles and teams distinct even though both normalize from plural names", () => {
    expect(resolveLookupReferenceRoute("roles")?.basePath).toBe(
      "/settings/security-access/authorization/roles",
    );
    expect(resolveLookupReferenceRoute("teams")?.basePath).toBe(
      "/settings/access/teams",
    );
  });

  it("returns null for a target with no known destination, rather than guessing", () => {
    expect(resolveLookupReferenceRoute("someFutureEntity")).toBeNull();
  });
});

describe("isReadOnlyLookupReferenceModule", () => {
  it("flags only the reference-value destinations, not record-id ones", () => {
    expect(isReadOnlyLookupReferenceModule("countries")).toBe(true);
    expect(isReadOnlyLookupReferenceModule("currencies")).toBe(true);
    expect(isReadOnlyLookupReferenceModule("timezones")).toBe(true);
    expect(isReadOnlyLookupReferenceModule("employees")).toBe(false);
    expect(isReadOnlyLookupReferenceModule("teams")).toBe(false);
  });
});
