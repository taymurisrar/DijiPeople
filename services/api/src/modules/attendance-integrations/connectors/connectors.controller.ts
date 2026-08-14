import { Controller, Get, Param, UseGuards } from '@nestjs/common';

import { Permissions } from '../../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { AttendanceConnectorRegistry } from './connector.registry';
import type { AttendanceConnectorDefinition } from './connector.types';

/**
 * Connector catalogue.
 *
 * The Settings UI reads this to render a configuration form for whichever
 * connector an administrator picked, without shipping a bespoke form per
 * manufacturer.
 *
 * Only declarative metadata crosses this boundary — never the definition object
 * itself, and never anything that would let a caller infer how the connector is
 * implemented.
 */

interface ConnectorSummaryResponse {
  connectorType: string;
  provider: string;
  connectionMode: string;
  displayName: string;
  description: string;
  requiresGateway: boolean;
  supportsMultipleDevices: boolean;
  capabilities: string[];
  /** Capabilities that exist but are not certified for automation. */
  experimentalCapabilities: Array<{ capability: string; reason: string }>;
  /**
   * Capabilities safe to drive automatically. The Settings UI uses this to
   * explain why, for example, automatic provisioning is unavailable today.
   */
  automaticallySupportedCapabilities: string[];
  recommendedSync: {
    mode: string;
    recommendedIntervalValue: number;
    recommendedIntervalUnit: string;
    minimumIntervalMinutes: number;
    rationale?: string;
  };
  notes: string[];
}

interface ConnectorDetailResponse extends ConnectorSummaryResponse {
  configurationSchema: {
    fields: Array<{
      key: string;
      label: string;
      type: string;
      required: boolean;
      secret: boolean;
      helpText?: string;
      placeholder?: string;
      defaultValue?: string | number | boolean;
      min?: number;
      max?: number;
      options?: Array<{ value: string; label: string }>;
    }>;
  };
}

@Controller('integrations/attendance/connectors')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttendanceConnectorsController {
  constructor(private readonly registry: AttendanceConnectorRegistry) {}

  @Get()
  @Permissions('integrations.read')
  list(): { connectors: ConnectorSummaryResponse[] } {
    return {
      connectors: this.registry
        .list()
        .map((definition) => this.toSummary(definition)),
    };
  }

  @Get(':connectorType')
  @Permissions('integrations.read')
  findOne(
    @Param('connectorType') connectorType: string,
  ): ConnectorDetailResponse {
    const definition = this.registry.require(connectorType);
    return {
      ...this.toSummary(definition),
      configurationSchema: {
        fields: definition.configurationSchema.fields.map((field) => ({
          key: field.key,
          label: field.label,
          type: field.type,
          required: field.required,
          secret: field.secret === true || field.type === 'secret',
          ...(field.helpText ? { helpText: field.helpText } : {}),
          ...(field.placeholder ? { placeholder: field.placeholder } : {}),
          ...(field.defaultValue !== undefined
            ? { defaultValue: field.defaultValue }
            : {}),
          ...(field.min !== undefined ? { min: field.min } : {}),
          ...(field.max !== undefined ? { max: field.max } : {}),
          ...(field.options ? { options: [...field.options] } : {}),
        })),
      },
    };
  }

  private toSummary(
    definition: AttendanceConnectorDefinition,
  ): ConnectorSummaryResponse {
    const experimental = definition.experimentalCapabilities ?? [];
    const experimentalKeys = new Set(
      experimental.map((note) => note.capability),
    );

    return {
      connectorType: definition.connectorType,
      provider: definition.provider,
      connectionMode: definition.connectionMode,
      displayName: definition.label,
      description: definition.description,
      requiresGateway: definition.requiresGateway,
      supportsMultipleDevices: definition.supportsMultipleDevices,
      capabilities: [...definition.capabilities],
      experimentalCapabilities: experimental.map((note) => ({
        capability: note.capability,
        reason: note.reason,
      })),
      automaticallySupportedCapabilities: definition.capabilities.filter(
        (capability) => !experimentalKeys.has(capability),
      ),
      recommendedSync: {
        mode: definition.recommendedSyncPolicy.mode,
        recommendedIntervalValue:
          definition.recommendedSyncPolicy.recommendedIntervalValue,
        recommendedIntervalUnit:
          definition.recommendedSyncPolicy.recommendedIntervalUnit,
        minimumIntervalMinutes:
          definition.recommendedSyncPolicy.minimumIntervalMinutes,
        ...(definition.recommendedSyncPolicy.rationale
          ? { rationale: definition.recommendedSyncPolicy.rationale }
          : {}),
      },
      notes: [...(definition.notes ?? [])],
    };
  }
}
