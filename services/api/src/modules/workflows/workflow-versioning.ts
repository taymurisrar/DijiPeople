import { createHash } from 'node:crypto';

/*
 * DP-MASTER/WP-03.S2 (A08, A12). A workflow has a stable logical key that never
 * changes when it is renamed, and a published version that is an immutable
 * snapshot of what it does. Packages, run history and reports refer to the key
 * and the version number, never to a row id or a display name.
 */

export type WorkflowDefinitionInput = {
  eventCode: string;
  moduleKey: string | null;
  scopeKey: string;
  conditions: unknown;
  actions: {
    type: string;
    sortOrder: number;
    isActive: boolean;
    configuration: unknown;
  }[];
};

/** `[a-z0-9]` words joined by single hyphens, at most 64 characters. */
export function slugifyWorkflowKey(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
  return slug || 'workflow';
}

/** First free key for a tenant: `base`, `base-2`, `base-3` ... */
export function nextFreeWorkflowKey(
  base: string,
  taken: ReadonlySet<string>,
): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, 64 - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Only what executing the workflow depends on; cosmetic fields are excluded. */
export function buildWorkflowDefinition(workflow: WorkflowDefinitionInput) {
  return {
    eventCode: workflow.eventCode,
    moduleKey: workflow.moduleKey,
    scopeKey: workflow.scopeKey,
    conditions: Array.isArray(workflow.conditions) ? workflow.conditions : [],
    actions: [...workflow.actions]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((action) => ({
        type: action.type,
        sortOrder: action.sortOrder,
        isActive: action.isActive,
        configuration: action.configuration ?? {},
      })),
  };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

/** Stable across key order, so an unchanged definition never mints a version. */
export function checksumWorkflowDefinition(
  definition: ReturnType<typeof buildWorkflowDefinition>,
): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(definition)))
    .digest('hex');
}
