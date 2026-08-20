import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeEmail } from '../../common/utils/email.util';

/**
 * Anything that can run a Prisma query — the client, or a transaction client.
 *
 * Two of the three service callers create their `User` inside `$transaction`,
 * and an identity written on the outer client survives a rolled-back user
 * creation as an orphan that then blocks that address from ever being
 * provisioned again.
 */
type IdentityDb = PrismaService | Prisma.TransactionClient;

/**
 * The identity for this email, creating one only if nobody holds it.
 *
 * `User` is one account in one tenant. `Identity` is the human who may hold
 * several — see [[ITEM-0062]] and TASK-0009. This is the single place that
 * decides whether a new account belongs to somebody the platform already knows.
 *
 * **An existing identity keeps its credential.** This is the owner's decision
 * made mechanical: *"an existing identity made owner of a second workspace
 * reuses its credentials with no activation step"* (OD-01). Both provisioning
 * paths mint an unguessable placeholder for the `User` row they are about to
 * create; writing that over a real password would lock somebody out of the
 * workspace they already had — by an action taken in another tenant, on their
 * behalf, that they never saw.
 *
 * **A plain function rather than an injectable service, deliberately.** The
 * first version was a `@Injectable()` that `UsersRepository` took in its
 * constructor, and that broke every module providing `UsersRepository` on its
 * own — `TenantsModule` does — with `Nest can't resolve dependencies of the
 * UsersRepository`. The fix could have been to import `UsersModule` in each of
 * them; a function that takes the db client it should write through needs no
 * wiring at all, and the seed scripts, which run outside the Nest container
 * entirely, can call exactly the same implementation instead of carrying a
 * copy of the rule that drifts.
 */
export async function ensureIdentityForEmail(
  db: IdentityDb,
  rawEmail: string,
  passwordHashForNewIdentity: string,
): Promise<string> {
  const email = normalizeEmail(rawEmail);

  const existing = await db.identity.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) return existing.id;

  try {
    const created = await db.identity.create({
      data: { email, passwordHash: passwordHashForNewIdentity },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    /*
     * Two requests creating the first account for one email at the same moment.
     * The unique index refuses the second, which is the correct outcome — the
     * read above is an optimisation, not the guarantee.
     *
     * Recovered by re-reading rather than by matching the error's shape, for
     * the same reason the workspace-slug reservation does: Prisma 7 does not
     * populate `meta.target` on P2002, so shape-matching is matching on a
     * driver internal. The row is the contract.
     */
    const holder = await db.identity.findUnique({
      where: { email },
      select: { id: true },
    });
    if (holder) return holder.id;
    throw error;
  }
}

/**
 * Keep an identity's credential in step with the workspace account's.
 *
 * During the expand phase `User.passwordHash` and `Identity.passwordHash` both
 * exist, and authentication still reads the `User` copy. The moment login is
 * switched to read the identity, **every password changed since the backfill
 * would be wrong** — the person would be locked out by a change they made
 * themselves and watched succeed. So the mirror has to land first, and it has
 * to cover every path that sets a password, not the obvious ones.
 *
 * This is the **only** place permitted to write `identity.passwordHash` after
 * creation. `user-creation-links-identity.invariant.spec.ts` fails the build if
 * any caller writes it directly, because the paths that mint unguessable
 * placeholders must never reach a credential somebody is using — the difference
 * between "reset this person's password" and "silently lock them out of another
 * workspace" is which function you called.
 *
 * A user with no identity is a no-op rather than an error: `identityId` is
 * nullable until the contract phase, and a password reset is the wrong moment
 * to fail on a backfill gap. The gap itself is caught by the backfill's own
 * guard and by the contract migration.
 */
export async function mirrorPasswordToIdentity(
  db: IdentityDb,
  userId: string,
  passwordHash: string,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { identityId: true },
  });
  if (!user?.identityId) return;

  await db.identity.update({
    where: { id: user.identityId },
    data: { passwordHash, passwordChangedAt: new Date() },
  });
}

