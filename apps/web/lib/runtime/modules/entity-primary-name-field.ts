/*
 * The primary display field for an entity a lookup can point at.
 *
 * ITEM-0036: this used to be answered by `metadata-registry.ts`'s
 * `getEntityMetadata()`, an in-memory map nothing ever populated —
 * `registerEntityMetadata` had zero callers, so every lookup through it fell
 * through to a hardcoded `"name"`. That is silently wrong for any entity whose
 * primary field is not literally `name` (`employee` uses `fullName`), and the
 * one place it was live — `employee-metadata.adapter.ts`'s lookup fields,
 * which only ever set `entityLogicalName` — hit exactly that case.
 *
 * `standard-module-specs.ts`'s own field builder
 * (`standard-module-runtime.ts`, `lookupTargetsForField`) already had the
 * right answer for this and always resolves it inline on the field, so it
 * never went through the dead registry. Extracted here so every caller reads
 * the same one answer, instead of each guessing `"name"` independently.
 */
export function defaultPrimaryNameFieldForEntity(entityLogicalName: string) {
  if (
    entityLogicalName === "currency" ||
    entityLogicalName === "settings_currencies"
  ) {
    return "name";
  }
  if (entityLogicalName === "employerBankAccount") return "name";
  if (entityLogicalName === "businessUnit") return "name";
  if (entityLogicalName === "employee") return "fullName";
  if (entityLogicalName === "employeeBankAccount") {
    return "accountTitle";
  }

  return "name";
}
