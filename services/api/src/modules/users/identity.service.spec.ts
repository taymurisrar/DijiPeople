import { ensureIdentityForEmail } from './identity.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

/**
 * `ensureIdentityForEmail` is three lines of logic guarding one irreversible
 * mistake: writing a provisioning placeholder over somebody's real password.
 *
 * The database-backed proof that the resulting rows are correct is in
 * `identity-model.e2e-spec.ts` and `identity-backfill.e2e-spec.ts`. What is
 * tested here is the decision — which is cheaper to state with a double, and
 * which is the part a future edit is most likely to get wrong.
 */
function dbWith(identity: {
  findUnique: jest.Mock;
  create: jest.Mock;
  update?: jest.Mock;
}) {
  return { identity } as unknown as PrismaService;
}

describe('ensureIdentityForEmail', () => {
  it('creates an identity when nobody holds the address', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({ id: 'identity-new' });
    const db = dbWith({ findUnique, create });

    const id = await ensureIdentityForEmail(
      db,
      '  Owner@Example.COM ',
      'hash-1',
    );

    expect(id).toBe('identity-new');
    // Normalised before both the lookup and the write, because the login path
    // has always normalised before looking a user up. Storing the raw string
    // would make the global unique index protect a different key than the one
    // authentication resolves.
    expect(findUnique).toHaveBeenCalledWith({
      where: { email: 'owner@example.com' },
      select: { id: true },
    });
    expect(create).toHaveBeenCalledWith({
      data: { email: 'owner@example.com', passwordHash: 'hash-1' },
      select: { id: true },
    });
  });

  it('returns the existing identity and never touches its credential', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'identity-existing' });
    const create = jest.fn();
    const update = jest.fn();
    const db = dbWith({ findUnique, create, update });

    const id = await ensureIdentityForEmail(
      db,
      'owner@example.com',
      'placeholder-nobody-knows',
    );

    expect(id).toBe('identity-existing');

    /*
     * The assertion this file exists for. Both provisioning paths mint an
     * unguessable placeholder for the `User` row they are about to create; if
     * that placeholder reached an identity that already had a real password,
     * the person would be locked out of the workspace they already had — by an
     * action taken on their behalf, in another tenant, that they never saw.
     *
     * It is also what makes OD-01's "reuses its credentials with no activation
     * step" true rather than aspirational.
     */
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('resolves a concurrent create by reading the row, not the error', async () => {
    // First read: free. Then the unique index refuses us. Second read: taken.
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'identity-winner' });
    const create = jest
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );
    const db = dbWith({ findUnique, create });

    const id = await ensureIdentityForEmail(db, 'race@example.com', 'hash-2');

    /*
     * The pre-check is an optimisation; the unique index is the guarantee. The
     * loser of the race takes the winner's row rather than failing the request,
     * which is what makes two simultaneous first-signups for one address
     * produce one person instead of an error.
     *
     * Recovered by re-reading rather than by matching the error's shape:
     * Prisma 7 does not populate `meta.target` on P2002, so shape-matching is
     * matching on a driver internal. The row is the contract.
     */
    expect(id).toBe('identity-winner');
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('rethrows when the create failed for any other reason', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockRejectedValue(new Error('connection lost'));
    const db = dbWith({ findUnique, create });

    /*
     * Without this the recovery above swallows every failure: a dropped
     * connection would look like "somebody else created it", the second read
     * would also fail or return null, and the caller would get a confusing
     * error far from the cause.
     */
    await expect(
      ensureIdentityForEmail(db, 'broken@example.com', 'hash-3'),
    ).rejects.toThrow('connection lost');
  });

  it('uses the transaction client it is given', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({ id: 'identity-in-tx' });
    // Stands in for a client the caller did *not* pass; nothing may touch it.
    const outer = {
      findUnique: jest.fn(),
      create: jest.fn(),
    };
    const tx = { identity: { findUnique, create } } as never;
    const id = await ensureIdentityForEmail(tx, 'tx@example.com', 'hash-4');

    /*
     * Two of the three service callers create their `User` inside
     * `$transaction`. An identity written on the outer client survives a
     * rolled-back user creation as an orphan that nothing will ever claim, and
     * which then blocks that address from being provisioned again.
     */
    expect(id).toBe('identity-in-tx');
    expect(create).toHaveBeenCalled();
    expect(outer.create).not.toHaveBeenCalled();
    expect(outer.findUnique).not.toHaveBeenCalled();
  });
});
