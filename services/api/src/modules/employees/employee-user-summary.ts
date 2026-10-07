/**
 * The only shape in which an employee's linked login account leaves the API.
 *
 * BUG-3883: the employee profile returned `employee.user` as the raw User row,
 * so every caller allowed to read an employee received that account's
 * `passwordHash`, `mfaSecretEncrypted` and `mfaPendingSecretEncrypted`. The leak
 * surfaced only because `mfaLastUsedStep` is a BigInt: once the account had
 * signed in with MFA, JSON serialisation threw and the profile returned 500.
 *
 * The list/detail response in employees.service already picked these fields by
 * hand. Both now go through this function, and `EMPLOYEE_USER_SELECT` keeps the
 * secrets from being loaded in the first place, so a future passthrough has
 * nothing dangerous to pass through.
 */
export const EMPLOYEE_USER_SELECT = {
  id: true,
  tenantId: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  lastLoginAt: true,
  businessUnitId: true,
  userRoles: {
    include: {
      role: {
        select: {
          id: true,
          key: true,
          name: true,
        },
      },
    },
  },
} as const;

type EmployeeUserSource = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  lastLoginAt: Date | null;
  userRoles: ReadonlyArray<{
    role: { id: string; key: string; name: string };
  }>;
};

export function toEmployeeUserSummary(user: EmployeeUserSource | null) {
  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    lastLoginAt: user.lastLoginAt,
    firstName: user.firstName,
    lastName: user.lastName,
    status: user.status,
    roles: user.userRoles.map((userRole) => ({
      id: userRole.role.id,
      key: userRole.role.key,
      name: userRole.role.name,
    })),
  };
}
