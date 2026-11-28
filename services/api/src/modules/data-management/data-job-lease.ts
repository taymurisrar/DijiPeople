/**
 * What an executing job is allowed to ask about its own ownership.
 *
 * A worker owns a PROCESSING job only while it keeps renewing the lease. If the
 * process is paused long enough for the lease to lapse and another worker
 * recovers the job, the original run must STOP at its next safe point instead
 * of carrying on and applying rows the new owner will also apply.
 */
export interface JobLease {
  /**
   * Resolves while this run still owns the job; rejects with
   * `DataJobLeaseLostError` once it does not.
   *
   * Cheap on the normal path (an in-memory check). When the renewal timer has
   * not succeeded recently — which is exactly what a long process pause looks
   * like once the clock jumps forward — it re-confirms ownership against the
   * database before returning, so a resumed worker cannot apply a single further
   * row on the strength of a stale belief.
   */
  ensureHeld(): Promise<void>;
}

/** Thrown by an executor that noticed it no longer owns the job. */
export class DataJobLeaseLostError extends Error {
  constructor(jobId: string) {
    super(
      `The worker no longer owns data job ${jobId}; stopping without writing further.`,
    );
    this.name = 'DataJobLeaseLostError';
  }
}
