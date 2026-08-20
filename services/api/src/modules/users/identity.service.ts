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
