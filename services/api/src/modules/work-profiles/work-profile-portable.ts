/*
 * DP-MASTER/WP-35.S2 (ADR-0030). Work profiles as portable `.djpkg` components.
 *
 * A profile's PUBLISHED definition travels as `workProfile:<profile key>`, and
 * each unit it measures in as `workUnit:<unit key>`. Everything here is pure -
 * no database, no clock - so the export is byte-deterministic and the import
 * plan can be unit-tested without a server. The service in
 * work-profiles-portable.service.ts supplies the tenant's current state and
 * applies the plan.
 *
 * Nothing tenant-specific crosses the boundary: no tenant id, row id, actor or
 * timestamp is written into a component, and an import refuses a package that
 * carries a `tenantId` anywhere (the tenant is always the importing user's).
 */
import {
  buildPackageArtifact,
  canonicalJson,
  isWorkComponentType,
  type PackageArtifact,
  type PortableComponent,
  type PortableComponentInput,
} from '../customization/package-artifact';
import {
  validateUnitCompatibility,
  type WorkProfileDefinition,
  type WorkUnitKindValue,
} from './work-profile-definition';

export const WORK_PROFILE_PUBLISHER = {
  publisherKey: 'workprofiles',
  displayName: 'Work profiles',
  prefix: 'wkp',
} as const;

export const WORK_PROFILE_IMPORT_MAX_PROFILES = 50;

export type PortableUnitSource = {
  key: string;
  name: string;
  kind: WorkUnitKindValue;
};

export type PortableProfileSource = {
  key: string;
  name: string;
  description: string | null;
  /** The published version being exported. */
  version: number;
  definition: WorkProfileDefinition;
  publishedAt: Date | null;
};

/** `wkp_p<alphanumerics>`: a package key must be `<prefix>_<letter><alnum>`. */
export function workProfilePackageKey(profileKey: string): string {
  const alnum = profileKey.replace(/[^a-z0-9]/gi, '');
  return `${WORK_PROFILE_PUBLISHER.prefix}_p${alnum}`;
}

export function referencedUnitKeys(
  definition: WorkProfileDefinition,
): string[] {
  return [...new Set(definition.workTypes.map((type) => type.unitKey))].sort();
}

export function buildWorkProfilePackage(input: {
  profile: PortableProfileSource;
  units: readonly PortableUnitSource[];
}): { artifact: PackageArtifact; serialized: string } {
  const { profile } = input;
  const unitByKey = new Map(input.units.map((unit) => [unit.key, unit]));
  const components: PortableComponentInput[] = [];

  for (const unitKey of referencedUnitKeys(profile.definition)) {
    const unit = unitByKey.get(unitKey);
    if (!unit) {
      throw new Error(
        `Export refused: unit "${unitKey}" used by this profile does not exist.`,
      );
    }
    components.push({
      key: `workUnit:${unit.key}`,
      type: 'workUnit',
      objectKey: unit.key,
      parentKey: null,
      layerAction: 'create',
      baseIsSystem: false,
      definition: { key: unit.key, name: unit.name, kind: unit.kind },
      layer: null,
      dependsOn: [],
    });
  }
  components.push({
    key: `workProfile:${profile.key}`,
    type: 'workProfile',
    objectKey: profile.key,
    parentKey: null,
    layerAction: 'create',
    baseIsSystem: false,
    definition: {
      key: profile.key,
      name: profile.name,
      description: profile.description,
      definition: profile.definition,
    },
    layer: null,
    dependsOn: referencedUnitKeys(profile.definition).map(
      (unitKey) => `workUnit:${unitKey}`,
    ),
  });

  return buildPackageArtifact({
    manifest: {
      packageKey: workProfilePackageKey(profile.key),
      displayName: `Work profile ${profile.name}`.slice(0, 100),
      description: null,
      version: `${profile.version}.0.0`,
      publisher: { ...WORK_PROFILE_PUBLISHER },
      metadataSchemaVersion: '1.0.0',
      sourceEnvironmentType: null,
      releasedAt: profile.publishedAt?.toISOString() ?? null,
      dependencies: [],
      coreDependencies: [],
    },
    components,
  });
}

/* ------------------------------------------------------------------- import */

