/*
 * The `.djpkg` artifact: what a released package version IS, byte for byte.
 *
 * TASK-0033 / EXECPLAN-0052. Everything here is pure — no database, no clock,
 * no randomness — because the two properties that matter are only provable
 * that way:
 *
 * - DETERMINISM. The same package content always serializes to the same bytes,
 *   so an export can live in Git and a diff between two versions shows what
 *   changed and nothing else. Object keys are sorted, components are ordered by
 *   dependency then key, and no timestamp or database id is written inside a
 *   component.
 * - INTEGRITY. Each component carries a sha256 of its canonical form and the
 *   document carries one over all of them, so a hand-edited or corrupted file is
 *   refused before anything is compared against the target.
 *
 * A checksum is integrity, not trust: anyone can recompute it. `signature` is
 * reserved in the manifest for publisher signing and is always null in format 1
 * — the importer never treats a checksum match as "trusted publisher".
 *
 * Format 1 is a single JSON document rather than a ZIP. No component type
 * carries binary assets today, and an archive would add a dependency plus the
 * zip-bomb and path-traversal surface for no benefit. A future format that
 * needs assets (custom widgets) bumps `formatVersion`; this reader refuses any
 * version it does not know, by name.
 */
import { createHash } from 'crypto';

export const PACKAGE_ARTIFACT_FORMAT_VERSION = 1;
export const SUPPORTED_ARTIFACT_FORMAT_VERSIONS: readonly number[] = [1];

/*
 * The compatibility axis between a package and the platform it lands on. The
 * platform itself has no meaningful semver (`services/api/package.json` is
 * 0.0.1), so a package declares the shape of customization metadata it was
 * written against instead. Bump MINOR when metadata gains optional structure an
 * older reader can ignore, MAJOR when an older reader would misread it.
 */
export const CUSTOMIZATION_METADATA_SCHEMA_VERSION = '1.0.0';

export const PACKAGE_ARTIFACT_MAX_BYTES = 5 * 1024 * 1024;
export const PACKAGE_ARTIFACT_MAX_COMPONENTS = 5000;
export const PACKAGE_ARTIFACT_MAX_DEPTH = 24;
export const PACKAGE_ARTIFACT_MAX_STRING = 200_000;

/* Prefixes no tenant publisher may take: they belong to DijiPeople itself. */
export const RESERVED_PUBLISHER_PREFIXES: readonly string[] = [
  'dp',
  'dijipeople',
  'sys',
  'system',
];
export const SYSTEM_PUBLISHER_KEY = 'dijipeople';

export const PUBLISHER_PREFIX_PATTERN = /^[a-z][a-z0-9]{1,7}$/;
export const PACKAGE_KEY_PATTERN = /^[a-z][a-z0-9]*_[a-z][a-zA-Z0-9]*$/;
const OBJECT_KEY_PATTERN =
  /^[A-Za-z][A-Za-z0-9_]{0,99}(\.[A-Za-z][A-Za-z0-9_]{0,99}){0,3}$/;

/*
 * The component types format 1 can carry, in the order they are applied when
 * nothing else decides it: a module before its fields, fields before the
 * forms and views that lay them out, choice lists and relationships before the
 * surfaces that use them.
 */
export const PORTABLE_COMPONENT_TYPES = [
  'environmentVariable',
  'table',
  'column',
  'optionSet',
  'lookup',
  'form',
  'view',
  'widget',
  'actionBar',
] as const;
export type PortableComponentType = (typeof PORTABLE_COMPONENT_TYPES)[number];

export const PORTABLE_LAYER_ACTIONS = [
  'create',
  'modify',
  'reference',
  'remove',
] as const;
export type PortableLayerAction = (typeof PORTABLE_LAYER_ACTIONS)[number];

export type PortableComponent = {
  /* `<type>:<objectKey>` — the only identity that crosses environments. */
  key: string;
  type: PortableComponentType;
  objectKey: string;
  /* The owning module's objectKey for anything that is not itself a module. */
  parentKey: string | null;
  layerAction: PortableLayerAction;
  /* True when the component this layer applies to ships with DijiPeople Core. */
  baseIsSystem: boolean;
  /* The full definition, when the package owns the component (`create`). */
  definition: Record<string, unknown> | null;
  /* Layer content: a delta over a base, or the whole of a JSON-only type. */
  layer: Record<string, unknown> | null;
  /* Component keys this one needs, sorted. */
  dependsOn: string[];
  checksum: string;
};

