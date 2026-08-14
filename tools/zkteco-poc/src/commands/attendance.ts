/**
 * `attendance` — raw punches via ReadGeneralLogData + SSR_GetGeneralLogData
 * -> attendance.json.
 *
 * These are the device's own stored transactions, read straight off the K50 —
 * not the calculated report produced by the legacy V2011 desktop application,
 * and not the customer's exported Excel sheet. No punch is classified as
 * Present / Absent / Late / Early / Overtime, and the raw Verify / State /
 * WorkCode values are preserved without interpretation.
 *
 * Console output stays a summary: `ReadGeneralLogData` returns the device's
 * whole history (records from 2022 were observed on the reference K50), so
 * dumping every record would be unreadable.
 */

import { normalizePunches } from '../normalize/punches';
import { createOutputWriter, envelope } from '../output';
import { heading, keyValue } from '../report';
import { formatCount } from '../util/time';
import {
  checkExpectedSerial,
  resolveDeviceKey,
  runSession,
  toDeviceInfo,
  type CommandContext,
} from './shared';

const PREVIEW_ROWS = 10;

export async function runAttendance(context: CommandContext): Promise<number> {
  const { config, logger } = context;
  heading(logger, 'ZKTeco Raw Attendance Punches');

  const result = await runSession(context, { skipUsers: true, skipCapabilities: true });
  const info = toDeviceInfo(result, config);
  const deviceKey = resolveDeviceKey(info);

  const rawPunches = result.attendance ?? [];
  const normalised = normalizePunches(rawPunches, {
    deviceSerialNumber: deviceKey,
    machineNumber: config.machineNumber,
  });

  const saved =
    config.attendanceLimit > 0 && normalised.punches.length > config.attendanceLimit
      ? normalised.punches.slice(-config.attendanceLimit)
      : normalised.punches;

  logger.print(`Attendance records retrieved: ${formatCount(rawPunches.length)}`);
  logger.print(`Normalised punches:           ${formatCount(normalised.punches.length)}`);
  logger.print(
    `Distinct event fingerprints:  ${formatCount(normalised.distinctFingerprints)}` +
      (normalised.distinctFingerprints === normalised.punches.length
        ? ''
        : `  (${formatCount(
            normalised.punches.length - normalised.distinctFingerprints,
          )} collision(s) — see README)`),
  );
  if (normalised.skipped > 0) {
    logger.print(`Records skipped (unusable):   ${formatCount(normalised.skipped)}`);
  }
  if (normalised.earliestOccurredAtLocal && normalised.latestOccurredAtLocal) {
    logger.print(
      `Range (device local time):    ${normalised.earliestOccurredAtLocal} .. ${normalised.latestOccurredAtLocal}`,
    );
  }
  if (saved.length !== normalised.punches.length) {
    logger.print(`Saving the most recent ${formatCount(saved.length)} punch(es) (--limit).`);
  }

  const preview = saved.slice(0, PREVIEW_ROWS);
  if (preview.length > 0) {
    logger.print();
    logger.print(`First ${preview.length} normalised punch(es):`);
    keyValue(
      logger,
      preview.map((punch) => [
        punch.occurredAtLocal,
        `user ${punch.externalUserId}   verifyRaw=${punch.verificationModeRaw ?? '-'} stateRaw=${
          punch.punchStateRaw ?? '-'
        } workCodeRaw=${punch.workCodeRaw ?? '-'}`,
      ]),
      '  ',
    );
    logger.print();
    logger.print('  (raw device codes — semantic meaning deliberately not assigned)');
  }

  const serial = checkExpectedSerial(info, config);
  if (!serial.matches) {
    logger.print();
    logger.print(`WARNING: ${serial.message}`);
  }

  const writer = createOutputWriter({
    directory: config.outputDir,
    enabled: config.writeOutput,
    logger,
  });

  writer.write(
    'attendance.json',
    envelope(
      { deviceSerialNumber: info.serialNumber, host: config.host, port: config.port, machineNumber: config.machineNumber },
      {
        rawRecordCount: rawPunches.length,
        normalisedPunchCount: normalised.punches.length,
        savedPunchCount: saved.length,
        skippedRecordCount: normalised.skipped,
        distinctEventFingerprints: normalised.distinctFingerprints,
        earliestOccurredAtLocal: normalised.earliestOccurredAtLocal ?? null,
        latestOccurredAtLocal: normalised.latestOccurredAtLocal ?? null,
        stableTransactionIdAvailable: false,
        punches: saved,
      },
    ),
  );

  logger.print();
  return 0;
}