/**
 * The credential to check a sign-in against, and where it came from.
 *
 * During the expand phase both copies exist. The identity is authoritative
 * where it is present, because it is the one every password write now reaches
 * (WP-04) and the one a workspace-less sign-in will have to use (WP-06). The
 * `User` copy is the fallback, and it is not dead code: `identityId` is
 * nullable until the contract phase, so a row the backfill has not reached yet
 * must still be able to authenticate rather than being locked out by a
 * migration that has not run.
 *
 * Returning the source alongside the hash rather than just the hash is
 * deliberate — it is what lets the fallback be *counted* instead of merely
 * happening. A fallback nobody measures is how "temporary" becomes permanent.
 */
export async function resolveLoginCredential(
  db: IdentityDb,
  userId: string,
): Promise<{
  passwordHash: string;
  source: 'IDENTITY' | 'USER';
  identityId: string | null;
  identityLockedUntil: Date | null;
} | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      passwordHash: true,
      identityId: true,
      identity: {
        select: {
          id: true,
          passwordHash: true,
          status: true,
          lockedUntil: true,
        },
      },
    },
  });
  if (!user) return null;

  if (user.identity) {
    /*
     * A suspended identity cannot sign in anywhere, whatever any individual
     * workspace account says. `User.status` answers a different question — is
     * this account usable in *this* tenant — and both have to pass.
     */
    if (user.identity.status === 'SUSPENDED') return null;

    return {
      passwordHash: user.identity.passwordHash,
      source: 'IDENTITY',
      identityId: user.identity.id,
      identityLockedUntil: user.identity.lockedUntil,
    };
  }

  return {
    passwordHash: user.passwordHash,
    source: 'USER',
    identityId: null,
    identityLockedUntil: null,
  };
}

/**
 * Record a failed sign-in against the person, not only the workspace account.
 *
 * The per-tenant counter on `User` stays exactly as it is — a tenant's own
 * lockout policy governs sign-ins to that tenant, and it already works. This is
 * an **additional** global counter, never an alternative one: an attacker who
 * can name a tenant must not be able to escape a platform-level lock by doing
 * so, and one who cannot name a tenant still has to be stopped.
 *
 * Deliberately fixed rather than policy-driven. A global lock has no tenant to
 * take a policy from, and inventing "the strictest policy across the tenants
 * this person belongs to" would mean one workspace's settings silently
 * governing another's sign-ins.
 *
 * Never throws. Bookkeeping must not turn a wrong password into a 500.
 */
export const GLOBAL_ATTEMPTS_BEFORE_LOCK = 20;
export const GLOBAL_LOCK_MINUTES = 60;

export async function registerIdentityFailure(
  db: IdentityDb,
  identityId: string,
): Promise<void> {
  try {
    const identity = await db.identity.findUnique({
      where: { id: identityId },
      select: { failedLoginAttempts: true },
    });
    if (!identity) return;

    const attempts = identity.failedLoginAttempts + 1;
    const shouldLock = attempts >= GLOBAL_ATTEMPTS_BEFORE_LOCK;

    await db.identity.update({
      where: { id: identityId },
      data: shouldLock
        ? {
            // Reset with the lock, so one failure after expiry does not
            // immediately re-lock.
            failedLoginAttempts: 0,
            lockedUntil: new Date(Date.now() + GLOBAL_LOCK_MINUTES * 60_000),
          }
        : { failedLoginAttempts: attempts },
    });
  } catch {
    // Intentionally silent — see above.
  }
}

/** Clears the global counter after a correct password. */
export async function registerIdentitySuccess(
  db: IdentityDb,
  identityId: string,
): Promise<void> {
  try {
    await db.identity.update({
      where: { id: identityId },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
  } catch {
    // Intentionally silent — see above.
  }
}
