import { BadRequestException } from '@nestjs/common';
import {
  ApprovalActorType,
  ApprovalModuleKey,
  UserStatus,
} from '@prisma/client';
import { ApprovalMatricesService } from './approval-matrices.service';
import type { CreateApprovalMatrixDto } from './dto/approval-matrix.dto';

/**
 * BUG-1969 — the approver check answered two questions and reported one.
 *
 * `findUserById` filters on tenant *and* `status: 'ACTIVE'`. Naming a colleague
 * the tenant had just provisioned — status `INVITED`, and returned by
 * `GET /api/users` for the same caller — was refused with "Selected approver
 * user does not belong to this tenant", a statement the caller's own data
 * contradicts. The administrator then goes looking for a cross-tenant mistake
 * that never happened.
 *
 * Whether an invited user may hold an approval step is a product question left
 * with BUG-1968 and ITEM-0106; the route resolver does not check status for a
 * USER approver, so admitting one would route requests to somebody who cannot
 * sign in. The refusal therefore stands. What changed is that it now names the
 * predicate that actually failed.
 */

const TENANT_ID = 'tenant-1';

function buildDto(approverUserId: string): CreateApprovalMatrixDto {
  return {
    moduleKey: ApprovalModuleKey.LEAVE_REQUEST,
    name: 'Manager approval',
    sequence: 1,
    approverType: ApprovalActorType.USER,
    approverUserId,
  } as CreateApprovalMatrixDto;
}

describe('ApprovalMatricesService approver validation', () => {
  let repository: {
    findReference: jest.Mock;
    findRoleById: jest.Mock;
    findUserById: jest.Mock;
    findTenantUserById: jest.Mock;
    findConflict: jest.Mock;
    create: jest.Mock;
  };
  let service: ApprovalMatricesService;

  const currentUser = {
    tenantId: TENANT_ID,
    userId: 'admin-user',
  } as never;

  beforeEach(() => {
    repository = {
      findReference: jest.fn().mockResolvedValue({ id: 'reference' }),
      findRoleById: jest.fn().mockResolvedValue({ id: 'role-1' }),
      findUserById: jest.fn().mockResolvedValue(null),
      findTenantUserById: jest.fn(),
      findConflict: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'matrix-1' }),
    };

    service = new ApprovalMatricesService(repository as never, {
      log: jest.fn(),
    } as never);
  });

  it('rejects an invited approver by account status, not by tenancy', async () => {
    repository.findTenantUserById.mockResolvedValue({
      id: 'invited-user',
      status: UserStatus.INVITED,
    });

    await expect(
      service.create(currentUser, buildDto('invited-user')),
    ).rejects.toThrow(BadRequestException);

    const message = await service
      .create(currentUser, buildDto('invited-user'))
      .catch((error: Error) => error.message);

    expect(message).toContain('has not activated their account');
    /*
     * The load-bearing assertion. A message that merely mentioned the account
     * would still have been wrong while it also asserted the tenancy failure,
     * and that assertion is the whole defect: it is false, and the reader acts
     * on it.
     */
    expect(message).not.toContain('does not belong to this tenant');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects a disabled approver in its own words', async () => {
    repository.findTenantUserById.mockResolvedValue({
      id: 'disabled-user',
      status: UserStatus.DISABLED,
    });

    const message = await service
      .create(currentUser, buildDto('disabled-user'))
      .catch((error: Error) => error.message);

    expect(message).toContain('disabled');
    expect(message).not.toContain('does not belong to this tenant');
  });

  it('keeps the tenancy message for a user genuinely outside the tenant', async () => {
    repository.findTenantUserById.mockResolvedValue(null);

    const message = await service
      .create(currentUser, buildDto('other-tenant-user'))
      .catch((error: Error) => error.message);

    expect(message).toBe(
      'Selected approver user does not belong to this tenant.',
    );
  });

  it('looks the approver up without the ACTIVE filter', async () => {
    repository.findTenantUserById.mockResolvedValue({
      id: 'active-user',
      status: UserStatus.ACTIVE,
    });

    await service.create(currentUser, buildDto('active-user'));

    expect(repository.findTenantUserById).toHaveBeenCalledWith(
      TENANT_ID,
      'active-user',
    );
    /*
     * `findUserById` is resolution-time — "may this user be routed an approval
     * right now" — and must keep its ACTIVE filter for the route resolver. The
     * fix is that configuration-time validation stopped borrowing it, so this
     * asserts the two paths were separated rather than merged.
     */
    expect(repository.findUserById).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalled();
  });
});
