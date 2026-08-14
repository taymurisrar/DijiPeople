/**
 * `device-info` — device metadata and clock health -> device-info.json.
 */

import { ZkemProgId } from '../device/constants';
import { createOutputWriter, envelope } from '../output';
import { deviceInfoRows, heading, keyValue, printClock, runtimeRows } from '../report';
import {
  checkExpectedSerial,
  readClock,
  runSession,
  toDeviceInfo,
  type CommandContext,
} from './shared';

export async function runDeviceInfo(context: CommandContext): Promise<number> {
  const { config, logger } = context;
  heading(logger, 'ZKTeco Device Information');

  const result = await runSession(context, { skipUsers: true, skipAttendance: true });
  const info = toDeviceInfo(result, config);
  const clock = readClock(info, config);

  keyValue(logger, runtimeRows(result.runtime, ZkemProgId));
  logger.print();
  keyValue(logger, deviceInfoRows(info));

  logger.print();
  logger.print('Clock');
  logger.print('-----');
  printClock(logger, clock);

  const serial = checkExpectedSerial(info, config);
  if (!serial.matches) {
    logger.print();
    logger.print(`WARNING: ${serial.message}`);
    logger.warn('device.serial.mismatch', { detail: serial.message });
  }

  const writer = createOutputWriter({
    directory: config.outputDir,
    enabled: config.writeOutput,
    logger,
  });

  writer.write(
    'device-info.json',
    envelope(
      { deviceSerialNumber: info.serialNumber, host: config.host, port: config.port, machineNumber: config.machineNumber },
      {
        runtime: result.runtime,
        com: result.com,
        connection: result.connection,
        deviceInfo: info,
        clock,
        sdkCapabilities: result.capabilities,
        expectedSerialMatches: serial.matches,
        ...(serial.message ? { expectedSerialWarning: serial.message } : {}),
      },
    ),
  );

  logger.print();
  return 0;
}
