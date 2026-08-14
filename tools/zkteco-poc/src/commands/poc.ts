/**
 * `poc` — the full proof-of-concept run.
 *
 *   validate config -> x86 worker -> zkemkeeper.ZKEM.1 -> Connect_Net
 *     -> GetSerialNumber / device metadata / device time
 *     -> ReadAllUserID + SSR_GetAllUserInfo
 *     -> ReadGeneralLogData + SSR_GetGeneralLogData
 *     -> normalise -> fingerprint -> JSON -> summary
 *   -> Disconnect + release COM (always, including on failure)
 *
 * The whole device session lives inside one worker invocation, so the scorecard
 * below is derived from that single result rather than from separate round trips.
 * A failed run still prints a scorecard and still writes `poc-summary.json`, so
 * the customer has something concrete to send back.
 */

import { describeConfig } from '../config';
import { ZkemProgId } from '../device/constants';
import type { WorkerResult } from '../device/legacy-worker';
import { describeThrown, isZkPocError } from '../errors';
import { normalizePunches, type PunchNormalisationResult } from '../normalize/punches';
import { normalizeUsers } from '../normalize/users';
import { createOutputWriter, envelope } from '../output';
import {
  deviceInfoRows,
  heading,
  keyValue,
  overallStatus,
  printClock,
  printSteps,
  runtimeRows,
} from '../report';
import type {
  AttendanceDeviceInfo,
  DeviceClockReading,
  ExternalAttendanceUser,
  StepResult,
} from '../types';
import { formatCount } from '../util/time';
import {
  checkExpectedSerial,
  readClock,
  resolveDeviceKey,
  runSession,
  toDeviceInfo,
  type CommandContext,
} from './shared';

const STEP_NAMES = [
  'Configuration',
  'x86 runtime',
  'COM component',
  'Device connection',
  'Serial retrieval',
  'Device time',
  'User retrieval',
  'Attendance retrieval',
  'Normalization',
  'JSON output',
  'Disconnect',
] as const;

type StepName = (typeof STEP_NAMES)[number];

class StepRecorder {
  private readonly results = new Map<StepName, StepResult>();

  record(name: StepName, status: StepResult['status'], detail?: string, durationMs?: number): void {
    this.results.set(name, {
      name,
      status,
      ...(durationMs !== undefined ? { durationMs } : {}),
      ...(detail ? { detail } : {}),
    });
  }

  /** Every declared step, with anything untouched reported as SKIP. */
  all(): StepResult[] {
    return STEP_NAMES.map(
      (name) => this.results.get(name) ?? { name, status: 'SKIP' as const, detail: 'not reached' },
    );
  }
}

