import { lastValueFrom, of } from 'rxjs';

import {
  FieldAccessInterceptor,
  type FieldAccessBinding,
} from './field-access.interceptor';
import { FieldAccessDecision } from './field-access.service';

/** BUG-3155 — the response-side guarantees that need no database. */
describe('FieldAccessInterceptor', () => {
  const run = async (
    bindings: FieldAccessBinding[] | undefined,
    response: unknown,
    decision = new FieldAccessDecision([]),
    user: unknown = { tenantId: 't', userId: 'u' },
  ) => {
    const reflector = { get: jest.fn().mockReturnValue(bindings) };
    const access = { forRequest: jest.fn().mockResolvedValue(decision) };
    const interceptor = new FieldAccessInterceptor(
      reflector as never,
      access as never,
    );
    const context = {
      getType: () => 'http',
      getHandler: () => undefined,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    };
    return lastValueFrom(
      interceptor.intercept(context as never, { handle: () => of(response) }),
    );
  };

  const hide = (...fields: string[]) =>
    new FieldAccessDecision([
      {
        id: 'p',
        rules: fields.map((fieldKey) => ({
          id: fieldKey,
          fieldKey,
          visibility: 'HIDDEN',
          accessMode: 'EDITABLE',
          maskingPattern: null,
          customMask: null,
        })),
      },
    ]);

  it('omitKeys removes internal storage keys at every depth, whatever the policy', async () => {
    const response = {
      items: [
        {
          id: 'p1',
          document: { id: 'd', storageKey: 'tenants/a/x.pdf', mimeType: 'pdf' },
        },
      ],
      nested: [[{ storageKey: 'k', storageProvider: 's3' }]],
    };
    const out = (await run(
      [{ tableKey: 'employees', omitKeys: ['storageKey', 'storageProvider'] }],
      response,
    )) as typeof response;
    expect(JSON.stringify(out)).not.toContain('storageKey');
    expect(JSON.stringify(out)).not.toContain('storageProvider');
    expect(out.items[0].document.mimeType).toBe('pdf');
  });

  it('deep sweep masks a restricted column wherever it appears in the tree', async () => {
    const response = {
      manager: { cnic: 'X-1', reports: [{ cnic: 'X-2', firstName: 'A' }] },
    };
    const out = (await run(
      [{ tableKey: 'employees', deep: true }],
      response,
      hide('cnic'),
    )) as typeof response;
    expect(JSON.stringify(out)).not.toContain('X-');
    expect(out.manager.reports[0].firstName).toBe('A');
  });

  it('a record that merely contains an `items` array is not mistaken for a list when swept deep', async () => {
    const response = { cnic: 'X-9', items: [{ note: 'n' }] };
    const out = (await run(
      [{ tableKey: 'employees', deep: true }],
      response,
      hide('cnic'),
    )) as { cnic: string | null };
    expect(out.cnic).toBeNull();
  });

  it('an undecorated handler is untouched', async () => {
    const response = { cnic: 'X-1' };
    expect(await run(undefined, response, hide('cnic'))).toEqual({
      cnic: 'X-1',
    });
  });

  it('a request with no tenant user is passed through untouched', async () => {
    const response = { cnic: 'X-1' };
    expect(
      await run([{ tableKey: 'employees' }], response, hide('cnic'), {}),
    ).toEqual({ cnic: 'X-1' });
  });
});
