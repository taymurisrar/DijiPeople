/**
 * The authoritative definition of what a custom module gets on creation.
 *
 * Why a plan and not inline writes: creation, reconciliation of an older or
 * half-built module, and the completeness validator must all agree on the same
 * list. They read it from here, so a component added to the plan is created for
 * new modules, back-filled for existing ones, and checked by
 * `scripts/check-module-completeness.mjs` without three edits.
 *
 * Deliberate omissions (do not "fix" these without a schema decision):
 *  - No Active / Inactive / My Records views. A custom module has no status
 *    column, and an owner is stored on the record row rather than as a column
 *    key, so a filter on either is silently dropped by the web runtime
 *    (`custom-module-runtime.ts` keeps only known column keys). A view that
 *    claims to filter and does not is worse than no view.
 *  - No per-module permission or audit rows. All custom records share the
 *    `custom-records` RBAC entity and are audited by `custom-data.service.ts`.
 */
import { CustomizationFormType } from '@prisma/client';

/** Bump when the plan gains or changes a component; reconciliation keys off it. */
export const MODULE_PROVISIONING_VERSION = 1;

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
  /** Only the primary-name column is shown. */
  readonly lookupOnly?: boolean;
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
    formKey: 'quick-create',
    type: CustomizationFormType.quick,
    nameSuffix: 'Quick Create',
    isDefault: false,
  },
  {
    formKey: 'quick-view',
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
  { viewKey: 'all', nameTemplate: (p) => `All ${p}`, isDefault: true },
  {
    viewKey: 'recent',
    nameTemplate: (p) => `Recent ${p}`,
    isDefault: false,
    recentFirst: true,
  },
  {
    viewKey: 'quick-find',
    nameTemplate: (p) => `Quick Find ${p}`,
    isDefault: false,
  },
  {
    viewKey: 'lookup',
    nameTemplate: (p) => `${p} Lookup`,
    isDefault: false,
    lookupOnly: true,
  },
];

/**
 * Legacy default view key. Modules created before the plan existed carry
 * `active` as their default; it is treated as satisfying `all` so that
 * reconciliation never adds a second default or renames a customised view.
 */
export const LEGACY_DEFAULT_VIEW_KEY = 'active';

export interface ExistingModuleComponents {
  readonly formKeys: readonly string[];
  readonly viewKeys: readonly string[];
  readonly hasDefaultView: boolean;
  readonly hasActionBar: boolean;
}

export interface ModuleComponentGap {
  readonly forms: readonly PlannedForm[];
  readonly views: readonly PlannedView[];
  readonly actionBar: boolean;
}

/** What a module is missing. Pure: no database, no clock, safe to re-run. */
export function missingModuleComponents(
  existing: ExistingModuleComponents,
): ModuleComponentGap {
  const forms = new Set(existing.formKeys);
  const views = new Set(existing.viewKeys);
  return {
    forms: PLANNED_FORMS.filter((f) => !forms.has(f.formKey)),
    views: PLANNED_VIEWS.filter(
      (v) =>
        !views.has(v.viewKey) &&
        !(v.viewKey === 'all' && views.has(LEGACY_DEFAULT_VIEW_KEY)),
    ),
    actionBar: !existing.hasActionBar,
  };
}

export function isModuleComplete(existing: ExistingModuleComponents): boolean {
  const gap = missingModuleComponents(existing);
  return !gap.forms.length && !gap.views.length && !gap.actionBar;
}
