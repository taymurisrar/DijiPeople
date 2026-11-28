import { ensureIdentityForEmail } from './identity.service';
import type { PrismaService } from '../../common/prisma/prisma.service';

/**
 * `ensureIdentityForEmail` is a few lines of logic guarding one irreversible
 * mistake: writing a provisioning placeholder over somebody's real password.
 *
 * The database-backed proof that the resulting rows are correct is in
 * `identity-model.e2e-spec.ts`, `identity-backfill.e2e-spec.ts` and
 * `identity-concurrent-create.e2e-spec.ts` (BUG-3201). What is tested here is the
 * decision — which is cheaper to state with a double, and which is the part a
 * future edit is most likely to get wrong.
 */
function dbWith(parts: {
  findUnique: jest.Mock;
  executeRaw?: jest.Mock;
  update?: jest.Mock;
}) {
  return {
    identity: { findUnique: parts.findUnique, update: parts.update },
    $executeRaw: parts.executeRaw ?? jest.fn().mockResolvedValue(1),
  } as unknown as PrismaService;
}

/** The values a tagged-template `$executeRaw` call was given, after the SQL. */
const rawValues = (executeRaw: jest.Mock) =>
  (executeRaw.mock.calls[0] as unknown[]).slice(1);

describe('ensureIdentityForEmail', () => {
  it('creates an identity when nobody holds the address', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'identity-new' });
    const executeRaw = jest.fn().mockResolvedValue(1);
    const db = dbWith({ findUnique, executeRaw });

    const id = await ensureIdentityForEmail(
      db,
      '  Owner@Example.COM ',
      'hash-1',
    );

    expect(id).toBe('identity-new');
    // Normalised before the lookup and the write, because the login path has
    // always normalised before looking a user up. Storing the raw string would
    // make the global unique index protect a different key than the one
    // authentication resolves.
    expect(findUnique).toHaveBeenNthCalledWith(1, {
      where: { email: 'owner@example.com' },
      select: { id: true },
    });
    const [, email, hash, updatedAt] = rawValues(executeRaw);
    expect(email).toBe('owner@example.com');
    expect(hash).toBe('hash-1');
    expect(updatedAt).toBeInstanceOf(Date);
  });

  it('returns the existing identity and never touches its credential', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'identity-existing' });
    const executeRaw = jest.fn();
    const update = jest.fn();
    const db = dbWith({ findUnique, executeRaw, update });

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
     */
    expect(executeRaw).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('resolves a concurrent create by reading the winner, with no error to recover from (BUG-3201)', async () => {
    // First read: free. The insert then conflicts and does nothing. Second
    // read: the winner's row.
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'identity-winner' });
    const executeRaw = jest.fn().mockResolvedValue(0);
    const db = dbWith({ findUnique, executeRaw });

    const id = await ensureIdentityForEmail(db, 'race@example.com', 'hash-2');

    /*
     * The old code attempted `identity.create`, caught the unique violation and
     * re-read on the SAME client. Inside an interactive transaction (two of the
     * three callers) Postgres has already aborted the transaction at the failed
     * statement, so the recovery read failed with "current transaction is
     * aborted" and the caller's whole provisioning rolled back. `ON CONFLICT DO
     * NOTHING` raises nothing, so there is nothing to recover from and the
     * transaction stays usable.
     */
    expect(id).toBe('identity-winner');
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it('fails loudly when the row is neither created nor found', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const db = dbWith({ findUnique });

    await expect(
      ensureIdentityForEmail(db, 'ghost@example.com', 'hash-3'),
    ).rejects.toThrow(/could not be created or found/i);
  });

  it('propagates a genuine database failure instead of swallowing it', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const executeRaw = jest
      .fn()
      .mockRejectedValue(new Error('connection lost'));
    const db = dbWith({ findUnique, executeRaw });

    await expect(
      ensureIdentityForEmail(db, 'broken@example.com', 'hash-3'),
    ).rejects.toThrow('connection lost');
  });

  it('uses the transaction client it is given', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'identity-in-tx' });
    const executeRaw = jest.fn().mockResolvedValue(1);
    // Stands in for a client the caller did *not* pass; nothing may touch it.
    const outer = { findUnique: jest.fn(), executeRaw: jest.fn() };
    const tx = { identity: { findUnique }, $executeRaw: executeRaw } as never;
    const id = await ensureIdentityForEmail(tx, 'tx@example.com', 'hash-4');

    /*
     * Two of the three service callers create their `User` inside
     * `$transaction`. An identity written on the outer client survives a
     * rolled-back user creation as an orphan that nothing will ever claim, and
     * which then blocks that address from being provisioned again.
     */
    expect(id).toBe('identity-in-tx');
    expect(executeRaw).toHaveBeenCalled();
    expect(outer.executeRaw).not.toHaveBeenCalled();
    expect(outer.findUnique).not.toHaveBeenCalled();
  });
});