export type ExistingUnit = {
  key: string;
  kind: WorkUnitKindValue;
  isActive: boolean;
};

export type ExistingProfile = {
  key: string;
  isActive: boolean;
  hasDraft: boolean;
  /** The highest-numbered published version's definition, if any. */
  latestPublishedDefinition: unknown;
};

export type ImportAction = 'create' | 'new-version' | 'unchanged';
export type ImportItem = { key: string; action: ImportAction };

export type WorkProfileImportPlan = {
  items: ImportItem[];
  problems: string[];
  units: PortableComponent[];
  profiles: PortableComponent[];
};

function containsTenantKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsTenantKey);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, child]) => key === 'tenantId' || containsTenantKey(child),
  );
}

/**
 * Decides what an import would do, without doing it. Every problem is collected
 * so one attempt shows the whole picture; an import with any problem writes
 * nothing.
 */
export function planWorkProfileImport(input: {
  components: readonly PortableComponent[];
  existingUnits: readonly ExistingUnit[];
  existingProfiles: readonly ExistingProfile[];
}): WorkProfileImportPlan {
  const problems: string[] = [];
  const items: ImportItem[] = [];
  const units = input.components.filter(
    (component) => component.type === 'workUnit',
  );
  const profiles = input.components.filter(
    (component) => component.type === 'workProfile',
  );

  for (const component of input.components) {
    if (!isWorkComponentType(component.type)) {
      problems.push(
        `${component.key} is not a work component; this importer only applies work units and work profiles.`,
      );
    } else if (
      containsTenantKey(component.definition) ||
      containsTenantKey(component.layer)
    ) {
      problems.push(
        `${component.key} carries a tenantId. Packages never choose the tenant they are imported into.`,
      );
    }
  }
  if (!profiles.length) problems.push('The package contains no work profile.');
  if (profiles.length > WORK_PROFILE_IMPORT_MAX_PROFILES) {
    problems.push(
      `A package may import at most ${WORK_PROFILE_IMPORT_MAX_PROFILES} profiles at once.`,
    );
  }

  const existingUnits = new Map(
    input.existingUnits.map((unit) => [unit.key, unit]),
  );
  const effectiveUnits = new Map(existingUnits);
  for (const component of units) {
    const definition = component.definition as {
      key: string;
      kind: WorkUnitKindValue;
    };
    const existing = existingUnits.get(definition.key);
    if (!existing) {
      effectiveUnits.set(definition.key, {
        key: definition.key,
        kind: definition.kind,
        isActive: true,
      });
      items.push({ key: component.key, action: 'create' });
    } else if (existing.kind !== definition.kind) {
      // A unit's kind is immutable: it would change what published versions mean.
      problems.push(
        `${component.key}: this tenant's unit is a ${existing.kind} unit; the package expects ${definition.kind}.`,
      );
    } else {
      items.push({ key: component.key, action: 'unchanged' });
    }
  }

  const existingProfiles = new Map(
    input.existingProfiles.map((profile) => [profile.key, profile]),
  );
  for (const component of profiles) {
    const definition = component.definition as {
      key: string;
      definition: WorkProfileDefinition;
    };
    problems.push(
      ...validateUnitCompatibility(definition.definition, [
        ...effectiveUnits.values(),
      ]).map((message) => `${component.key}: ${message}`),
    );

    const existing = existingProfiles.get(definition.key);
    if (!existing) {
      items.push({ key: component.key, action: 'create' });
      continue;
    }
    if (!existing.isActive) {
      problems.push(
        `${component.key}: the profile is inactive and cannot publish a version.`,
      );
    } else if (existing.hasDraft) {
      problems.push(
        `${component.key}: the profile has an open draft. Publish or finish it first.`,
      );
    } else if (
      existing.latestPublishedDefinition !== null &&
      existing.latestPublishedDefinition !== undefined &&
      canonicalJson(existing.latestPublishedDefinition) ===
        canonicalJson(definition.definition)
    ) {
      items.push({ key: component.key, action: 'unchanged' });
    } else {
      items.push({ key: component.key, action: 'new-version' });
    }
  }

  return {
    items,
    problems,
    units,
    profiles,
  };
}