export type PortableComponentInput = Omit<PortableComponent, 'checksum'>;

export type PackageDependencyDeclaration = {
  packageKey: string;
  publisherKey: string | null;
  displayName: string | null;
  minVersion: string;
  maxVersion: string | null;
};

export type PackageManifest = {
  packageKey: string;
  displayName: string;
  description: string | null;
  version: string;
  publisher: { publisherKey: string; displayName: string; prefix: string };
  metadataSchemaVersion: string;
  sourceEnvironmentType: string | null;
  releasedAt: string | null;
  dependencies: PackageDependencyDeclaration[];
  /* DijiPeople Core components the package builds on, for the import plan. */
  coreDependencies: string[];
  componentCount: number;
  /* Reserved for publisher signing. Always null in format 1. */
  signature: null;
};

export type PackageArtifact = {
  formatVersion: number;
  manifest: PackageManifest;
  components: PortableComponent[];
  contentChecksum: string;
};

export type ArtifactProblem = { path: string; message: string };

/* ---------------------------------------------------------------- canonical */

/**
 * JSON with object keys sorted at every depth. `undefined` members are dropped
 * (as JSON.stringify does) so an absent field and an undefined one serialize
 * the same, and a non-finite number is refused rather than silently becoming
 * `null`.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Package content cannot contain a non-finite number.');
    }
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'object') {
    /* Decimal and similar carry a meaningful toString / toJSON. */
    const withJson = value as { toJSON?: () => unknown };
    if (
      typeof withJson.toJSON === 'function' &&
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return canonicalize(withJson.toJSON());
    }
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child === undefined) continue;
      sorted[key] = canonicalize(child);
    }
    return sorted;
  }
  return value;
}

