/*
 * Reads the parts of a tenant's published customization snapshot that the
 * runtime needs to decide whether a custom module exists for end users.
 *
 * ADR-0016: a custom module renders in the tenant product only once it is
 * published, and "published" is whatever the latest published
 * `CustomizationPublishSnapshot` says — never the live draft tables. The live
 * rows still matter (a module deactivated after publishing must disappear), so
 * callers intersect this index with live `isActive` rows rather than trusting
 * the snapshot's copy of them.
 *
 * Two snapshot shapes are in production, written by two publish paths in
 * `customization.service.ts`:
 *
 *   - the Publish Center (package publish) writes
 *     `{ modules, fields, forms, views, effectiveMetadata, … }`, holding only
 *     rows whose solution component is `published`;
 *   - `publish()` and `publishTenantDefaults()` write
 *     `{ tables, columns, forms, views }`, holding every row at publish time.
 *
 * Anything else — null, an array, a snapshot with neither table list — yields
 * `null`, which callers treat as "no published custom modules". Failing closed
 * here is the point: an unreadable snapshot must not make drafts reachable.
 */

export type PublishedFormRow = {
  readonly id: string;
  readonly tableId: string;
  readonly formKey: string;
  readonly name: string;
  readonly type: string;
  readonly isDefault: boolean;
  readonly layoutJson: unknown;
};

export type PublishedViewRow = {
  readonly id: string;
  readonly tableId: string;
  readonly viewKey: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly columnsJson: unknown;
  readonly filtersJson: unknown;
  readonly sortingJson: unknown;
};

export type PublishedCustomizationIndex = {
  readonly tableIds: ReadonlySet<string>;
  readonly columnIds: ReadonlySet<string>;
  /** Active forms only. */
  readonly forms: readonly PublishedFormRow[];
  /** Non-hidden views only. */
  readonly views: readonly PublishedViewRow[];
};

export function readPublishedCustomizationIndex(
  snapshotJson: unknown,
): PublishedCustomizationIndex | null {
  const root = asObject(snapshotJson);
  if (!root) return null;

  /*
   * The package shape spreads `effectiveMetadata` into the root as well, but
   * the nested copy is the one `getEffectiveMetadata` produced, so prefer it
   * when present and fall back to the root for the legacy shape.
   */
  const source = asObject(root.effectiveMetadata) ?? root;
  const tables = asArray(source.tables) ?? asArray(source.modules);
  if (!tables) return null;

  const columns = asArray(source.columns) ?? asArray(source.fields) ?? [];
  const forms = asArray(source.forms) ?? [];
  const views = asArray(source.views) ?? [];

  return {
    tableIds: new Set(tables.flatMap((row) => idOf(row))),
    columnIds: new Set(columns.flatMap((row) => idOf(row))),
    forms: forms.flatMap((row): PublishedFormRow[] => {
      const form = asObject(row);
      if (!form || form.isActive === false) return [];
      const id = stringOf(form.id);
      const tableId = stringOf(form.tableId);
      const formKey = stringOf(form.formKey);
      if (!id || !tableId || !formKey) return [];
      return [
        {
          id,
          tableId,
          formKey,
          name: stringOf(form.name) || formKey,
          type: stringOf(form.type) || 'main',
          isDefault: form.isDefault === true,
          layoutJson: form.layoutJson ?? null,
        },
      ];
    }),
    views: views.flatMap((row): PublishedViewRow[] => {
      const view = asObject(row);
      if (!view || view.isHidden === true) return [];
      const id = stringOf(view.id);
      const tableId = stringOf(view.tableId);
      const viewKey = stringOf(view.viewKey);
      if (!id || !tableId || !viewKey) return [];
      return [
        {
          id,
          tableId,
          viewKey,
          name: stringOf(view.name) || viewKey,
          isDefault: view.isDefault === true,
          columnsJson: view.columnsJson ?? null,
          filtersJson: view.filtersJson ?? null,
          sortingJson: view.sortingJson ?? null,
        },
      ];
    }),
  };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function idOf(row: unknown): string[] {
  const id = stringOf(asObject(row)?.id);
  return id ? [id] : [];
}
