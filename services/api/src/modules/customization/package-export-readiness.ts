/*
 * Whether a package carries everything it needs to be imported elsewhere.
 *
 * A package that exports cleanly but references metadata it does not contain
 * fails in the target tenant, usually after the administrator has already
 * committed to the migration. The check has to happen before the download, and
 * it has to name what is missing rather than only say "incomplete".
 *
 * A pure function so it can be tested without a database.
 */

export type ExportableComponent = {
  componentType: string;
  objectKey: string;
  displayName?: string | null;
  moduleKey?: string | null;
  /*
   * Keys this component needs in order to work: a lookup column names the
   * module it points at, a form names the fields it lays out.
   */
  dependencies?: readonly string[];
};

export type ExportGap = {
  severity: 'error' | 'warning';
  /* The component that needs something. */
  componentKey: string;
  componentType: string;
  /* What it needs that the package does not carry. */
  missingKey: string;
  message: string;
};

export type ExportReadiness = {
  /* False when at least one error-severity gap exists. */
  ready: boolean;
  componentCount: number;
  gaps: ExportGap[];
};

/**
 * Compares every component's declared dependencies against what the package
 * actually contains.
 *
 * `systemKeys` are the keys the target tenant is expected to already have —
 * system modules ship with the product, so a dependency on one is satisfied
 * without shipping it. Depending on something that is neither in the package
 * nor a system key is an error: the import would land broken.
 */
export function analyzePackageExport(input: {
  components: readonly ExportableComponent[];
  systemKeys?: readonly string[];
}): ExportReadiness {
  const { components } = input;
  const systemKeys = new Set(input.systemKeys ?? []);

  /* Everything the package itself provides, by every name it can be cited by. */
  const provided = new Set<string>();
  for (const component of components) {
    if (component.objectKey) provided.add(component.objectKey);
    if (component.moduleKey) provided.add(component.moduleKey);
  }

  const gaps: ExportGap[] = [];
  const seen = new Set<string>();

  for (const component of components) {
    for (const dependency of component.dependencies ?? []) {
      const key = dependency?.trim();
      if (!key) continue;
      if (provided.has(key)) continue;

      /* One gap per component/dependency pair, however often it recurs. */
      const gapId = `${component.objectKey}::${key}`;
      if (seen.has(gapId)) continue;
      seen.add(gapId);

      const isSystem = systemKeys.has(key);
      gaps.push({
        severity: isSystem ? 'warning' : 'error',
        componentKey: component.objectKey,
        componentType: component.componentType,
        missingKey: key,
        message: isSystem
          ? `${component.objectKey} depends on the system module ${key}. The target tenant must have it enabled.`
          : `${component.objectKey} depends on ${key}, which is not in this package. Add it, or the import will land incomplete.`,
      });
    }
  }

  /* Errors first: they block, and they are what an administrator must act on. */
  gaps.sort((left, right) =>
    left.severity === right.severity ? 0 : left.severity === 'error' ? -1 : 1,
  );

  return {
    ready: !gaps.some((gap) => gap.severity === 'error'),
    componentCount: components.length,
    gaps,
  };
}
