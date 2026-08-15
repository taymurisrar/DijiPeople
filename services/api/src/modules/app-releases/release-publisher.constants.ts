import {
  ApplicationArchitecture,
  ApplicationPlatform,
  ApplicationReleaseChannel,
} from '@prisma/client';

import { APP_KEYS, DEFAULT_APP_PERMISSION } from './app-release.service';

/**
 * What the publisher is allowed to publish, and what it fills in for you.
 *
 * The name and description of a product application are NOT publisher input.
 * If the CLI sent them, two releases of the same app would eventually disagree
 * about what the app is called, and Apps & Downloads would show both. They live
 * here, with `APP_KEYS`, so the catalogue has one owner.
 *
 * Everything a *release* legitimately varies — version, channel, platform,
 * architecture, notes, minimum supported version — stays publisher input.
 */
export interface PublishableApp {
  appKey: string;
  /** What a developer types: `--app integration-gateway`. */
  cliAlias: string;
  name: string;
  description: string;
  defaultPlatform: ApplicationPlatform;
  defaultArchitecture: ApplicationArchitecture;
  /** Extensions an artefact for this app may carry. */
  artifactExtensions: string[];
}

export const PUBLISHABLE_APPS: readonly PublishableApp[] = [
  {
    appKey: APP_KEYS.INTEGRATION_GATEWAY,
    cliAlias: 'integration-gateway',
    name: 'DijiPeople Integration Gateway',
    description:
      'Collects attendance from devices on your network and synchronises it with DijiPeople.',
    defaultPlatform: ApplicationPlatform.WINDOWS,
    defaultArchitecture: ApplicationArchitecture.X64,
    artifactExtensions: ['.zip'],
  },
  {
    appKey: APP_KEYS.AGENT_DESKTOP,
    cliAlias: 'agent-desktop',
    name: 'DijiPeople Desktop Agent',
    description:
      'Records attendance from a workstation and syncs it with DijiPeople.',
    defaultPlatform: ApplicationPlatform.WINDOWS,
    defaultArchitecture: ApplicationArchitecture.X64,
    artifactExtensions: ['.zip', '.exe', '.msi', '.dmg', '.AppImage'],
  },
  {
    appKey: APP_KEYS.ZKTECO_DIAGNOSTIC,
    cliAlias: 'zkteco-diagnostic',
    name: 'ZKTeco Diagnostic Utility',
    description:
      'Support tool for checking connectivity and capabilities of a ZKTeco attendance device.',
    defaultPlatform: ApplicationPlatform.WINDOWS,
    defaultArchitecture: ApplicationArchitecture.X86,
    artifactExtensions: ['.zip', '.exe'],
  },
] as const;

/** Resolves an app key or a CLI alias, case-insensitively, to one catalogue entry. */
export function resolvePublishableApp(
  value: string | undefined | null,
): PublishableApp | undefined {
  if (!value) return undefined;
  const needle = value.trim().toLowerCase().replace(/_/g, '-');
  return PUBLISHABLE_APPS.find(
    (app) =>
      app.cliAlias === needle ||
      app.appKey.toLowerCase().replace(/_/g, '-') === needle,
  );
}

export function defaultPermissionForApp(appKey: string): string | null {
  return DEFAULT_APP_PERMISSION[appKey] ?? null;
}

/**
 * Versions the publisher accepts.
 *
 * Deliberately narrow: `MAJOR.MINOR.PATCH` with an optional pre-release and an
 * optional fourth numeric segment, because .NET assembly versions are
 * four-part and the gateway reports three. Anything looser lets `v2.0.0` and
 * `2.0.0` become two immutable releases of the same build.
 */
export const RELEASE_VERSION_PATTERN =
  /^\d+\.\d+\.\d+(\.\d+)?(-[0-9A-Za-z.-]+)?$/;

export function isValidReleaseVersion(version: string): boolean {
  return RELEASE_VERSION_PATTERN.test(version.trim());
}

/** Channels, ordered from least to most exposed. Used to describe promotions. */
export const CHANNEL_EXPOSURE_ORDER: ApplicationReleaseChannel[] = [
  ApplicationReleaseChannel.INTERNAL,
  ApplicationReleaseChannel.BETA,
  ApplicationReleaseChannel.STABLE,
];

/**
 * Default ceiling for a release artefact.
 *
 * `FILE_UPLOAD_MAX_BYTES` (10 MB by default) governs tenant document uploads
 * and is far too small here: the gateway package is a self-contained .NET host
 * plus a self-contained x86 worker. Overriding it globally to fit a release
 * would raise the ceiling on every tenant upload path too, which is why this is
 * a separate setting.
 */
export const DEFAULT_RELEASE_ARTIFACT_MAX_BYTES = 536_870_912; // 512 MB

/** Where release artefacts live under the storage root. */
export const RELEASE_STORAGE_PREFIX = 'app-releases';