export async function runPoc(context: CommandContext): Promise<number> {
  const { config, logger } = context;
  heading(logger, 'DijiPeople ZKTeco POC');

  const steps = new StepRecorder();
  steps.record('Configuration', 'PASS', 'validated');
  keyValue(
    logger,
    Object.entries(describeConfig(config)).map(([key, value]) => [key, String(value)]),
  );

  let result: WorkerResult | undefined;
  let failure: unknown;

  try {
    result = await runSession(context, {});
  } catch (thrown) {
    failure = thrown;
  }

  let info: AttendanceDeviceInfo | undefined;
  let clock: DeviceClockReading | undefined;
  let users: ExternalAttendanceUser[] = [];
  let usersSkipped = 0;
  let punches: PunchNormalisationResult | undefined;
  let savedFiles: string[] = [];

  if (result) {
    steps.record(
      'x86 runtime',
      result.runtime.is64BitProcess ? 'FAIL' : 'PASS',
      `${result.runtime.processArchitecture} / ${result.runtime.framework}`,
    );
    steps.record(
      'COM component',
      result.com.instantiated ? 'PASS' : 'FAIL',
      result.com.progId,
    );
    steps.record(
      'Device connection',
      result.connection?.connected ? 'PASS' : 'FAIL',
      `Connect_Net in ${result.connection?.connectDurationMs ?? 0} ms`,
      result.connection?.connectDurationMs,
    );

    info = toDeviceInfo(result, config);

    const serial = checkExpectedSerial(info, config);
    if (!info.serialNumber) {
      steps.record('Serial retrieval', 'FAIL', 'GetSerialNumber returned nothing');
    } else if (!serial.matches) {
      steps.record('Serial retrieval', 'WARN', serial.message);
      logger.warn('device.serial.mismatch', { detail: serial.message });
    } else {
      steps.record(
        'Serial retrieval',
        'PASS',
        config.expectedSerial ? `${info.serialNumber} (matches expected)` : info.serialNumber,
      );
    }

    clock = readClock(info, config);
    steps.record(
      'Device time',
      clock.status === 'HEALTHY' ? 'PASS' : clock.status === 'WARNING' ? 'WARN' : 'WARN',
      clock.status === 'UNAVAILABLE'
        ? 'device did not report its clock'
        : `drift ${clock.driftSeconds}s (threshold ${clock.warnThresholdSeconds}s)`,
    );

    if (result.users) {
      const normalisedUsers = normalizeUsers(result.users);
      users = normalisedUsers.users;
      usersSkipped = normalisedUsers.skipped;
      steps.record('User retrieval', 'PASS', `${formatCount(users.length)} user(s)`);
    } else {
      steps.record('User retrieval', 'SKIP', 'not requested');
    }

    if (result.attendance) {
      steps.record(
        'Attendance retrieval',
        'PASS',
        `${formatCount(result.attendance.length)} raw record(s)`,
      );
    } else {
      steps.record('Attendance retrieval', 'SKIP', 'not requested');
    }

    const deviceKey = resolveDeviceKey(info);
    punches = normalizePunches(result.attendance ?? [], {
      deviceSerialNumber: deviceKey,
      machineNumber: config.machineNumber,
    });
    steps.record(
      'Normalization',
      'PASS',
      `${formatCount(users.length)} user(s), ${formatCount(punches.punches.length)} punch(es)`,
    );

    try {
      savedFiles = writeArtefacts({
        config,
        logger,
        result,
        info,
        clock,
        users,
        usersSkipped,
        punches,
      });
      steps.record('JSON output', 'PASS', `${savedFiles.length} file(s)`);
    } catch (thrown) {
      steps.record('JSON output', 'FAIL', describeThrown(thrown).message);
      if (!failure) failure = thrown;
    }

    steps.record(
      'Disconnect',
      result.connection?.disconnected ? 'PASS' : 'FAIL',
      result.connection?.disconnected
        ? 'session closed and COM released'
        : 'worker did not confirm disconnect',
    );
  } else {
    // The worker failed. Mark the step its error code points at, so the
    // scorecard shows where the run actually stopped.
    const code = isZkPocError(failure) ? failure.code : 'UNKNOWN_ERROR';
    const detail = describeThrown(failure).message;

    const failedStep: StepName =
      code === 'ARCHITECTURE_MISMATCH'
        ? 'x86 runtime'
        : code === 'SDK_NOT_AVAILABLE' || code === 'SDK_REGISTRATION_FAILED'
          ? 'COM component'
          : code === 'READ_USERS_FAILED'
            ? 'User retrieval'
            : code === 'READ_ATTENDANCE_FAILED'
              ? 'Attendance retrieval'
              : 'Device connection';

    steps.record(failedStep, 'FAIL', `${code}: ${detail}`);
  }

  const allSteps = steps.all();
  const status = overallStatus(allSteps);

  logger.print();
  if (result) {
    keyValue(logger, runtimeRows(result.runtime, ZkemProgId));
    logger.print();
  }
  printSteps(logger, allSteps);

  if (info) {
    logger.print();
    logger.print('Device:');
    keyValue(logger, deviceInfoRows(info), '  ');
  }

  if (clock) {
    logger.print();
    logger.print('Clock:');
    printClock(logger, clock);
  }

  logger.print();
  keyValue(logger, [
    ['Users', formatCount(users.length)],
    ['Attendance records', formatCount(punches?.punches.length ?? 0)],
    ['Distinct event fingerprints', formatCount(punches?.distinctFingerprints ?? 0)],
    [
      'Log range (device local)',
      punches?.earliestOccurredAtLocal && punches.latestOccurredAtLocal
        ? `${punches.earliestOccurredAtLocal} .. ${punches.latestOccurredAtLocal}`
        : '(none)',
    ],
    ['Stable transaction ID', 'NOT EXPOSED (fingerprint used instead)'],
    ['Biometric templates', 'NOT RETRIEVED'],
    ['Passwords', 'NOT STORED'],
    ['Device state modified', 'NO (read-only allowlist)'],
    ['Output files', savedFiles.length > 0 ? savedFiles.join(', ') : '(none written)'],
    ['Overall', status],
  ]);

  // The summary is written last so it also captures a failed run.
  try {
    const writer = createOutputWriter({
      directory: config.outputDir,
      enabled: config.writeOutput,
      logger,
    });
    writer.write(
      'poc-summary.json',
      envelope(
        {
          deviceSerialNumber: info?.serialNumber,
          host: config.host,
          port: config.port,
          machineNumber: config.machineNumber,
        },
        {
          overall: status,
          steps: allSteps,
          runtime: result?.runtime ?? null,
          com: result?.com ?? null,
          connection: result?.connection ?? null,
          deviceInfo: info ?? null,
          clock: clock ?? null,
          sdkCapabilities: result?.capabilities ?? null,
          counts: {
            users: users.length,
            skippedUsers: usersSkipped,
            rawAttendanceRecords: result?.attendance?.length ?? 0,
            normalisedPunches: punches?.punches.length ?? 0,
            skippedPunches: punches?.skipped ?? 0,
            distinctEventFingerprints: punches?.distinctFingerprints ?? 0,
          },
          attendanceRange: {
            earliestOccurredAtLocal: punches?.earliestOccurredAtLocal ?? null,
            latestOccurredAtLocal: punches?.latestOccurredAtLocal ?? null,
          },
          guarantees: {
            biometricDataRetrieved: false,
            devicePasswordsRetained: false,
            deviceStateModified: false,
            readOnly: true,
          },
          stableTransactionIdAvailable: false,
          ...(failure
            ? {
                failure: isZkPocError(failure)
                  ? failure.toJSON()
                  : { code: 'UNKNOWN_ERROR', ...describeThrown(failure) },
              }
            : {}),
        },
      ),
    );
  } catch (thrown) {
    logger.error('output.summary.failed', describeThrown(thrown));
  }

  logger.print();

  if (failure) throw failure;
  return status === 'FAIL' ? 1 : 0;
}

