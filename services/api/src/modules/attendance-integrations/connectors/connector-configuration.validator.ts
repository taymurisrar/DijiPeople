import { BadRequestException, Injectable } from '@nestjs/common';

import { AttendanceConnectorRegistry } from './connector.registry';
import type { ConnectorConfigurationField } from './connector.types';

/**
 * Schema validation for connector configuration.
 *
 * Deliberately separate from live connection validation. This checks that the
 * values an administrator typed satisfy the connector's declared schema. It
 * makes no network call and proves nothing about the device — a "Test
 * Connection" that actually reaches hardware needs the gateway and arrives in
 * Phase 2. Reporting success here as though hardware had answered would be a
 * lie the admin would act on.
 */

export interface FieldValidationIssue {
  field: string;
  message: string;
}

export interface ValidatedConfiguration {
  /** Non-secret values, safe for the readable JSON column. */
  plain: Record<string, unknown>;
  /** Secret values, for SecretEncryptionService. Never logged or returned. */
  secret: Record<string, unknown>;
}

@Injectable()
export class ConnectorConfigurationValidator {
  constructor(private readonly registry: AttendanceConnectorRegistry) {}

  /**
   * Validates and coerces submitted configuration against the connector schema.
   *
   * Throws a BadRequestException listing every offending field at once, rather
   * than failing on the first, so an admin fixes the form in one pass.
   */
  validate(
    connectorType: string,
    submitted: Record<string, unknown>,
  ): ValidatedConfiguration {
    const definition = this.registry.require(connectorType);
    const issues: FieldValidationIssue[] = [];
    const plain: Record<string, unknown> = {};
    const secret: Record<string, unknown> = {};

    for (const field of definition.configurationSchema.fields) {
      const raw = submitted[field.key];
      const isAbsent =
        raw === undefined ||
        raw === null ||
        (typeof raw === 'string' && raw.trim().length === 0);

      if (isAbsent) {
        if (field.required) {
          issues.push({
            field: field.key,
            message: `${field.label} is required.`,
          });
        }
        continue;
      }

      const coerced = this.coerce(field, raw, issues);
      if (coerced === undefined) {
        continue;
      }

      const isSecret = field.secret === true || field.type === 'secret';
      if (isSecret) {
        secret[field.key] = coerced;
      } else {
        plain[field.key] = coerced;
      }
    }

    // Unknown keys are rejected rather than silently stored: a typo in a field
    // name would otherwise look saved but never reach the connector.
    const known = new Set(
      definition.configurationSchema.fields.map((field) => field.key),
    );
    for (const key of Object.keys(submitted)) {
      if (!known.has(key)) {
        issues.push({
          field: key,
          message: `${key} is not a recognised setting for ${definition.label}.`,
        });
      }
    }

    if (issues.length > 0) {
      throw new BadRequestException({
        message: 'The connector configuration is not valid.',
        errors: issues,
      });
    }

    return { plain, secret };
  }

  /**
   * Validates a requested poll interval against the connector's floor.
   *
   * Rejects rather than silently clamping: an administrator who asked for five
   * minutes should be told the floor is fifteen, not left believing five was
   * accepted. The registry's clamp helper stays available for machine-driven
   * paths where refusing is not an option.
   */
  validatePollIntervalMinutes(
    connectorType: string,
    requestedMinutes: number,
  ): number {
    const definition = this.registry.require(connectorType);
    const minimum = definition.recommendedSyncPolicy.minimumIntervalMinutes;

    if (!Number.isFinite(requestedMinutes) || requestedMinutes <= 0) {
      throw new BadRequestException({
        message: 'The sync interval must be a positive number of minutes.',
        errors: [
          { field: 'intervalValue', message: 'Enter a valid interval.' },
        ],
      });
    }

    if (requestedMinutes < minimum) {
      throw new BadRequestException({
        message: `Minimum supported interval for ${definition.label} is ${minimum} minutes.`,
        errors: [
          {
            field: 'intervalValue',
            message:
              definition.recommendedSyncPolicy.rationale ??
              `${definition.label} does not support polling more often than every ${minimum} minutes.`,
          },
        ],
      });
    }

    return requestedMinutes;
  }

  /**
   * Presence metadata for secrets, for API responses.
   *
   * Returns whether each secret is configured and a fixed-width mask. The mask
   * is a constant, not a slice of the value: a partial reveal would leak length
   * and characters.
   */
  describeSecrets(
    connectorType: string,
    storedSecret: Record<string, unknown> | null | undefined,
  ): Record<string, { configured: boolean; masked: string | null }> {
    const definition = this.registry.require(connectorType);
    const result: Record<
      string,
      { configured: boolean; masked: string | null }
    > = {};

    for (const field of definition.configurationSchema.fields) {
      if (field.secret !== true && field.type !== 'secret') continue;
      const value = storedSecret?.[field.key];
      const configured =
        value !== undefined &&
        value !== null &&
        !(typeof value === 'string' && value.trim().length === 0);
      result[field.key] = {
        configured,
        masked: configured ? '••••••' : null,
      };
    }

    return result;
  }

  private coerce(
    field: ConnectorConfigurationField,
    raw: unknown,
    issues: FieldValidationIssue[],
  ): unknown {
    switch (field.type) {
      case 'number':
      case 'secret': {
        // Secret fields are numeric for the ZKTeco comm key; strings elsewhere.
        if (field.type === 'secret' && typeof raw === 'string') {
          return raw.trim();
        }
        const value = typeof raw === 'number' ? raw : Number(raw);
        if (!Number.isFinite(value)) {
          issues.push({
            field: field.key,
            message: `${field.label} must be a number.`,
          });
          return undefined;
        }
        if (field.min !== undefined && value < field.min) {
          issues.push({
            field: field.key,
            message: `${field.label} must be ${field.min} or more.`,
          });
          return undefined;
        }
        if (field.max !== undefined && value > field.max) {
          issues.push({
            field: field.key,
            message: `${field.label} must be ${field.max} or less.`,
          });
          return undefined;
        }
        return value;
      }

      case 'boolean': {
        if (typeof raw === 'boolean') return raw;
        if (raw === 'true') return true;
        if (raw === 'false') return false;
        issues.push({
          field: field.key,
          message: `${field.label} must be true or false.`,
        });
        return undefined;
      }

      case 'select': {
        const value = String(raw).trim();
        const allowed = field.options?.map((option) => option.value) ?? [];
        if (!allowed.includes(value)) {
          issues.push({
            field: field.key,
            message: `${field.label} must be one of: ${allowed.join(', ')}.`,
          });
          return undefined;
        }
        return value;
      }

      case 'timezone':
      case 'string':
      default: {
        const value = String(raw).trim();
        if (value.length === 0) {
          issues.push({
            field: field.key,
            message: `${field.label} cannot be blank.`,
          });
          return undefined;
        }
        // Anchored on both ends: an unanchored expression would accept a value
        // that merely contains a match, which is not what a field declaring a
        // format means.
        if (
          field.pattern &&
          !new RegExp(`^(?:${field.pattern})$`).test(value)
        ) {
          issues.push({
            field: field.key,
            message:
              field.patternMessage ??
              `${field.label} is not in the expected format.`,
          });
          return undefined;
        }
        return value;
      }
    }
  }
}
