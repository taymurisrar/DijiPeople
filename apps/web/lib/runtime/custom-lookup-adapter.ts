/*
 * BUG-3787 / TASK-0035 — gives a record page's adapter options for lookups
 * that name their target only by table key (custom lookup fields, and every
 * lookup on a custom module), and leaves every other field exactly as it was.
 *
 * Applied only when the form has such a field. For any other field it answers
 * what the page answered before: the adapter's own resolver when it has one,
 * otherwise the options the page preloaded — never an empty list that would
 * wipe them when a dependency changes.
 */
import {
  loadLookupOptions,
  resolvableLookupTarget,
} from "./custom-lookup-options";
import type {
  ModuleDataAdapter,
  ModuleLookupOption,
} from "./module-data-adapter.types";
import type { FieldMetadata } from "./metadata-runtime.types";

export function withTargetLookupOptions<TRecord, TValues>(
  adapter: ModuleDataAdapter<TRecord, TValues>,
  fields: readonly FieldMetadata[],
  preloaded: Readonly<Record<string, readonly ModuleLookupOption[]>> = {},
): ModuleDataAdapter<TRecord, TValues> {
  const resolvesLookups = Boolean(adapter.getLookupOptions);
  if (!fields.some((field) => resolvableLookupTarget(field, resolvesLookups))) {
    return adapter;
  }
  return {
    ...adapter,
    async getLookupOptions(runtime, field, values, options) {
      const target = resolvableLookupTarget(field, resolvesLookups);
      if (target) return loadLookupOptions(target, options?.search);
      if (adapter.getLookupOptions) {
        return adapter.getLookupOptions(runtime, field, values, options);
      }
      return preloaded[field.logicalName] ?? [];
    },
  };
}
