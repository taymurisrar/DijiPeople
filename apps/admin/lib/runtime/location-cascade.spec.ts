import { getPlatformModuleDefinition } from "./platform-module-registry";
import {
  bindRuntimeLookupPath,
  collectRuntimeLookupPaths,
  lookupDependents,
  resolveAllowedLookupSource,
  resolveLookupBindings,
} from "./runtime-lookups";
import { listPlatformModuleDefinitions } from "./platform-module-registry";

/*
 * Country → State or province → City on the commercial forms.
 *
 * The three were a lookup and two free-text inputs, so a lead could say
 * "Pakistan / Texas / Dubai". Each is now a searchable lookup scoped by the one
 * above it, and changing a parent clears what it scoped.
 */
const fieldsOf = (moduleKey: "leads" | "customers") =>
  getPlatformModuleDefinition(moduleKey).forms.flatMap((form) => form.fields);

describe.each(["leads", "customers"] as const)("%s location fields", (key) => {
  const fields = fieldsOf(key);
  const field = (name: string) => fields.find((item) => item.key === name)!;

  it("are searchable lookups that store the place name", () => {
    for (const name of ["country", "stateProvince", "city"]) {
      expect(field(name).type).toBe("lookup");
      expect(field(name).submitsLabel).toBe(true);
      expect(field(name).lookupPath).toMatch(/^\/public\/geography\//);
    }
  });

  it("scope State by Country and City by Country and State", () => {
    expect(field("stateProvince").lookupPath).toContain("{country}");
    expect(field("city").lookupPath).toContain("{country}");
    expect(field("city").lookupPath).toContain("{stateProvince?}");
  });

  it("clear State and City when Country changes, and City when State changes", () => {
    expect(lookupDependents(fields, "country").sort()).toEqual([
      "city",
      "stateProvince",
    ]);
    expect(lookupDependents(fields, "stateProvince")).toEqual(["city"]);
    expect(lookupDependents(fields, "city")).toEqual([]);
  });
});

describe("name-valued lookup bindings", () => {
  const states = "/public/geography/states?country={country}";
  const cities =
    "/public/geography/cities?country={country}&state={stateProvince?}";

  it("load nothing until the parent has a value", () => {
    expect(resolveLookupBindings(states, {})).toBeNull();
    expect(resolveLookupBindings(cities, { stateProvince: "Dubai" })).toBeNull();
  });

  it("accept a place name in the query string", () => {
    expect(
      resolveLookupBindings(states, { country: "Côte d'Ivoire" }),
    ).toEqual({ country: "Côte d'Ivoire" });
    expect(
      bindRuntimeLookupPath(states, { country: "United Arab Emirates" }),
    ).toBe("/public/geography/states?country=United%20Arab%20Emirates");
  });

  it("send an optional State empty, so a country without states still lists cities", () => {
    expect(resolveLookupBindings(cities, { country: "Bahrain" })).toEqual({
      country: "Bahrain",
      stateProvince: "",
    });
    expect(bindRuntimeLookupPath(cities, { country: "Bahrain" })).toBe(
      "/public/geography/cities?country=Bahrain&state=",
    );
  });

  it("refuse a value that could add a parameter or change the path", () => {
    for (const hostile of ["a&search=x", "x?y", "../../admin", "50%", "a=b"])
      expect(bindRuntimeLookupPath(states, { country: hostile })).toBeNull();
  });

  it("keep path placeholders id-shaped", () => {
    expect(
      bindRuntimeLookupPath("/super-admin/partners/{partnerId}/leads", {
        partnerId: "United Arab Emirates",
      }),
    ).toBeNull();
  });

  it("are allowlisted through the lookup route", () => {
    const allowed = collectRuntimeLookupPaths(listPlatformModuleDefinitions());
    const parameters = new URLSearchParams({
      path: cities,
      "bind.country": "Pakistan",
      "bind.stateProvince": "Punjab",
    });
    expect(resolveAllowedLookupSource(allowed, parameters)).toBe(
      "/public/geography/cities?country=Pakistan&state=Punjab",
    );
  });
});
