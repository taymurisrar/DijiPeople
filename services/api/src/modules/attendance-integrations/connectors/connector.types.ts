import {
  AttendanceConnectionMode,
  AttendanceProvider,
  AttendanceSyncIntervalUnit,
} from '@prisma/client';

/**
 * Contract every attendance connector declares itself against.
 *
 * The point of this file is that adding Hikvision, Suprema, a vendor REST API or
 * a file drop must not require a schema change or a branch in the attendance
 * module. A connector declares what it can do and what it needs configured;
 * everything above it (Settings UI, sync scheduling, provisioning, ingestion)
 * reads those declarations instead of testing `provider === 'ZKTECO'`.
 */

/**
 * What a connector is able to do against its source.
 *
 * Biometric capabilities are deliberately absent from this union. DijiPeople
 * does not read, transmit or store fingerprint templates, face templates or any
 * other biometric vector, so there is no flag a connector could set to request
 * it — the capability simply does not exist in the type system.
 */
export const ATTENDANCE_CONNECTOR_CAPABILITIES = [
  // read
  'READ_DEVICE_INFO',
  'READ_USERS',
  'READ_ATTENDANCE',
  // write (identity only — never biometric enrolment)
  'WRITE_USERS',
  'UPDATE_USERS',
  'DISABLE_USERS',
  'DELETE_USERS',
  // delivery
  'REALTIME_EVENTS',
  'POLL_EVENTS',
  // data richness
  'DEVICE_TIME',
  'PUNCH_STATE',
  'WORK_CODE',
  // topology
  'CLOUD_DIRECT',
  'LOCAL_GATEWAY_REQUIRED',
] as const;

export type AttendanceConnectorCapability =
  (typeof ATTENDANCE_CONNECTOR_CAPABILITIES)[number];

/**
 * A capability the connector exposes but which has not been validated against
 * physical hardware yet. The platform may show it, but must not schedule or
 * automate it without an explicit opt-in.
 */
export interface ExperimentalCapabilityNote {
  capability: AttendanceConnectorCapability;
  reason: string;
}

export type ConnectorFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'timezone'
  | 'secret';

export interface ConnectorFieldOption {
  value: string;
  label: string;
}

/**
 * One configuration field a connector needs.
 *
 * This is the metadata the Settings UI renders from, so a new connector gets a
 * working configuration form without any bespoke React.
 */
export interface ConnectorConfigurationField {
  /** Key inside the integration's `configuration` / encrypted configuration JSON. */
  key: string;
  label: string;
  type: ConnectorFieldType;
  required: boolean;
  /**
   * Secrets are written to `AttendanceIntegration.encryptedConfiguration` via
   * SecretEncryptionService, are never returned to the browser except as a
   * masked presence flag, and never appear in logs, API responses or audit
   * detail.
   */
  secret?: boolean;
  helpText?: string;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  options?: readonly ConnectorFieldOption[];
  /**
   * Anchored regular expression a string value must match.
   *
   * Declared here rather than checked in the connector so the Settings UI and
   * the API validate identically from one statement — a date the browser
   * accepted but the gateway could not parse would silently change what gets
   * synchronised.
   */
  pattern?: string;
  /** Shown instead of the raw expression when `pattern` rejects a value. */
  patternMessage?: string;
}

export interface ConnectorConfigurationSchema {
  fields: readonly ConnectorConfigurationField[];
}

/**
 * Scheduling guidance the connector itself declares.
 *
 * `minimumIntervalMinutes` is a floor the platform enforces, not advice. The
 * legacy ZKTeco adapter re-reads the device's entire history on every poll, so
 * an admin must not be able to configure a 10-second schedule against it.
 */
export interface SyncRecommendation {
  mode: 'PUSH' | 'POLL' | 'MANUAL';
  recommendedIntervalValue: number;
  recommendedIntervalUnit: AttendanceSyncIntervalUnit;
  minimumIntervalMinutes: number;
  /** Why the floor exists, shown to the admin when their choice is clamped. */
  rationale?: string;
}

export interface AttendanceConnectorDefinition {
  /** Stable key stored in `AttendanceIntegration.connectorType`. */
  connectorType: string;
  provider: AttendanceProvider;
  connectionMode: AttendanceConnectionMode;
  /** Business-facing name. Shown in Settings; avoids implementation language. */
  label: string;
  description: string;
  capabilities: readonly AttendanceConnectorCapability[];
  /** Capabilities present but unproven against hardware. */
  experimentalCapabilities?: readonly ExperimentalCapabilityNote[];
  configurationSchema: ConnectorConfigurationSchema;
  recommendedSyncPolicy: SyncRecommendation;
  /** Whether devices are configured individually beneath the integration. */
  supportsMultipleDevices: boolean;
  /** Surfaced in Settings so an admin knows a gateway install is required. */
  requiresGateway: boolean;
  /** Operational caveats worth showing an administrator. */
  notes?: readonly string[];
}

export function hasCapability(
  definition: AttendanceConnectorDefinition,
  capability: AttendanceConnectorCapability,
): boolean {
  return definition.capabilities.includes(capability);
}

/**
 * True when the capability exists but is not validated against hardware.
 * Automated flows must treat these as opt-in only.
 */
export function isExperimentalCapability(
  definition: AttendanceConnectorDefinition,
  capability: AttendanceConnectorCapability,
): boolean {
  return (
    definition.experimentalCapabilities?.some(
      (note) => note.capability === capability,
    ) ?? false
  );
}

/**
 * A capability is usable for automation only when the connector declares it AND
 * it is not experimental. Automatic provisioning uses this rather than
 * `hasCapability`, so an unproven write path never runs unattended.
 */
export function supportsAutomatically(
  definition: AttendanceConnectorDefinition,
  capability: AttendanceConnectorCapability,
): boolean {
  return (
    hasCapability(definition, capability) &&
    !isExperimentalCapability(definition, capability)
  );
}

/** Secret field keys, so callers can split configuration without hard-coding names. */
export function secretFieldKeys(
  definition: AttendanceConnectorDefinition,
): string[] {
  return definition.configurationSchema.fields
    .filter((field) => field.secret === true || field.type === 'secret')
    .map((field) => field.key);
}
