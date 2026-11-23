import {
  CallHandler,
  ExecutionContext,
  Injectable,
  SetMetadata,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { mergeMap, type Observable } from 'rxjs';

import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { FieldAccessService } from './field-access.service';

export const FIELD_ACCESS_KEY = 'fieldAccessBindings';

/**
 * One table whose tenant field-security rules apply to a route's response.
 * `paths` names the nested objects of the response that carry the table's
 * columns (for example `personalInfo`); the record itself is always covered.
 */
export type FieldAccessBinding = {
  readonly tableKey: string;
  readonly paths?: readonly string[];
};

/**
 * BUG-3155. Serialise only the fields the tenant's field-security policies let
 * the caller read. Metadata only: `FieldAccessInterceptor` is global and inert
 * on a handler without it.
 *
 * Hidden values become `null` (same keys, so the response shape does not
 * change); masked values carry the server-computed mask.
 */
export const FieldAccess = (...bindings: FieldAccessBinding[]) =>
  SetMetadata(FIELD_ACCESS_KEY, bindings);

type Row = Record<string, unknown>;
const isRow = (value: unknown): value is Row =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The records of a response: a bare record, a list, or a list under a known key. */
function recordsOf(response: unknown): Row[] {
  if (Array.isArray(response)) return response.filter(isRow);
  if (!isRow(response)) return [];
  for (const key of ['items', 'data', 'records', 'rows']) {
    const inner = response[key];
    if (Array.isArray(inner)) return inner.filter(isRow);
    if (isRow(inner)) return [inner];
  }
  return [response];
}

@Injectable()
export class FieldAccessInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: FieldAccessService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const bindings = this.reflector.get<FieldAccessBinding[] | undefined>(
      FIELD_ACCESS_KEY,
      context.getHandler(),
    );
    if (!bindings || bindings.length === 0) return next.handle();
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    // No authenticated tenant user: nothing here decides access to the route.
    if (!user?.tenantId) return next.handle();

    return next.handle().pipe(
      mergeMap(async (response: unknown) => {
        const records = recordsOf(response);
        if (records.length === 0) return response;
        for (const binding of bindings) {
          const decision = await this.access.forRequest(user, binding.tableKey);
          if (decision.restrictedFields().length === 0) continue;
          for (const record of records) {
            decision.apply(record, binding.paths ?? []);
          }
        }
        return response;
      }),
    );
  }
}
