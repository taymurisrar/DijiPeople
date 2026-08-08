import { EmailExecutionService } from './email-execution.service';

/*
 * Callers rarely hold a record's placement, but they always hold the person the
 * email is about. These cover the derivation that turns one into the other, and
 * the guarantee that it can never stop a send.
 */

type Placement = {
  organizationId: string | null;
  businessUnitId: string | null;
  departmentId: string | null;
  teamId: string | null;
};

function buildService(findEmployeePlacement: jest.Mock) {
  const service = Object.create(
    EmailExecutionService.prototype,
  ) as EmailExecutionService;

  Object.assign(service, {
    repository: { findEmployeePlacement },
    logger: { warn: jest.fn() },
  });

  return service;
}

function resolveScope(
  service: EmailExecutionService,
  input: Record<string, unknown>,
): Promise<Placement> {
  return (
    service as unknown as {
      resolveScope(value: unknown): Promise<Placement>;
    }
  ).resolveScope(input);
}

const BASE = { tenantId: 'tenant-1', eventCode: 'AUTH_PASSWORD_RESET' };

describe('email scope resolution', () => {
  it('reads placement from the employee when the caller supplies only a person', async () => {
    const findEmployeePlacement = jest.fn().mockResolvedValue({
      organizationId: 'org-1',
      businessUnitId: 'bu-1',
      departmentId: 'dept-1',
      teamId: 'team-1',
    });
    const service = buildService(findEmployeePlacement);

    const scope = await resolveScope(service, {
      ...BASE,
      subjectUserId: 'user-1',
    });

    expect(scope).toEqual({
      organizationId: 'org-1',
      businessUnitId: 'bu-1',
      departmentId: 'dept-1',
      teamId: 'team-1',
    });
    expect(findEmployeePlacement).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      employeeId: undefined,
      userId: 'user-1',
    });
  });

  it('prefers placement the caller stated outright over the employee record', async () => {
    const findEmployeePlacement = jest.fn();
    const service = buildService(findEmployeePlacement);

    const scope = await resolveScope(service, {
      ...BASE,
      businessUnitId: 'bu-explicit',
      subjectEmployeeId: 'employee-1',
    });

    expect(scope.businessUnitId).toBe('bu-explicit');
    expect(findEmployeePlacement).not.toHaveBeenCalled();
  });

  it('stays at tenant level when the person has no employee record', async () => {
    const service = buildService(jest.fn().mockResolvedValue(null));

    const scope = await resolveScope(service, {
      ...BASE,
      subjectUserId: 'user-without-employee',
    });

    expect(scope).toEqual({
      organizationId: null,
      businessUnitId: null,
      departmentId: null,
      teamId: null,
    });
  });

  it('does not look anything up when no subject is given', async () => {
    const findEmployeePlacement = jest.fn();
    const service = buildService(findEmployeePlacement);

    await resolveScope(service, BASE);

    expect(findEmployeePlacement).not.toHaveBeenCalled();
  });

  it('still sends when the placement lookup fails', async () => {
    const service = buildService(
      jest.fn().mockRejectedValue(new Error('database unavailable')),
    );

    await expect(
      resolveScope(service, { ...BASE, subjectUserId: 'user-1' }),
    ).resolves.toEqual({
      organizationId: null,
      businessUnitId: null,
      departmentId: null,
      teamId: null,
    });
  });
});
