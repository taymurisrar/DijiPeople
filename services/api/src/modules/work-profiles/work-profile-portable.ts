/*
 * DP-MASTER/WP-35.S2 + WP-21.S1 (ADR-0030). Work units, profiles and queues as
 * portable `.djpkg` components.
 *
 * A profile's PUBLISHED definition travels as `workProfile:<profile key>`, each
 * unit it measures in as `workUnit:<unit key>` and a queue as
 * `workQueue:<queue key>`. Everything here is pure - no database, no clock - so
 * the export is byte-deterministic and the import plan can be unit-tested
 * without a server.
 *
 * There is ONE package engine (customization/package-alm.service.ts). This file
 * is the work components' contribution to it: how each is serialized, and the
 * one planner that decides what applying them would do. The engine's reader
 * builds components with the functions below, and both the engine and the
 * work-profiles import endpoint plan with `planWorkProfileImport` and write
 * through WorkComponentsService, so the two entry points cannot disagree.
 *
 * Nothing tenant-specific crosses the boundary: no tenant id, row id, actor,
 * timestamp, team or business unit is written into a component, and an import
 * refuses a package that carries a `tenantId` anywhere (the tenant is always
 * the importing user's).
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

/**
 * Only what is the same in every environment. The team and business unit a
 * queue belongs to are ids of THIS tenant and are deliberately absent: the
 * target maps its own.
 */
export type PortableQueueSource = {
  key: string;
  name: string;
  description: string | null;
  responseSlaMinutes: number | null;
  resolutionSlaMinutes: number | null;
  isActive: boolean;
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

/* ------------------------------------------------- the portable shapes */

const owned = {
  parentKey: null,
  layerAction: 'create',
  baseIsSystem: false,
  layer: null,
} as const;

export function unitDefinition(unit: PortableUnitSource) {
  return { key: unit.key, name: unit.name, kind: unit.kind };
}

export function profileDefinition(profile: {
  key: string;
  name: string;
  description: string | null;
  definition: WorkProfileDefinition;
}) {
  return {
    key: profile.key,
    name: profile.name,
    description: profile.description,
    definition: profile.definition,
  };
}

export function queueDefinition(queue: PortableQueueSource) {
  return {
    key: queue.key,
    name: queue.name,
    description: queue.description,
    responseSlaMinutes: queue.responseSlaMinutes,
    resolutionSlaMinutes: queue.resolutionSlaMinutes,
    isActive: queue.isActive,
  };
}

export function unitComponent(
  unit: PortableUnitSource,
): PortableComponentInput {
  return {
    ...owned,
    key: `workUnit:${unit.key}`,
    type: 'workUnit',
    objectKey: unit.key,
    definition: unitDefinition(unit),
    dependsOn: [],
  };
}

export function profileComponent(profile: {
  key: string;
  name: string;
  description: string | null;
  definition: WorkProfileDefinition;
}): PortableComponentInput {
  return {
    ...owned,
    key: `workProfile:${profile.key}`,
    type: 'workProfile',
    objectKey: profile.key,
    definition: profileDefinition(profile),
    dependsOn: referencedUnitKeys(profile.definition).map(
      (unitKey) => `workUnit:${unitKey}`,
    ),
  };
}

export function queueComponent(
  queue: PortableQueueSource,
): PortableComponentInput {
  return {
    ...owned,
    key: `workQueue:${queue.key}`,
    type: 'workQueue',
    objectKey: queue.key,
    definition: queueDefinition(queue),
    dependsOn: [],
  };
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
    components.push(unitComponent(unit));
  }
  components.push(profileComponent(profile));

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
  name?: string;
};

export type ExistingProfile = {
  key: string;
  isActive: boolean;
  hasDraft: boolean;
  /** The highest-numbered published version's definition, if any. */
  latestPublishedDefinition: unknown;
  name?: string;
  description?: string | null;
};

export type ExistingQueue = PortableQueueSource;

export type ImportAction = 'create' | 'new-version' | 'update' | 'unchanged';
export type ImportItem = {
  key: string;
  action: ImportAction;
  /**
   * Set (engine imports only) when the existing component's name, description
   * or active flag must follow the package. Never set by the legacy endpoint,
   * which leaves an existing component's metadata alone.
   */
  metadata?: true;
};

export type WorkProfileImportPlan = {
  items: ImportItem[];
  problems: string[];
  units: PortableComponent[];
  profiles: PortableComponent[];
  queues: PortableComponent[];
};

export type PlanOptions = {
  /**
   * The work-profiles endpoint's contract: the package must hold nothing but
   * units and profiles, and at least one profile. The engine (false) plans
   * only the work components of a package that may hold anything.
   */
  standalone: boolean;
  /** Existing components follow the package's name/description/active flag. */
  syncMetadata: boolean;
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
  existingQueues?: readonly ExistingQueue[];
  options?: Partial<PlanOptions>;
}): WorkProfileImportPlan {
  const options: PlanOptions = {
    standalone: true,
    syncMetadata: false,
    ...input.options,
  };
  const problems: string[] = [];
  const items: ImportItem[] = [];
  const considered = options.standalone
    ? input.components
    : input.components.filter((component) =>
        isWorkComponentType(component.type),
      );
  const units = considered.filter((component) => component.type === 'workUnit');
  const profiles = considered.filter(
    (component) => component.type === 'workProfile',
  );
  const queues = considered.filter(
    (component) => component.type === 'workQueue',
  );

  for (const component of considered) {
    if (
      !isWorkComponentType(component.type) ||
      (options.standalone && component.type === 'workQueue')
    ) {
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
  if (options.standalone && !profiles.length) {
    problems.push('The package contains no work profile.');
  }
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
      name: string;
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
    } else if (
      options.syncMetadata &&
      (!existing.isActive || existing.name !== definition.name)
    ) {
      effectiveUnits.set(definition.key, { ...existing, isActive: true });
      items.push({ key: component.key, action: 'update', metadata: true });
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
      name: string;
      description: string | null;
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
    const reactivate = options.syncMetadata && !existing.isActive;
    const metadataDiffers =
      options.syncMetadata &&
      (reactivate ||
        existing.name !== definition.name ||
        (existing.description ?? null) !== (definition.description ?? null));
    if (!existing.isActive && !reactivate) {
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
      items.push(
        metadataDiffers
          ? { key: component.key, action: 'update', metadata: true }
          : { key: component.key, action: 'unchanged' },
      );
    } else {
      items.push(
        metadataDiffers
          ? { key: component.key, action: 'new-version', metadata: true }
          : { key: component.key, action: 'new-version' },
      );
    }
  }

  const existingQueues = new Map(
    (input.existingQueues ?? []).map((queue) => [queue.key, queue]),
  );
  for (const component of queues) {
    const definition = component.definition as unknown as PortableQueueSource;
    const existing = existingQueues.get(definition.key);
    if (!existing) {
      items.push({ key: component.key, action: 'create' });
    } else if (
      canonicalJson(queueDefinition(existing)) ===
      canonicalJson(queueDefinition(definition))
    ) {
      items.push({ key: component.key, action: 'unchanged' });
    } else {
      items.push({ key: component.key, action: 'update', metadata: true });
    }
  }

  return {
    items,
    problems,
    units,
    profiles,
    queues,
  };
}
