import {
  BadRequestException,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';

import {
  CustomFieldValuesInterceptor,
  responseRecord,
  responseRows,
} from './custom-field-values.interceptor';
import { CUSTOM_FIELDS_KEY, CustomFields } from './custom-fields.decorator';

/*
 * TASK-0035 / ADR-0024 — the generic hook every system module's routes opt
 * into. What must hold: the body never reaches the DTO with `customFields`, a
 * bad value is refused before the handler runs, values are written only against
 * the record the handler answered for, and routes without the decorator are
 * untouched.
 */

const user = { userId: 'u1', tenantId: 't1', permissionKeys: [] };

function service(overrides: Record<string, unknown> = {}) {
  return {
    hasCustomColumns: jest.fn().mockResolvedValue(true),
    validate: jest.fn().mockResolvedValue({ mis_grade: 'A' }),
    write: jest.fn().mockResolvedValue(undefined),
    read: jest.fn().mockResolvedValue({ mis_grade: 'A' }),
    readMany: jest
      .fn()
      .mockResolvedValue(new Map([['r1', { mis_grade: 'A' }]])),
    ...overrides,
  };
}

function setup(
  binding: ReturnType<typeof CustomFields> | null,
  request: Record<string, unknown>,
  values = service(),
) {
  const handler = () => undefined;
  if (binding) binding({}, 'handler', { value: handler });
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const interceptor = new CustomFieldValuesInterceptor(
    new Reflector(),
    values as never,
    audit as never,
  );
  const context = {
    getType: () => 'http',
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => ({ user, params: {}, ...request }),
    }),
  } as unknown as ExecutionContext;
  return { interceptor, context, values, audit };
}

const answer = (response: unknown): CallHandler => ({
  handle: () => of(response),
});

describe('responseRecord / responseRows', () => {
  it('finds the record however the module wraps it', () => {
    expect(responseRecord({ id: 'r1' })).toEqual({ id: 'r1' });
    expect(responseRecord({ data: { id: 'r1' } })).toEqual({ id: 'r1' });
    expect(responseRecord({ item: { id: 'r1' } })).toEqual({ id: 'r1' });
    expect(responseRecord([{ id: 'r1' }])).toBeNull();
    expect(responseRecord({ ok: true })).toBeNull();
  });

  it('finds the rows of a list', () => {
    expect(responseRows([{ id: 'a' }])).toEqual([{ id: 'a' }]);
    expect(responseRows({ items: [{ id: 'a' }], total: 1 })).toEqual([
      { id: 'a' },
    ]);
    expect(responseRows({ data: [{ id: 'a' }] })).toEqual([{ id: 'a' }]);
    expect(responseRows({ id: 'a' })).toBeNull();
  });
});