export function sha256(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function componentChecksum(component: PortableComponentInput) {
  return sha256(
    canonicalJson({
      key: component.key,
      type: component.type,
      objectKey: component.objectKey,
      parentKey: component.parentKey,
      layerAction: component.layerAction,
      baseIsSystem: component.baseIsSystem,
      definition: component.definition,
      layer: component.layer,
      dependsOn: component.dependsOn,
    }),
  );
}

export function contentChecksum(
  manifest: PackageManifest,
  components: readonly PortableComponent[],
) {
  return sha256(
    canonicalJson({
      manifest,
      components: components.map((component) => component.checksum),
    }),
  );
}

/* ------------------------------------------------------------------- semver */

export type Semver = { major: number; minor: number; patch: number };

/*
 * Strict MAJOR.MINOR.PATCH. Pre-release tags are refused rather than half
 * supported: `1.2.0-beta` sorting as `1.2.0` is the kind of ambiguity that
 * lets an upgrade be classified as "same version".
 */
export function parseSemver(value: unknown): Semver | null {
  if (typeof value !== 'string') return null;
  const match = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/.exec(
    value.trim(),
  );
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function isSemver(value: unknown): boolean {
  return parseSemver(value) !== null;
}

export function compareSemver(left: string, right: string) {
  const a = parseSemver(left);
  const b = parseSemver(right);
  if (!a || !b) {
    throw new Error(`Cannot compare versions ${left} and ${right}.`);
  }
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

export function satisfiesVersionRange(
  version: string,
  minVersion: string,
  maxVersion?: string | null,
) {
  if (!isSemver(version) || !isSemver(minVersion)) return false;
  if (compareSemver(version, minVersion) < 0) return false;
  if (maxVersion && isSemver(maxVersion)) {
    return compareSemver(version, maxVersion) <= 0;
  }
  return true;
}

export type VersionBump = 'major' | 'minor' | 'patch';

export function bumpVersion(value: string, bump: VersionBump = 'patch') {
  const parsed = parseSemver(value) ?? { major: 1, minor: 0, patch: 0 };
  if (bump === 'major') return `${parsed.major + 1}.0.0`;
  if (bump === 'minor') return `${parsed.major}.${parsed.minor + 1}.0`;
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

/* ----------------------------------------------------------------- building */

/**
 * Components in the order an import must apply them.
 *
 * Kahn's algorithm over in-package `dependsOn` edges, always taking the ready
 * component with the lowest (type rank, key) so the order is total and
 * reproducible. A cycle is not an error here: two modules with lookups to each
 * other are a legitimate schema, and because lookup targets are logical keys
 * (not foreign keys) and the whole import is one transaction, either order
 * applies. When only cyclic components remain, the lowest-ranked one is taken
 * and the sort continues. Package-to-package cycles are a different thing and
 * are refused by `findPackageDependencyCycle`.
 */
export function orderComponents<
  T extends { key: string; type: string; dependsOn: readonly string[] },
>(components: readonly T[]): T[] {
  const byKey = new Map(
    components.map((component) => [component.key, component]),
  );
  const remainingDeps = new Map<string, Set<string>>();
  const dependents = new Map<string, string[]>();
  for (const component of components) {
    const deps = new Set(
      component.dependsOn.filter(
        (dependency) => dependency !== component.key && byKey.has(dependency),
      ),
    );
    remainingDeps.set(component.key, deps);
    for (const dependency of deps) {
      dependents.set(dependency, [
        ...(dependents.get(dependency) ?? []),
        component.key,
      ]);
    }
  }

  const compare = (left: T, right: T) =>
    typeRank(left.type) - typeRank(right.type) ||
    (left.key < right.key ? -1 : left.key > right.key ? 1 : 0);

  const ordered: T[] = [];
  const done = new Set<string>();
  while (ordered.length < components.length) {
    const pending = components.filter((component) => !done.has(component.key));
    const ready = pending.filter(
      (component) => remainingDeps.get(component.key)?.size === 0,
    );
    const next = (ready.length ? ready : pending).slice().sort(compare)[0];
    ordered.push(next);
    done.add(next.key);
    for (const dependent of dependents.get(next.key) ?? []) {
      remainingDeps.get(dependent)?.delete(next.key);
    }
  }
  return ordered;
}

function typeRank(type: string) {
  const index = (PORTABLE_COMPONENT_TYPES as readonly string[]).indexOf(type);
  return index === -1 ? PORTABLE_COMPONENT_TYPES.length : index;
}

export function buildPackageArtifact(input: {
  manifest: Omit<PackageManifest, 'componentCount' | 'signature'>;
  components: readonly PortableComponentInput[];
}): { artifact: PackageArtifact; serialized: string } {
  const components = orderComponents(
    input.components.map((component) => {
      const normalized: PortableComponentInput = {
        ...component,
        dependsOn: [...new Set(component.dependsOn)]
          .filter((dependency) => dependency !== component.key)
          .sort(),
      };
      return { ...normalized, checksum: componentChecksum(normalized) };
    }),
  );
  const manifest: PackageManifest = {
    ...input.manifest,
    dependencies: [...input.manifest.dependencies].sort((left, right) =>
      left.packageKey.localeCompare(right.packageKey),
    ),
    coreDependencies: [...new Set(input.manifest.coreDependencies)].sort(),
    componentCount: components.length,
    signature: null,
  };
  assertNoSensitiveContent(components);
  const artifact: PackageArtifact = {
    formatVersion: PACKAGE_ARTIFACT_FORMAT_VERSION,
    manifest,
    components,
    contentChecksum: contentChecksum(manifest, components),
  };
  return { artifact, serialized: canonicalJson(artifact) };
}

/*
 * Keys whose presence in exported metadata means a credential is about to
 * leave the environment. Checked on the way out (export throws) and on the way
 * in (import refuses), because a package is exactly the artefact that gets
 * emailed, committed and attached to tickets.
 */
const SENSITIVE_KEY_PATTERN =
  /^(password|passwd|secret|clientsecret|apikey|api_key|accesstoken|refreshtoken|token|privatekey|connectionstring|credential|credentials)$/i;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function findSensitivePath(value: unknown, path: string): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findSensitivePath(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) return `${path}.${key}`;
    const found = findSensitivePath(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function assertNoSensitiveContent(components: readonly PortableComponent[]) {
  for (const component of components) {
    const found =
      findSensitivePath(component.definition, `${component.key}.definition`) ??
      findSensitivePath(component.layer, `${component.key}.layer`);
    if (found) {
      throw new Error(
        `Export refused: ${found} looks like a credential and would leave this environment.`,
      );
    }
  }
}

/* ------------------------------------------------------------------ reading */

/**
 * Parses and verifies an uploaded artifact. Collects every problem rather than
 * stopping at the first, so one upload shows the whole picture. Returns the
 * artifact only when there are no problems — nothing downstream ever sees a
 * document that failed here.
 */
export function parsePackageArtifact(raw: string | Buffer): {
  artifact: PackageArtifact | null;
  problems: ArtifactProblem[];
} {
  const problems: ArtifactProblem[] = [];
  const size = typeof raw === 'string' ? Buffer.byteLength(raw) : raw.length;
  if (size === 0) {
    return {
      artifact: null,
      problems: [{ path: '', message: 'The file is empty.' }],
    };
  }
  if (size > PACKAGE_ARTIFACT_MAX_BYTES) {
    return {
      artifact: null,
      problems: [
        {
          path: '',
          message: `The file is ${Math.ceil(size / 1024)} KB; packages are limited to ${PACKAGE_ARTIFACT_MAX_BYTES / 1024 / 1024} MB.`,
        },
      ],
    };
  }

  let document: unknown;
  try {
    document = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
  } catch {
    return {
      artifact: null,
      problems: [
        {
          path: '',
          message:
            'This is not a DijiPeople package: the file is not valid JSON. It may be corrupted or truncated.',
        },
      ],
    };
  }

  const shapeProblem = checkShapeLimits(document, '', 0);
  if (shapeProblem) return { artifact: null, problems: [shapeProblem] };

  if (!isRecord(document)) {
    return {
      artifact: null,
      problems: [{ path: '', message: 'A package must be a JSON object.' }],
    };
  }

  const formatVersion = document.formatVersion;
  if (
    typeof formatVersion !== 'number' ||
    !SUPPORTED_ARTIFACT_FORMAT_VERSIONS.includes(formatVersion)
  ) {
    return {
      artifact: null,
      problems: [
        {
          path: 'formatVersion',
          message: `This package uses format version ${
            formatVersion === undefined ? '(none)' : String(formatVersion)
          }. This DijiPeople environment reads format ${SUPPORTED_ARTIFACT_FORMAT_VERSIONS.join(', ')}.`,
        },
      ],
    };
  }

  const manifest = readManifest(document.manifest, problems);
  const components = readComponents(document.components, problems);

  if (manifest && components) {
    if (manifest.componentCount !== components.length) {
      problems.push({
        path: 'manifest.componentCount',
        message: `The manifest declares ${manifest.componentCount} components but the package contains ${components.length}.`,
      });
    }
    const prefix = manifest.publisher.prefix;
    if (!manifest.packageKey.startsWith(`${prefix}_`)) {
      problems.push({
        path: 'manifest.packageKey',
        message: `Package key ${manifest.packageKey} does not carry its publisher prefix ${prefix}_.`,
      });
    }
    for (const component of components) {
      if (component.layerAction !== 'create' || component.baseIsSystem)
        continue;
      const local = component.objectKey.split('.').pop() ?? '';
      /*
       * A created module keeps its historical unprefixed key pattern
       * (METADATA_KEY_PATTERN); everything created inside a module must be
       * prefixed so two publishers cannot mint the same logical name.
       */
      if (component.type === 'column' && !local.startsWith(`${prefix}_`)) {
        problems.push({
          path: `components.${component.key}`,
          message: `Field ${component.objectKey} is created by publisher ${manifest.publisher.publisherKey} but does not use its prefix ${prefix}_.`,
        });
      }
    }
  }

  const checksum = document.contentChecksum;
  if (typeof checksum !== 'string' || !/^[0-9a-f]{64}$/.test(checksum)) {
    problems.push({
      path: 'contentChecksum',
      message: 'The package checksum is missing or malformed.',
    });
  } else if (manifest && components && problems.length === 0) {
    if (contentChecksum(manifest, components) !== checksum) {
      problems.push({
        path: 'contentChecksum',
        message:
          'The package checksum does not match its content. The file was modified or corrupted after export.',
      });
    }
  }

  if (problems.length || !manifest || !components) {
    return { artifact: null, problems };
  }
  return {
    artifact: {
      formatVersion,
      manifest,
      components,
      contentChecksum: checksum as string,
    },
    problems,
  };
}

function checkShapeLimits(
  value: unknown,
  path: string,
  depth: number,
): ArtifactProblem | null {
  if (depth > PACKAGE_ARTIFACT_MAX_DEPTH) {
    return { path, message: 'The package is nested too deeply to be valid.' };
  }
  if (typeof value === 'string' && value.length > PACKAGE_ARTIFACT_MAX_STRING) {
    return { path, message: 'The package contains an oversized text value.' };
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const problem = checkShapeLimits(
        value[index],
        `${path}[${index}]`,
        depth + 1,
      );
      if (problem) return problem;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) {
        return {
          path: `${path}.${key}`,
          message: `The package uses the reserved property name "${key}".`,
        };
      }
      const problem = checkShapeLimits(
        child,
        path ? `${path}.${key}` : key,
        depth + 1,
      );
      if (problem) return problem;
    }
  }
  return null;
}

function readManifest(
  value: unknown,
  problems: ArtifactProblem[],
): PackageManifest | null {
  if (!isRecord(value)) {
    problems.push({
      path: 'manifest',
      message: 'The package manifest is missing.',
    });
    return null;
  }
  const start = problems.length;
  const text = (key: string, max = 200, optional = false) => {
    const field = value[key];
    if (field === null || field === undefined) {
      if (!optional)
        problems.push({
          path: `manifest.${key}`,
          message: `${key} is required.`,
        });
      return null;
    }
    if (typeof field !== 'string' || field.length > max) {
      problems.push({
        path: `manifest.${key}`,
        message: `${key} must be text of at most ${max} characters.`,
      });
      return null;
    }
    return field;
  };

  const packageKey = text('packageKey', 80);
  if (packageKey && !PACKAGE_KEY_PATTERN.test(packageKey)) {
    problems.push({
      path: 'manifest.packageKey',
      message: `Package key ${packageKey} is not a valid logical name.`,
    });
  }
  const displayName = text('displayName', 100);
  const description = text('description', 500, true);
  const version = text('version', 30);
  if (version && !isSemver(version)) {
    problems.push({
      path: 'manifest.version',
      message: `Version ${version} is not MAJOR.MINOR.PATCH.`,
    });
  }
  const metadataSchemaVersion = text('metadataSchemaVersion', 30);
  if (metadataSchemaVersion && !isSemver(metadataSchemaVersion)) {
    problems.push({
      path: 'manifest.metadataSchemaVersion',
      message: 'metadataSchemaVersion is not MAJOR.MINOR.PATCH.',
    });
  }
  const sourceEnvironmentType = text('sourceEnvironmentType', 40, true);
  const releasedAt = text('releasedAt', 40, true);

  const publisher = value.publisher;
  let parsedPublisher: PackageManifest['publisher'] | null = null;
  if (!isRecord(publisher)) {
    problems.push({
      path: 'manifest.publisher',
      message: 'The publisher is missing.',
    });
  } else {
    const publisherKey = publisher.publisherKey;
    const publisherName = publisher.displayName;
    const prefix = publisher.prefix;
    if (
      typeof publisherKey !== 'string' ||
      !/^[a-z][a-z0-9_]{0,59}$/.test(publisherKey)
    ) {
      problems.push({
        path: 'manifest.publisher.publisherKey',
        message: 'Publisher key is invalid.',
      });
    }
    if (
      typeof publisherName !== 'string' ||
      !publisherName.trim() ||
      publisherName.length > 100
    ) {
      problems.push({
        path: 'manifest.publisher.displayName',
        message: 'Publisher name is invalid.',
      });
    }
    if (typeof prefix !== 'string' || !PUBLISHER_PREFIX_PATTERN.test(prefix)) {
      problems.push({
        path: 'manifest.publisher.prefix',
        message:
          'Publisher prefix must be 2-8 lowercase letters or digits, starting with a letter.',
      });
    } else if (RESERVED_PUBLISHER_PREFIXES.includes(prefix)) {
      problems.push({
        path: 'manifest.publisher.prefix',
        message: `Prefix ${prefix} is reserved for DijiPeople.`,
      });
    }
    if (
      typeof publisherKey === 'string' &&
      publisherKey === SYSTEM_PUBLISHER_KEY
    ) {
      problems.push({
        path: 'manifest.publisher.publisherKey',
        message: 'The DijiPeople system publisher cannot be imported.',
      });
    }
    if (
      typeof publisherKey === 'string' &&
      typeof publisherName === 'string' &&
      typeof prefix === 'string'
    ) {
      parsedPublisher = { publisherKey, displayName: publisherName, prefix };
    }
  }

  const dependencies: PackageDependencyDeclaration[] = [];
  if (!Array.isArray(value.dependencies)) {
    problems.push({
      path: 'manifest.dependencies',
      message: 'dependencies must be a list.',
    });
  } else {
    value.dependencies.forEach((entry, index) => {
      const path = `manifest.dependencies[${index}]`;
      if (
        !isRecord(entry) ||
        typeof entry.packageKey !== 'string' ||
        !PACKAGE_KEY_PATTERN.test(entry.packageKey)
      ) {
        problems.push({
          path,
          message: 'A dependency must name a valid package key.',
        });
        return;
      }
      if (!isSemver(entry.minVersion)) {
        problems.push({
          path: `${path}.minVersion`,
          message: 'minVersion must be MAJOR.MINOR.PATCH.',
        });
        return;
      }
      if (entry.maxVersion != null && !isSemver(entry.maxVersion)) {
        problems.push({
          path: `${path}.maxVersion`,
          message: 'maxVersion must be MAJOR.MINOR.PATCH.',
        });
        return;
      }
      dependencies.push({
        packageKey: entry.packageKey,
        publisherKey:
          typeof entry.publisherKey === 'string' ? entry.publisherKey : null,
        displayName:
          typeof entry.displayName === 'string'
            ? entry.displayName.slice(0, 100)
            : null,
        /* Both checked by isSemver above. */
        minVersion: entry.minVersion as string,
        maxVersion: (entry.maxVersion as string | null | undefined) ?? null,
      });
    });
  }
  if (
    packageKey &&
    dependencies.some((dependency) => dependency.packageKey === packageKey)
  ) {
    problems.push({
      path: 'manifest.dependencies',
      message: 'A package cannot depend on itself.',
    });
  }

  const coreDependencies = Array.isArray(value.coreDependencies)
    ? value.coreDependencies.filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : [];
  const componentCount = value.componentCount;
  if (
    typeof componentCount !== 'number' ||
    !Number.isInteger(componentCount) ||
    componentCount < 0
  ) {
    problems.push({
      path: 'manifest.componentCount',
      message: 'componentCount must be a whole number.',
    });
  }
  if (value.signature !== null && value.signature !== undefined) {
    problems.push({
      path: 'manifest.signature',
      message: 'Signed packages are not supported by format 1.',
    });
  }

  if (problems.length > start || !parsedPublisher) return null;
  return {
    packageKey: packageKey as string,
    displayName: displayName as string,
    description,
    version: version as string,
    publisher: parsedPublisher,
    metadataSchemaVersion: metadataSchemaVersion as string,
    sourceEnvironmentType,
    releasedAt,
    dependencies,
    coreDependencies,
    componentCount: componentCount as number,
    signature: null,
  };
}

function readComponents(
  value: unknown,
  problems: ArtifactProblem[],
): PortableComponent[] | null {
  if (!Array.isArray(value)) {
    problems.push({
      path: 'components',
      message: 'components must be a list.',
    });
    return null;
  }
  if (value.length > PACKAGE_ARTIFACT_MAX_COMPONENTS) {
    problems.push({
      path: 'components',
      message: `The package has ${value.length} components; the limit is ${PACKAGE_ARTIFACT_MAX_COMPONENTS}.`,
    });
    return null;
  }
  const start = problems.length;
  const components: PortableComponent[] = [];
  const seen = new Set<string>();

  value.forEach((entry, index) => {
    const path = `components[${index}]`;
    if (!isRecord(entry)) {
      problems.push({ path, message: 'A component must be an object.' });
      return;
    }
    const type = entry.type;
    if (
      typeof type !== 'string' ||
      !(PORTABLE_COMPONENT_TYPES as readonly string[]).includes(type)
    ) {
      problems.push({
        path: `${path}.type`,
        message: `Component type ${typeof type === 'string' ? type : '(none)'} is not supported by this environment.`,
      });
      return;
    }
    const objectKey = entry.objectKey;
    if (typeof objectKey !== 'string' || !OBJECT_KEY_PATTERN.test(objectKey)) {
      problems.push({
        path: `${path}.objectKey`,
        message: 'Component logical name is invalid.',
      });
      return;
    }
    const key = entry.key;
    if (key !== `${type}:${objectKey}`) {
      problems.push({
        path: `${path}.key`,
        message: `Component key must be ${type}:${objectKey}.`,
      });
      return;
    }
    if (seen.has(key)) {
      problems.push({
        path: `${path}.key`,
        message: `Component ${key} appears more than once.`,
      });
      return;
    }
    seen.add(key);

    const parentKey = entry.parentKey;
    const expectedParent =
      type === 'table' || type === 'environmentVariable'
        ? null
        : objectKey.split('.')[0];
    if ((parentKey ?? null) !== expectedParent) {
      problems.push({
        path: `${path}.parentKey`,
        message: `${key} names the wrong parent module.`,
      });
      return;
    }
    const layerAction = entry.layerAction;
    if (
      typeof layerAction !== 'string' ||
      !(PORTABLE_LAYER_ACTIONS as readonly string[]).includes(layerAction)
    ) {
      problems.push({
        path: `${path}.layerAction`,
        message: `${key} has an unknown layer action.`,
      });
      return;
    }
    if (typeof entry.baseIsSystem !== 'boolean') {
      problems.push({
        path: `${path}.baseIsSystem`,
        message: `${key} does not say whether it extends DijiPeople Core.`,
      });
      return;
    }
    const definition = entry.definition ?? null;
    const layer = entry.layer ?? null;
    if (definition !== null && !isRecord(definition)) {
      problems.push({
        path: `${path}.definition`,
        message: `${key} has a malformed definition.`,
      });
      return;
    }
    if (layer !== null && !isRecord(layer)) {
      problems.push({
        path: `${path}.layer`,
        message: `${key} has malformed layer content.`,
      });
      return;
    }
    if (
      layerAction === 'create' &&
      !entry.baseIsSystem &&
      definition === null &&
      !isJsonOnlyType(type)
    ) {
      problems.push({
        path: `${path}.definition`,
        message: `${key} creates a component but carries no definition.`,
      });
      return;
    }
    if (layerAction === 'create' && entry.baseIsSystem) {
      problems.push({
        path: `${path}.layerAction`,
        message: `${key} would overwrite a DijiPeople Core component; system components can only be extended.`,
      });
      return;
    }
    const dependsOn = entry.dependsOn;
    if (
      !Array.isArray(dependsOn) ||
      dependsOn.some((dependency) => typeof dependency !== 'string')
    ) {
      problems.push({
        path: `${path}.dependsOn`,
        message: `${key} has a malformed dependency list.`,
      });
      return;
    }
    const sensitive =
      findSensitivePath(definition, `${key}.definition`) ??
      findSensitivePath(layer, `${key}.layer`);
    if (sensitive) {
      problems.push({
        path: `${path}`,
        message: `${sensitive} looks like a credential. Packages never carry secrets.`,
      });
      return;
    }
    const component: PortableComponentInput = {
      key,
      type: type as PortableComponentType,
      objectKey,
      parentKey: expectedParent,
      layerAction: layerAction as PortableLayerAction,
      baseIsSystem: entry.baseIsSystem,
      definition,
      layer,
      dependsOn: dependsOn as string[],
    };
    const checksum = componentChecksum(component);
    if (entry.checksum !== checksum) {
      problems.push({
        path: `${path}.checksum`,
        message: `${key} does not match its checksum. The file was modified or corrupted after export.`,
      });
      return;
    }
    components.push({ ...component, checksum });
  });

  return problems.length > start ? null : components;
}

export function isJsonOnlyType(type: string) {
  return (
    type === 'optionSet' ||
    type === 'lookup' ||
    type === 'actionBar' ||
    type === 'widget'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/* ------------------------------------------------------- package dependency */

/**
 * A cycle among PACKAGE dependencies (A needs B, B needs A) makes install
 * order undefined and uninstall impossible, so unlike a schema cycle it is an
 * error. Returns the cycle as a path, or null.
 */
export function findPackageDependencyCycle(
  edges: ReadonlyMap<string, readonly string[]>,
): string[] | null {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (node: string): string[] | null => {
    if (visiting.has(node)) {
      return [...stack.slice(stack.indexOf(node)), node];
    }
    if (visited.has(node)) return null;
    visiting.add(node);
    stack.push(node);
    for (const next of [...(edges.get(node) ?? [])].sort()) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
    return null;
  };

  for (const node of [...edges.keys()].sort()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}
