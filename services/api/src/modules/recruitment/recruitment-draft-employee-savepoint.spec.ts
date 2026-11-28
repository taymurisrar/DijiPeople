import { Prisma } from '@prisma/client';

import { RecruitmentService } from './recruitment.service';

/**
 * BUG-3201. Creating the draft employee for a hired application runs inside the
 * caller's interactive transaction, where a failed statement aborts the whole
 * transaction. Each insert is therefore wrapped in a SAVEPOINT so a unique
 * violation can be rolled back locally and the recovery reads that follow can run.
 *
 * The real-Postgres proof that the savepoint pattern works through Prisma's
 * interactive transaction is `test/identity-concurrent-create.e2e-spec.ts`; this
 * pins the SEQUENCE the service issues.
 */
type Ensure = (params: {
  tenantId: string;
  application: {
    id: string;
    candidateId: string;
    jobOpeningId: string;
    candidate: object;
  };
  actorUserId: string;
  tx: unknown;
}) => Promise<string | null>;

const unique = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });

function harness(options: {
  creates: Array<'unique' | 'ok' | Error>;
  winner?: string | null;
}) {
  const statements: string[] = [];
  const creates = [...options.creates];
  const employee = {
    findFirst: jest
      .fn()
      // 1: the "already exists for this application" check
      .mockResolvedValueOnce(null)
      // 2: the latest employee, to derive the next code
      .mockResolvedValueOnce({ employeeCode: 'EMP-0007' })
      // 3+: the winner lookup after a unique violation
      .mockImplementation(async () =>
        options.winner ? { id: options.winner } : null,
      ),
    create: jest.fn(async () => {
      const next = creates.shift();
      if (next === 'unique') throw unique();
      if (next instanceof Error) throw next;
      return { id: 'draft-1' };
    }),
  };
  const tx = {
    employee,
    $executeRaw: jest.fn(async (strings: TemplateStringsArray) => {
      statements.push(strings.join('').trim());
      return 0;
    }),
  };
  const service = Object.create(RecruitmentService.prototype) as Record<
    string,
    unknown
  >;
  service.tenantSettingsResolverService = {
    getEmployeeSettings: jest.fn().mockResolvedValue({
      autoCreateDraftOnHire: true,
      employeeIdPrefix: 'emp',
      employeeIdSequenceLength: 4,
      autoGenerateEmployeeId: true,
      keepEmployeeAsDraftUntilOnboardingComplete: true,
      defaultEmployeeStatus: 'ACTIVE',
      defaultEmploymentType: 'FULL_TIME',
      defaultWorkMode: 'ONSITE',
    }),
    getRecruitmentSettings: jest
      .fn()
      .mockResolvedValue({ autoCreateEmployeeFromCandidate: true }),
  };
  const run = () =>
    (
      service as unknown as { ensureDraftEmployeeForHiredApplication: Ensure }
    ).ensureDraftEmployeeForHiredApplication({
      tenantId: 't1',
      application: {
        id: 'app-1',
        candidateId: 'cand-1',
        jobOpeningId: 'job-1',
        candidate: {
          firstName: 'A',
          middleName: null,
          lastName: 'B',
          phone: '1',
        },
      },
      actorUserId: 'u1',
      tx,
    });
  return { run, statements, employee };
}

describe('ensureDraftEmployeeForHiredApplication savepoints (BUG-3201)', () => {
  it('releases the savepoint after a clean insert', async () => {
    const h = harness({ creates: ['ok'] });
    await expect(h.run()).resolves.toBe('draft-1');
    expect(h.statements).toEqual([
      'SAVEPOINT draft_employee_create',
      'RELEASE SAVEPOINT draft_employee_create',
    ]);
  });

  it('rolls back to the savepoint on a code collision and retries with the next code', async () => {
    const h = harness({ creates: ['unique', 'ok'] });
    await expect(h.run()).resolves.toBe('draft-1');
    expect(h.statements).toEqual([
      'SAVEPOINT draft_employee_create',
      'ROLLBACK TO SAVEPOINT draft_employee_create',
      'SAVEPOINT draft_employee_create',
      'RELEASE SAVEPOINT draft_employee_create',
    ]);
    const codes = (
      h.employee.create.mock.calls as unknown as Array<
        [{ data: { employeeCode: string } }]
      >
    ).map((call) => call[0].data.employeeCode);
    expect(codes).toEqual(['EMP-0008', 'EMP-0009']);
  });

  it("takes the other request's draft when its insert won, without retrying", async () => {
    const h = harness({ creates: ['unique'], winner: 'draft-winner' });
    await expect(h.run()).resolves.toBe('draft-winner');
    expect(h.employee.create).toHaveBeenCalledTimes(1);
    expect(h.statements).toEqual([
      'SAVEPOINT draft_employee_create',
      'ROLLBACK TO SAVEPOINT draft_employee_create',
    ]);
  });

  it('gives up with a conflict after five collisions', async () => {
    const h = harness({
      creates: ['unique', 'unique', 'unique', 'unique', 'unique'],
    });
    await expect(h.run()).rejects.toThrow(/after multiple retries/i);
    expect(h.employee.create).toHaveBeenCalledTimes(5);
  });

  it('rethrows any other failure and does not pretend it was a collision', async () => {
    const h = harness({ creates: [new Error('connection lost')] });
    await expect(h.run()).rejects.toThrow('connection lost');
    expect(h.statements).toEqual(['SAVEPOINT draft_employee_create']);
  });
});