describe('CustomFieldValuesInterceptor', () => {
  it('leaves an undecorated route alone, customFields and all', async () => {
    const body = { name: 'x', customFields: { mis_grade: 'A' } };
    const { interceptor, context, values } = setup(null, { body });
    const out = await lastValueFrom(
      await interceptor.intercept(context, answer({ id: 'r1' })),
    );
    expect(body).toHaveProperty('customFields');
    expect(out).toEqual({ id: 'r1' });
    expect(values.hasCustomColumns).not.toHaveBeenCalled();
  });

  it('always lifts customFields out of the body, even for a tenant with no custom fields', async () => {
    const body = { name: 'x', customFields: { mis_grade: 'A' } };
    const { interceptor, context, values } = setup(
      CustomFields('projects', 'create'),
      { body },
      service({ hasCustomColumns: jest.fn().mockResolvedValue(false) }),
    );
    await lastValueFrom(
      await interceptor.intercept(context, answer({ id: 'r1' })),
    );
    expect(body).toEqual({ name: 'x' });
    expect(values.validate).not.toHaveBeenCalled();
    expect(values.write).not.toHaveBeenCalled();
  });

  it('refuses a bad value before the handler runs', async () => {
    const values = service({
      validate: jest
        .fn()
        .mockRejectedValue(new BadRequestException('Validation failed.')),
    });
    const { interceptor, context } = setup(
      CustomFields('projects', 'create'),
      { body: { customFields: { mis_grade: 'Z' } } },
      values,
    );
    const handle = jest.fn(() => of({ id: 'r1' }));
    await expect(
      interceptor.intercept(context, { handle }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(handle).not.toHaveBeenCalled();
  });

  it('writes against the created record id, audits it, and answers with the values', async () => {
    const { interceptor, context, values, audit } = setup(
      CustomFields('projects', 'create'),
      { body: { customFields: { mis_grade: 'A' } } },
    );
    const out = await lastValueFrom(
      await interceptor.intercept(
        context,
        answer({ data: { id: 'r1', name: 'P' } }),
      ),
    );
    expect(values.validate).toHaveBeenCalledWith(
      user,
      'projects',
      { mis_grade: 'A' },
      'create',
      undefined,
    );
    expect(values.write).toHaveBeenCalledWith(user, 'projects', 'r1', {
      mis_grade: 'A',
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CUSTOM_FIELD_VALUES_UPDATED',
        entityType: 'projects',
        entityId: 'r1',
      }),
    );
    expect(out).toEqual({
      data: { id: 'r1', name: 'P', customFields: { mis_grade: 'A' } },
    });
  });

  it('on update, validates against the route id and writes there', async () => {
    const { interceptor, context, values } = setup(
      CustomFields('projects', 'update', 'projectId'),
      {
        body: { customFields: { mis_grade: 'A' } },
        params: { projectId: 'r1' },
      },
    );
    await lastValueFrom(
      await interceptor.intercept(context, answer({ id: 'r1' })),
    );
    expect(values.validate).toHaveBeenCalledWith(
      user,
      'projects',
      { mis_grade: 'A' },
      'update',
      'r1',
    );
    expect(values.write).toHaveBeenCalledWith(user, 'projects', 'r1', {
      mis_grade: 'A',
    });
  });

  it('never attaches values to a response that is not the record (e.g. a parent)', async () => {
    const { interceptor, context } = setup(
      CustomFields('holidays', 'read', 'holidayId'),
      {
        params: { holidayId: 'h1' },
      },
    );
    const out = await lastValueFrom(
      await interceptor.intercept(context, answer({ id: 'calendar-1' })),
    );
    expect(out).toEqual({ id: 'calendar-1' });
  });

  it('does not store values when a create answers without a record id', async () => {
    const { interceptor, context, values } = setup(
      CustomFields('employeeEducation', 'create'),
      { body: { customFields: { mis_grade: 'A' } } },
    );
    const out = await lastValueFrom(
      await interceptor.intercept(context, answer([{ id: 'e1' }])),
    );
    expect(values.write).not.toHaveBeenCalled();
    expect(out).toEqual([{ id: 'e1' }]);
  });

  it('attaches values to every row of a list in one read', async () => {
    const { interceptor, context, values } = setup(
      CustomFields('projects', 'list'),
      {},
    );
    const out = await lastValueFrom(
      await interceptor.intercept(
        context,
        answer({ items: [{ id: 'r1' }, { id: 'r2' }], total: 2 }),
      ),
    );
    expect(values.readMany).toHaveBeenCalledTimes(1);
    expect(out).toEqual({
      items: [{ id: 'r1', customFields: { mis_grade: 'A' } }, { id: 'r2' }],
      total: 2,
    });
  });

  it('keeps its metadata under one key', () => {
    const h = () => undefined;
    CustomFields('projects', 'read', 'id')({}, 'h', { value: h });
    expect(new Reflector().get(CUSTOM_FIELDS_KEY, h)).toEqual({
      tableKey: 'projects',
      role: 'read',
      idParam: 'id',
    });
  });
});
