/*
 * PlatformUser stores firstName and lastName only, but every runtime column and
 * lookup binds to `<relation>.fullName` (leads.service.ts maps it the same way).
 * A relation returned without it renders as an empty cell, which is how the
 * customer Owner column went blank.
 */
export function withFullName<
  T extends { firstName: string; lastName: string } | null | undefined,
>(user: T) {
  if (!user) return null;
  return {
    ...user,
    fullName: `${user.firstName} ${user.lastName}`.trim(),
  };
}
