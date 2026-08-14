import { Injectable, NotFoundException } from '@nestjs/common';
import type { AttendanceProvider } from '@prisma/client';

import {
  hasCapability,
  isExperimentalCapability,
  secretFieldKeys,
  supportsAutomatically,
  type AttendanceConnectorCapability,
  type AttendanceConnectorDefinition,
} from './connector.types';
import { ZKTECO_LEGACY_CONNECTOR } from './zkteco-legacy.connector';

/**
 * The set of connectors this build knows about.
 *
 * Adding a manufacturer means adding a definition here — no schema migration, no
 * change to the attendance module, no provider branching in business logic.
 */
const CONNECTOR_DEFINITIONS: readonly AttendanceConnectorDefinition[] = [
  ZKTECO_LEGACY_CONNECTOR,
];

/**
 * Read-only lookup over the connector definitions.
 *
 * Callers ask this service what a provider can do rather than hard-coding
 * vendor behaviour: the sync scheduler asks for interval floors, the
 * provisioning planner asks whether writes are supported and proven, and the
 * Settings UI asks for the configuration schema to render.
 */
@Injectable()
export class AttendanceConnectorRegistry {
  private readonly byConnectorType = new Map<
    string,
    AttendanceConnectorDefinition
  >(
    CONNECTOR_DEFINITIONS.map((definition) => [
      definition.connectorType,
      definition,
    ]),
  );

  /** Every registered connector. */
  list(): readonly AttendanceConnectorDefinition[] {
    return CONNECTOR_DEFINITIONS;
  }

  listByProvider(
    provider: AttendanceProvider,
  ): readonly AttendanceConnectorDefinition[] {
    return CONNECTOR_DEFINITIONS.filter(
      (definition) => definition.provider === provider,
    );
  }

  find(connectorType: string): AttendanceConnectorDefinition | undefined {
    return this.byConnectorType.get(connectorType);
  }

  /** Throws when the connector is unknown, so callers get a clear 404. */
  require(connectorType: string): AttendanceConnectorDefinition {
    const definition = this.byConnectorType.get(connectorType);
    if (!definition) {
      throw new NotFoundException(
        `Unknown attendance connector "${connectorType}".`,
      );
    }
    return definition;
  }

  supports(
    connectorType: string,
    capability: AttendanceConnectorCapability,
  ): boolean {
    const definition = this.find(connectorType);
    return definition ? hasCapability(definition, capability) : false;
  }

  /**
   * Whether an automated flow may use this capability. False for capabilities a
   * connector declares but has not had validated against hardware, which is what
   * keeps automatic provisioning off the unproven ZKTeco write path.
   */
  supportsAutomatically(
    connectorType: string,
    capability: AttendanceConnectorCapability,
  ): boolean {
    const definition = this.find(connectorType);
    return definition ? supportsAutomatically(definition, capability) : false;
  }

  isExperimental(
    connectorType: string,
    capability: AttendanceConnectorCapability,
  ): boolean {
    const definition = this.find(connectorType);
    return definition
      ? isExperimentalCapability(definition, capability)
      : false;
  }

  /** Configuration keys that must be encrypted before they are persisted. */
  secretKeys(connectorType: string): string[] {
    const definition = this.find(connectorType);
    return definition ? secretFieldKeys(definition) : [];
  }

  /**
   * Clamps a requested poll interval up to the connector's floor.
   *
   * Returns the applied value plus whether it was clamped, so the caller can
   * tell the admin their choice was adjusted instead of silently overriding it.
   */
  clampPollIntervalMinutes(
    connectorType: string,
    requestedMinutes: number,
  ): { minutes: number; clamped: boolean; minimumMinutes: number } {
    const definition = this.require(connectorType);
    const minimum = definition.recommendedSyncPolicy.minimumIntervalMinutes;
    if (requestedMinutes >= minimum) {
      return {
        minutes: requestedMinutes,
        clamped: false,
        minimumMinutes: minimum,
      };
    }
    return { minutes: minimum, clamped: true, minimumMinutes: minimum };
  }

  /**
   * Splits submitted configuration into the plain part and the secret part, so
   * a caller cannot accidentally persist a secret into the readable JSON column.
   */
  partitionConfiguration(
    connectorType: string,
    configuration: Record<string, unknown>,
  ): { plain: Record<string, unknown>; secret: Record<string, unknown> } {
    const secretKeys = new Set(this.secretKeys(connectorType));
    const plain: Record<string, unknown> = {};
    const secret: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(configuration)) {
      if (secretKeys.has(key)) {
        secret[key] = value;
      } else {
        plain[key] = value;
      }
    }

    return { plain, secret };
  }
}