interface ArtefactInput {
  config: CommandContext['config'];
  logger: CommandContext['logger'];
  result: WorkerResult;
  info: AttendanceDeviceInfo;
  clock: DeviceClockReading;
  users: ExternalAttendanceUser[];
  usersSkipped: number;
  punches: PunchNormalisationResult;
}

function writeArtefacts(input: ArtefactInput): string[] {
  const { config, logger, info, result, punches } = input;

  const writer = createOutputWriter({
    directory: config.outputDir,
    enabled: config.writeOutput,
    logger,
  });

  const base = {
    deviceSerialNumber: info.serialNumber,
    host: config.host,
    port: config.port,
    machineNumber: config.machineNumber,
  };

  const savedPunches =
    config.attendanceLimit > 0 && punches.punches.length > config.attendanceLimit
      ? punches.punches.slice(-config.attendanceLimit)
      : punches.punches;

  const written: Array<string | undefined> = [
    writer.write(
      'device-info.json',
      envelope(base, {
        runtime: result.runtime,
        com: result.com,
        connection: result.connection,
        deviceInfo: info,
        clock: input.clock,
      }),
    ),
    writer.write(
      'users.json',
      envelope(base, {
        userCount: input.users.length,
        skippedRecordCount: input.usersSkipped,
        passwordsRetained: false,
        users: input.users,
      }),
    ),
    writer.write(
      'attendance.json',
      envelope(base, {
        rawRecordCount: result.attendance?.length ?? 0,
        normalisedPunchCount: punches.punches.length,
        savedPunchCount: savedPunches.length,
        skippedRecordCount: punches.skipped,
        distinctEventFingerprints: punches.distinctFingerprints,
        earliestOccurredAtLocal: punches.earliestOccurredAtLocal ?? null,
        latestOccurredAtLocal: punches.latestOccurredAtLocal ?? null,
        stableTransactionIdAvailable: false,
        punches: savedPunches,
      }),
    ),
  ];

  if (result.capabilities) {
    written.push(
      writer.write(
        'sdk-capabilities.json',
        envelope(base, {
          progId: result.com.progId,
          clsid: result.com.clsid ?? null,
          capabilities: result.capabilities,
          note: 'Method presence is read from COM type information. It does not prove firmware support.',
        }),
      ),
    );
  }

  return written.filter((path): path is string => typeof path === 'string');
}
