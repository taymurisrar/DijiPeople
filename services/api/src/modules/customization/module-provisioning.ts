/**
 * The authoritative definition of what a custom module gets on creation.
 *
 * Why a plan and not inline writes: creation, reconciliation of an older or
 * half-built module, package import and the completeness validator must all
 * agree on the same list. They read it from here, so a component added to the
 * plan is created for new modules, back-filled for existing ones, and checked by
 * `scripts/check-module-completeness.mjs` without several edits.
 *
 * The plan is PROFILE-DRIVEN. A module's `moduleKind` (schema:
 * CustomizationModuleKind) decides what it receives, because a component that
 * is right for one kind is wrong for another:
 *   - "My Records" exists only where a person owns records (STANDARD);
 *   - "Active / Inactive Records" exist only where records can be deactivated
 *     (everything except IMMUTABLE);
 *   - commands that edit, delete or deactivate are offered only where the
 *     record lifecycle (data/custom-record-lifecycle.ts) permits them.
 * The same lifecycle rules make the API refuse what the command bar hides.
 *
 * View filters use the record-level system fields `isActive` and `ownerUserId`
 * (always present on a custom record) and the `@me` token, which the web
 * runtime resolves to the signed-in user.
 *
 * Still deliberately not provisioned:
 *  - Associated / related-record views. The web runtime has no subgrid for
 *    custom modules; a view that claims to relate records and does not is worse
 *    than none. (Relationship LOOKUP columns and lookup selectors already work.)
 *  - Per-module permission rows. All custom records share the `custom-records`
 *    RBAC entity; separate permissioning is a product decision.
 */
import { CustomizationFormType, CustomizationModuleKind } from '@prisma/client';
import { lifecycleOf } from '../data/custom-record-lifecycle';

/** Bump when the plan gains or changes a component; reconciliation reports on it. */
export const MODULE_PROVISIONING_VERSION = 2;

/** Resolved by the web runtime to the signed-in user's id. */
export const CURRENT_USER_TOKEN = '@me';

export interface ViewFilter {
  readonly columnKey: string;
  readonly operator: 'eq' | 'neq';
  readonly value: string | boolean;
}

export interface PlannedForm {
  readonly formKey: string;
  readonly type: CustomizationFormType;
  readonly nameSuffix: string;
  readonly isDefault: boolean;
}

export interface PlannedView {
  readonly viewKey: string;
  readonly nameTemplate: (plural: string) => string;
  readonly isDefault: boolean;
  readonly filters: readonly ViewFilter[];
  /** Offered only where records can be deactivated. */
  readonly needsDeactivate?: boolean;
  /** Offered only where a person owns records. */
  readonly needsUserOwned?: boolean;
  /** Sort by modified date, newest first. */
  readonly recentFirst?: boolean;
}

export const PLANNED_FORMS: readonly PlannedForm[] = [
  {
    formKey: 'main',
    type: CustomizationFormType.main,
    nameSuffix: 'Main Form',
    isDefault: true,
  },
  {
    formKey: 'quickCreate',
    type: CustomizationFormType.quick,
    nameSuffix: 'Quick Create',
    isDefault: false,
  },
  {
    formKey: 'quickView',
    type: CustomizationFormType.card,
    nameSuffix: 'Quick View',
    isDefault: false,
  },
  {
    formKey: 'lookup',
    type: CustomizationFormType.lookup,
    nameSuffix: 'Lookup Form',
    isDefault: false,
  },
];

