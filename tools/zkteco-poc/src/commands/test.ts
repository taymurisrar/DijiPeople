/**
 * `test` — connectivity smoke test.
 *
 * Config -> x86 worker -> Connect_Net -> GetSerialNumber -> Disconnect.
 * Skips users, attendance and the SDK probe so it stays fast, and writes
 * nothing to disk. This is the command to hand to the customer first.
 */

import { describeConfig } from '../config';
import { ZkemProgId } from '../device/constants';
import { deviceInfoRows, heading, keyValue, runtimeRows } from '../report';
import { formatDuration } from '../util/time';
import { checkExpectedSerial, runSession, toDeviceInfo, type CommandContext } from './shared';

export async function runTest(context: CommandContext): Promise<number> {
  const { config, logger } = context;
  heading(logger, 'ZKTeco Connectivity Test');

  const described = describeConfig(config);
  keyValue(logger, [
    ['Host', config.host],
    ['Port', String(config.port)],
    ['Machine number', String(config.machineNumber)],
    ['Comm Key', described.commKeyConfigured ? 'configured (value not shown)' : 'none (0)'],
    ['Worker', config.workerPath],
  ]);

  const result = await runSession(context, {
    skipUsers: true,
    skipAttendance: true,
    skipCapabilities: true,
  });

  const info = toDeviceInfo(result, config);

  logger.print();
  keyValue(logger, runtimeRows(result.runtime, ZkemProgId));

  logger.print();
  logger.print(
    `Connection: SUCCESS (Connect_Net in ${formatDuration(result.connection?.connectDurationMs ?? 0)})`,
  );
  logger.print();
  logger.print('Device:');
  keyValue(logger, deviceInfoRows(info), '  ');

  const serial = checkExpectedSerial(info, config);
  if (!serial.matches) {
    logger.print();
    logger.print(`WARNING: ${serial.message}`);
    logger.warn('device.serial.mismatch', { detail: serial.message });
  } else if (config.expectedSerial) {
    logger.print();
    logger.print(`Expected serial ${config.expectedSerial}: MATCH`);
  }

  logger.print();
  logger.print(`Disconnect: ${result.connection?.disconnected ? 'SUCCESS' : 'NOT CONFIRMED'}`);
  logger.print();

  // A serial mismatch is a warning, not a failure — the connection itself worked.
  return 0;
}
