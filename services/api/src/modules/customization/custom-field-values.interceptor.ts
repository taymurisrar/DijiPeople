import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mergeMap, type Observable } from 'rxjs';
import { AUDIT_ACTIONS } from '../../common/constants/audit-actions';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import { CustomFieldValuesService } from './custom-field-values.service';
import {
  CUSTOM_FIELDS_KEY,
  type CustomFieldsBinding,
} from './custom-fields.decorator';

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/* The record a create handler returned, however the module wraps it. */
export function responseRecord(response: unknown): Row | null {
  if (!isRow(response)) return null;
  for (const key of ['data', 'item', 'record']) {
    const inner = response[key];
    if (isRow(inner) && typeof inner.id === 'string') return inner;
  }
  return typeof response.id === 'string' ? response : null;
}

/* The rows of a list response: a plain array, or one under a known key. */
export function responseRows(response: unknown): Row[] | null {
  if (Array.isArray(response)) return response.filter(isRow);
  if (!isRow(response)) return null;
  for (const key of ['items', 'data', 'records', 'rows']) {
    const inner = response[key];
    if (Array.isArray(inner)) return inner.filter(isRow);
  }
  return null;
}

/**
 * Custom field values on system modules' records — TASK-0035, ADR-0024.
 *
 * Global, and inert on any handler without `@CustomFields(...)`. On one that
 * has it:
 *
 * 1. Before the handler (and before the ValidationPipe, which runs after
 *    interceptors): lift `customFields` out of the body, so the module's DTO
 *    never sees it, and validate it against the published fields. A bad value
 *    is refused here, before the module writes anything.
 * 2. After the handler succeeds: write the values against the record's id,
 *    audit the change, and attach the values the user may read to the
 *    response (one record, or every row of a list).
 *
 * Nothing here decides access to the record. A value is written or read only
 * once the module's own handler has succeeded for that record id.
 *
 * Not atomic with the module's own write: the module commits first, then the
 * values are written. Validation happens up front, so what can still fail is
 * the database itself — in which case the request fails and the record exists
 * without the values (ADR-0024 records the trade).
 */
@Injectable()
export class CustomFieldValuesInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CustomFieldValuesInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly values: CustomFieldValuesService,
    private readonly audit: AuditService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const binding = this.reflector.get<CustomFieldsBinding | undefined>(
      CUSTOM_FIELDS_KEY,
      context.getHandler(),
    );
    if (!binding) return next.handle();

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const body: unknown = request.body;
    const writes = binding.role === 'create' || binding.role === 'update';
    let submitted: unknown;
    if (writes && isRow(body) && 'customFields' in body) {
      submitted = body.customFields;
      /* Always, even with no custom fields: the DTO would refuse the key. */
      delete body.customFields;
    }

    const user = request.user;
    if (!user?.tenantId) return next.handle();
    if (
      !(await this.values.hasCustomColumns(user.tenantId, binding.tableKey))
    ) {
      return next.handle();
    }

    const paramId = binding.idParam
      ? (request.params as Record<string, string | undefined>)[binding.idParam]
      : undefined;
    const validated =
      writes && submitted !== undefined
        ? await this.values.validate(
            user,
            binding.tableKey,
            submitted,
            binding.role,
            binding.role === 'update' ? paramId : undefined,
          )
        : null;

    return next.handle().pipe(
      mergeMap(async (response: unknown) => {
        if (binding.role === 'list')
          return this.attachToRows(user, binding, response);

        const record = responseRecord(response);
        const recordId =
          binding.role === 'create'
            ? (record?.id as string | undefined)
            : paramId;
        if (!recordId) {
          if (validated && Object.keys(validated).length) {
            this.logger.error(
              `${binding.tableKey} ${binding.role}: no record id in the response; custom field values were not stored.`,
            );
          }
          return response;
        }

        if (validated && Object.keys(validated).length) {
          await this.write(user, binding.tableKey, recordId, validated);
        }
        /*
         * An update may answer with nothing, with a status envelope, or with a
         * parent record. Values go only onto the record they belong to.
         */
        if (!record || record.id !== recordId) return response;
        const customFields = await this.values.read(
          user,
          binding.tableKey,
          recordId,
        );
        if (record !== response && isRow(response)) {
          for (const key of ['data', 'item', 'record']) {
            if (response[key] === record) {
              return { ...response, [key]: { ...record, customFields } };
            }
          }
        }
        return { ...record, customFields };
      }),
    );
  }

  private async write(
    user: AuthenticatedRequest['user'],
    tableKey: string,
    recordId: string,
    values: Record<string, unknown>,
  ) {
    const before = await this.values.read(user, tableKey, recordId);
    await this.values.write(user, tableKey, recordId, values);
    const after = await this.values.read(user, tableKey, recordId);
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: AUDIT_ACTIONS.CUSTOM_FIELD_VALUES_UPDATED,
      entityType: tableKey,
      entityId: recordId,
      sourceModule: 'customization',
      beforeSnapshot: before,
      afterSnapshot: after,
    });
  }

  private async attachToRows(
    user: AuthenticatedRequest['user'],
    binding: CustomFieldsBinding,
    response: unknown,
  ) {
    const rows = responseRows(response);
    if (!rows?.length) return response;
    const byId = await this.values.readMany(
      user,
      binding.tableKey,
      rows
        .map((row) => row.id)
        .filter((id): id is string => typeof id === 'string'),
    );
    const withValues = rows.map((row) =>
      typeof row.id === 'string' && byId.has(row.id)
        ? { ...row, customFields: byId.get(row.id) }
        : row,
    );
    if (Array.isArray(response)) return withValues;
    for (const key of ['items', 'data', 'records', 'rows']) {
      if (Array.isArray((response as Row)[key])) {
        return { ...(response as Row), [key]: withValues };
      }
    }
    return response;
  }
}
