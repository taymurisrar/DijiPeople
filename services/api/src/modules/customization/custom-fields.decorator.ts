import { SetMetadata } from '@nestjs/common';

export const CUSTOM_FIELDS_KEY = 'customFieldsBinding';

/**
 * What a route does to its record, as far as custom field values care.
 *
 * - `create` — the body may carry `customFields`; they are validated before the
 *   handler runs and written against the id the handler returns.
 * - `update` — the same, written against the id in the route param.
 * - `read`   — the response is one record; its values are attached.
 * - `list`   — the response is a page of records; values are attached per row.
 */
export type CustomFieldsRole = 'create' | 'update' | 'read' | 'list';

export type CustomFieldsBinding = {
  readonly tableKey: string;
  readonly role: CustomFieldsRole;
  /**
   * Route param holding the record id. Required for `update`. For `read`,
   * omit it when the route is keyed by a parent and answers with the record:
   * the id is then taken from the response.
   */
  readonly idParam?: string;
};

/**
 * Custom field values for a system module's route — TASK-0035, ADR-0024.
 *
 * Metadata only. `CustomFieldValuesInterceptor` is global and acts on handlers
 * carrying this, so wiring a module is one line per route: no module import,
 * no DTO change (the interceptor lifts `customFields` out of the body before
 * the ValidationPipe, which would otherwise refuse it as unknown).
 *
 * The handler stays the authority on access. The interceptor writes or reads
 * values only after the handler has succeeded for that record, so a caller who
 * cannot update or read the record never reaches its values.
 */
export const CustomFields = (
  tableKey: string,
  role: CustomFieldsRole,
  idParam?: string,
) =>
  SetMetadata(CUSTOM_FIELDS_KEY, {
    tableKey,
    role,
    idParam,
  } satisfies CustomFieldsBinding);
