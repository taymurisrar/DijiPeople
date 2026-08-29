import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { LeaveRequestsController } from './leave-requests.controller';
import {
  REQUIRED_PERMISSIONS_KEY,
  REQUIRED_RBAC_PERMISSIONS_KEY,
} from '../../common/decorators/require-permissions.decorator';

/**
 * BUG-2015 — approving a leave request was gated on **read**.
 *
 * `leave-requests.approve` and `leave-requests.reject` already existed, were
 * already mapped in the RBAC matrix, and were already granted to roles. They
 * were consulted only for deciding what the dashboard and inbox *display*.
 *
 * So an administrator who withheld approve from a role hid the button and did
 * not stop the action: anyone who could read a leave request could approve it,
 * including by calling the endpoint directly. `AGENTS.md` is explicit that
 * frontend gating is UX only and every gated action must also be enforced
 * server-side — this was a case where nothing enforced it.
 *
 * Read through the Reflector rather than by grepping the file, because that is
 * what the request actually meets: decorators are inherited and composed, and a
 * scan of the source cannot see what Nest assembles. See the framework note
 * `trust-the-runtime-invariant-over-a-static-scan`.
 */

type Handler = { name: string; expectedLegacy: string; expectedMatrix: string };

const GOVERNED: Handler[] = [
  {
    name: 'approve',
    expectedLegacy: 'leave-requests.approve',
    expectedMatrix: 'APPROVE',
  },
  {
    name: 'reject',
    expectedLegacy: 'leave-requests.reject',
    expectedMatrix: 'REJECT',
  },
];

function metadataFor(handlerName: string) {
  const reflector = new Reflector();
  const handler = (
    LeaveRequestsController.prototype as unknown as Record<string, () => void>
  )[handlerName];
  expect(handler).toBeDefined();
  return {
    legacy: reflector.get<string[]>(REQUIRED_PERMISSIONS_KEY, handler) ?? [],
    matrix:
      reflector.get<{ privilege?: string }[]>(
        REQUIRED_RBAC_PERMISSIONS_KEY,
        handler,
      ) ?? [],
    method: reflector.get<string>(METHOD_METADATA, handler),
  };
}

describe('BUG-2015 — approving leave requires permission to approve', () => {
  it.each(GOVERNED)(
    '$name is gated on its own permission in the legacy system',
    ({ name, expectedLegacy }) => {
      const { legacy } = metadataFor(name);
      expect(legacy).toContain(expectedLegacy);
      /*
       * The load-bearing half. Declaring the right key *alongside* `read` would
       * satisfy a "contains approve" assertion while leaving the route reachable
       * by anyone who can read — `PermissionsGuard` requires *all* declared
       * legacy keys, so an extra `read` narrows nothing but a missing approve
       * would have passed a laxer test.
       */
      expect(legacy).not.toContain('leave-requests.read');
    },
  );

  /*
   * Compared in upper case on purpose: the decorator is written
   * `@RequirePermission(ENTITY_KEYS.LEAVE_REQUESTS, 'approve')` in lower case
   * and normalises to the `SecurityPrivilege` enum value. Asserting the source
   * spelling would pass against nothing.
   */
  it.each(GOVERNED)(
    '$name is gated on its own privilege in the matrix',
    ({ name, expectedMatrix }) => {
      const { matrix } = metadataFor(name);
      const privileges = matrix.map((entry) => entry.privilege);
      expect(privileges).toContain(expectedMatrix);
      // `PermissionsGuard` requires at least *one* matrix privilege, so leaving
      // `read` here would defeat the gate entirely rather than merely widen it.
      expect(privileges).not.toContain('READ');
    },
  );

  it('leaves cancel alone, which was always correct', () => {
    /*
     * Three routes below approve in the same file, `cancel` has always used
     * `leave-requests.cancel` and `delete`. That contrast is what makes BUG-2015
     * a slip rather than a design, and this asserts the fix did not "tidy" a
     * route that needed nothing.
     */
    const { legacy, matrix } = metadataFor('cancel');
    expect(legacy).toContain('leave-requests.cancel');
    expect(matrix.map((entry) => entry.privilege)).toContain('DELETE');
  });

  it('keeps the dedicated keys real rather than merely declared', () => {
    /*
     * The defect underneath the defect: both keys existed, were mapped, and were
     * granted — and no route required them. A key nothing enforces is worse than
     * no key, because the administrator granting it believes they have drawn a
     * boundary.
     */
    const controller = readFileSync(
      join(__dirname, 'leave-requests.controller.ts'),
      'utf8',
    ).replace(/\r\n/g, '\n');
    expect(controller).toContain("@Permissions('leave-requests.approve')");
    expect(controller).toContain("@Permissions('leave-requests.reject')");
  });
});