export const PLANNED_VIEWS: readonly PlannedView[] = [
  {
    viewKey: 'all',
    nameTemplate: (p) => `All ${p}`,
    isDefault: true,
    filters: [],
  },
  {
    viewKey: 'activeRecords',
    nameTemplate: (p) => `Active ${p}`,
    isDefault: false,
    needsDeactivate: true,
    filters: [{ columnKey: 'isActive', operator: 'eq', value: true }],
  },
  {
    viewKey: 'inactiveRecords',
    nameTemplate: (p) => `Inactive ${p}`,
    isDefault: false,
    needsDeactivate: true,
    filters: [{ columnKey: 'isActive', operator: 'eq', value: false }],
  },
  {
    viewKey: 'myRecords',
    nameTemplate: (p) => `My ${p}`,
    isDefault: false,
    needsUserOwned: true,
    filters: [
      { columnKey: 'ownerUserId', operator: 'eq', value: CURRENT_USER_TOKEN },
    ],
  },
  {
    viewKey: 'recent',
    nameTemplate: (p) => `Recent ${p}`,
    isDefault: false,
    recentFirst: true,
    filters: [],
  },
  {
    viewKey: 'quickFind',
    nameTemplate: (p) => `Quick Find ${p}`,
    isDefault: false,
    filters: [],
  },
  {
    viewKey: 'lookup',
    nameTemplate: (p) => `${p} Lookup`,
    isDefault: false,
    filters: [],
  },
];

/**
 * Legacy default view key. Modules created before the plan carry an unfiltered
 * `active` as their default; it satisfies `all`, so reconciliation never adds a
 * second default or renames a customised view. (The plan's filtered view is
 * `activeRecords`, a different key, precisely so the two cannot be confused.)
 */
export const LEGACY_DEFAULT_VIEW_KEY = 'active';

export function viewsFor(
  kind: CustomizationModuleKind | null | undefined,
): readonly PlannedView[] {
  const lifecycle = lifecycleOf(kind);
  return PLANNED_VIEWS.filter(
    (v) =>
      (!v.needsDeactivate || lifecycle.deactivate) &&
      (!v.needsUserOwned || lifecycle.userOwned),
  );
}

export function formsFor(
  _kind: CustomizationModuleKind | null | undefined,
): readonly PlannedForm[] {
  return PLANNED_FORMS;
}

/**
 * The command bar for a module kind, derived from the base command list so the
 * two cannot drift: the kind removes commands its records cannot honour and
 * adds activate/deactivate where status changes make sense.
 */
export function commandsFor(
  kind: CustomizationModuleKind | null | undefined,
  base: readonly string[],
): string[] {
  const lifecycle = lifecycleOf(kind);
  const out = base.filter((c) => {
    if (c === 'system.edit') return lifecycle.update;
    if (c === 'system.delete') return lifecycle.delete;
    if (c === 'record.assignOwner' || c === 'record.share')
      return lifecycle.userOwned;
    if (c === 'system.import') return lifecycle.update;
    return true;
  });
  if (lifecycle.deactivate)
    out.push(
      'record.activate',
      'record.deactivate',
      'selection.activate',
      'selection.deactivate',
    );
  return out;
}

export interface ExistingModuleComponents {
  readonly formKeys: readonly string[];
  readonly viewKeys: readonly string[];
  readonly hasDefaultView: boolean;
  readonly hasActionBar: boolean;
  /** Commands on the existing action bar, when there is one (to report a stale list; never rewritten). */
  readonly actionBarCommands?: readonly string[];
}

export interface ModuleComponentGap {
  readonly forms: readonly PlannedForm[];
  readonly views: readonly PlannedView[];
  readonly actionBar: boolean;
}

/** What a module is missing for its kind. Pure: no database, no clock, safe to re-run. */
export function missingModuleComponents(
  existing: ExistingModuleComponents,
  kind: CustomizationModuleKind | null | undefined = 'STANDARD',
): ModuleComponentGap {
  const forms = new Set(existing.formKeys);
  const views = new Set(existing.viewKeys);
  return {
    forms: formsFor(kind).filter((f) => !forms.has(f.formKey)),
    views: viewsFor(kind).filter(
      (v) =>
        !views.has(v.viewKey) &&
        !(v.viewKey === 'all' && views.has(LEGACY_DEFAULT_VIEW_KEY)),
    ),
    actionBar: !existing.hasActionBar,
  };
}

export function isModuleComplete(
  existing: ExistingModuleComponents,
  kind: CustomizationModuleKind | null | undefined = 'STANDARD',
): boolean {
  const gap = missingModuleComponents(existing, kind);
  return !gap.forms.length && !gap.views.length && !gap.actionBar;
}
