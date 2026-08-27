import { listPlatformModuleDefinitions } from "./platform-module-registry";
import type { RuntimeFieldDefinition } from "./platform-runtime.types";

/*
 * BUG-1578. `CustomerAccount.country` is a plain string column holding a
 * country *name*. Twelve of the thirteen customers on production held one; the
 * thirteenth — the only one created through the admin form — held
 * `ec7dbbe3-1179-4465-990f-06427a4ab59f`, because the form declared the field a
 * lookup and lookups submit ids.
 *
 * It surfaced on a legal document. `customerSource()` builds a counterparty's
 * registered address by joining the address columns, and with the rest of them
 * empty the address *was* the country value — so a generated agreement named a
 * UUID as where the counterparty is registered. A populated wrong field is
 * worse than an empty one: nothing looks broken.
 *
 * The guard is on the registry rather than on the one field that was wrong,
 * because the next country field added to the next module is where this
 * recurs, and it is invisible until something renders it.
 */

function everyField(): Array<{
  module: string;
  field: RuntimeFieldDefinition;
}> {
  const found: Array<{ module: string; field: RuntimeFieldDefinition }> = [];

  for (const definition of listPlatformModuleDefinitions()) {
    // Fields hang off each form, not off the module: one module declares
    // create, detail and edit, and a field can appear in more than one.
    for (const form of definition.forms ?? []) {
      for (const field of form.fields ?? []) {
        found.push({ module: `${definition.key}/${form.key}`, field });
      }
    }
  }

  return found;
}

describe("country fields submit a name, not a lookup id", () => {
  const fields = everyField();

  it("reads fields from the registry", () => {
    // Guards the guard: a registry walk that finds nothing would pass for the
    // wrong reason.
    expect(fields.length).toBeGreaterThan(50);
  });

  const countryFields = fields.filter(
    ({ field }) => field.key === "country" && field.type === "lookup",
  );

  it("finds the country lookups it is meant to be checking", () => {
    expect(countryFields.length).toBeGreaterThan(0);
  });

  it.each(countryFields.map((entry) => [entry.module, entry] as const))(
    "%s declares submitsLabel on its country lookup",
    (_module, { field }) => {
      /*
       * Without this the control submits the selected record's id, and the
       * column — which every other writer and reader treats as a display
       * name — silently starts holding a UUID.
       */
      expect(field.submitsLabel).toBe(true);
    },
  );
});
