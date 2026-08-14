/**
 * `probe-latest-log` — OPT-IN EXPERIMENT. Never part of the default POC.
 *
 * WHY THIS IS GATED
 * =================
 * `ReadLastestLogData` exists on the installed component, but what it *does* is
 * not established. COM type information describes a calling convention, not
 * behaviour: no amount of `ITypeInfo` inspection can prove that a method leaves
 * the device's read marker alone.
 *
 * That matters here specifically. The customer's Fingerprint Attendance System
 * V2011 runs against the same terminal, and the ZKTeco standalone SDK's
 * "newest records" family is exactly the kind of call that can consume or
 * advance a device-side pointer. If it does, one exploratory call from us could
 * silently break V2011's next incremental download — with no undo.
 *
 * So this command refuses to touch the device until a human has read the
 * signature evidence and explicitly accepted the risk with
 * `--confirm-read-only`. Run `npm run capabilities` first: it prints the exact
 * declaration of `ReadLastestLogData` and lists every marker/counter method the
 * component exposes, which is the evidence this decision needs.
 *
 * WHAT THE PROBE DOES WHEN UNLOCKED
 *   - calls `ReadLastestLogData(machineNumber)` exactly once
 *   - drains at most 20 records with the already-validated
 *     `SSR_GetGeneralLogData` getter
 *   - outputs raw values only, with no check-in/check-out interpretation
 *   - never clears logs, never sets device time, never touches users, never
 *     calls a marker or count setter
 *   - always disconnects and releases COM (the worker's `finally`)
 */

import { ZkemProgId } from '../device/constants';
import { createOutputWriter, envelope } from '../output';
import { heading, keyValue, runtimeRows } from '../report';
import { formatCount } from '../util/time';
import { runSession, toDeviceInfo, type CommandContext } from './shared';

const PROBE_RECORD_LIMIT = 20;

const BLOCKED_MESSAGE = `
This probe is BLOCKED by default.

'ReadLastestLogData' exists on the installed SDK, but its side effects are not
established. Type information proves a method's signature — it can never prove
that the method leaves the device's read marker untouched.

The risk is concrete: the customer's Fingerprint Attendance System V2011 reads
the same terminal. If this call consumes or advances a shared read marker, their
next incremental download could silently miss records, and there is no undo.

Before unlocking it:

  1. Run  npm run capabilities
     Read the printed declaration of ReadLastestLogData and the list of
     marker/counter methods the component exposes.
  2. Establish the semantics from evidence that does NOT involve experimenting
     on the customer's production terminal — the ZKTeco SDK documentation for
     this build, or a test against a spare/non-production ZKTeco device.
  3. Prefer testing on a spare device. If you must use the customer's terminal,
     agree it with them first and have V2011 closed.

When you have done that and accept the risk:

  npm run cli -- probe-latest-log --confirm-read-only

The probe then reads at most ${PROBE_RECORD_LIMIT} records and mutates nothing else.
`.trimStart();

export async function runProbeLatestLog(context: CommandContext): Promise<number> {
  const { config, logger } = context;
  heading(logger, 'ReadLastestLogData Probe (opt-in experiment)');

  if (!config.confirmReadOnly) {
    logger.print(BLOCKED_MESSAGE);
    logger.warn('probe.latestLog.blocked', { reason: 'missing --confirm-read-only' });
    // Not an error: refusing to run is the correct outcome of the default path.
    return 0;
  }

  logger.warn('probe.latestLog.acknowledged', {
    detail: 'operator passed --confirm-read-only; ReadLastestLogData will be invoked once',
    recordLimit: PROBE_RECORD_LIMIT,
  });

  logger.print('Acknowledged: --confirm-read-only supplied.');
  logger.print(`Calling ReadLastestLogData once, reading at most ${PROBE_RECORD_LIMIT} records.`);
  logger.print();

  const result = await runSession(context, {
    skipUsers: true,
    skipAttendance: true,
    probeLatestLog: true,
    probeLimit: PROBE_RECORD_LIMIT,
  });

  const info = toDeviceInfo(result, config);
  const probe = result.latestLogProbe;

  keyValue(logger, runtimeRows(result.runtime, ZkemProgId));
  logger.print();

  if (!probe) {
    logger.print('The worker returned no probe result.');
    return 1;
  }

  keyValue(logger, [
    ['Read method', probe.readMethod],
    ['Getter', probe.getMethod],
    ['Read succeeded', String(probe.readSucceeded)],
    ['Record limit', String(probe.recordLimit)],
    ['Records returned', formatCount(probe.recordsReturned)],
    ...(probe.error ? ([['Error', probe.error]] as Array<[string, string]>) : []),
  ]);

  if (probe.records.length > 0) {
    logger.print();
    logger.print('Raw records (no semantic interpretation applied):');
    keyValue(
      logger,
      probe.records.map((record) => [
        record.occurredAtLocal,
        `user ${record.externalUserId}   verifyRaw=${record.verificationModeRaw ?? '-'} stateRaw=${
          record.punchStateRaw ?? '-'
        } workCodeRaw=${record.workCodeRaw ?? '-'}`,
      ]),
      '  ',
    );
    logger.print();
    logger.print('  Timestamps are device-local wall clock. No timezone is implied.');
  }

  logger.print();
  logger.print('What this run does NOT tell you:');
  logger.print('  - whether ReadLastestLogData advanced a device-side read marker');
  logger.print('  - whether V2011 will now miss records on its next download');
  logger.print('  Confirm both by observing V2011 before/after, ideally on a spare device.');

  const writer = createOutputWriter({
    directory: config.outputDir,
    enabled: config.writeOutput,
    logger,
  });

  writer.write(
    'latest-log-probe.json',
    envelope(
      {
        deviceSerialNumber: info.serialNumber,
        host: config.host,
        port: config.port,
        machineNumber: config.machineNumber,
      },
      {
        probe,
        acknowledgement: '--confirm-read-only was supplied by the operator',
        caveat:
          'Side effects on any device-side read marker are UNKNOWN. This result does not establish that ReadLastestLogData is safe for scheduled use.',
      },
    ),
  );

  logger.print();
  return 0;
}
